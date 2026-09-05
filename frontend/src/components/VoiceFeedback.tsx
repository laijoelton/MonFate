"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const VoiceContext = createContext<(message: string) => void>(() => {});
const STORAGE_KEY = "monfate.buttonVoice";

export const useVoiceFeedback = () => useContext(VoiceContext);

/** One capture boundary covers native buttons, including dynamically added ones.
 * Custom role=button controls announce from their own activation handlers.
 */
export function VoiceFeedback({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const enabledRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
      try {
        const saved = localStorage.getItem(STORAGE_KEY) === "true";
        enabledRef.current = saved;
        setEnabled(saved);
      } catch { /* Storage may be unavailable; the switch still works. */ }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      enabledRef.current = false;
      utteranceRef.current = null;
      window.speechSynthesis?.cancel();
    };
  }, []);

  const announce = useCallback((message: string) => {
    if (!enabledRef.current || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    try {
      // Discard obsolete feedback when the user activates another control.
      utteranceRef.current = null;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = document.documentElement.lang || "en";
      utteranceRef.current = utterance;
      utterance.onerror = (event) => {
        if (utteranceRef.current !== utterance) return;
        if (event.error !== "canceled" && event.error !== "interrupted") {
          setError("Voice could not play. Check your browser audio settings or use a screen reader.");
        }
        utteranceRef.current = null;
      };
      utterance.onend = () => {
        if (utteranceRef.current === utterance) utteranceRef.current = null;
      };
      setError("");
      window.speechSynthesis.speak(utterance);
    } catch {
      setError("Voice is unavailable. Button actions still work.");
    }
  }, []);

  return (
    <VoiceContext.Provider value={announce}>
      <div
        className="flex min-h-full flex-1 flex-col"
        onClickCapture={(event) => {
          if (!(event.target instanceof Element)) return;
          const button = event.target.closest("button");
          if (!button || button.disabled || button.getAttribute("aria-disabled") === "true" || button.hasAttribute("data-voice-manual")) return;
          const label = button.getAttribute("aria-label") || button.textContent?.trim();
          if (!label) return;
          const pressed = button.getAttribute("aria-pressed");
          announce(button.getAttribute("data-voice-message") || (
            pressed === null ? `${label}.` : `${label}. ${pressed === "true" ? "Off" : "On"}.`
          ));
        }}
      >
        <section aria-label="Voice feedback settings" className="border-b border-slate-700 px-6 py-3 text-sm text-slate-200">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
            <button
              type="button"
              data-voice-manual
              aria-pressed={enabled}
              disabled={supported !== true}
              aria-describedby="voice-help"
              className="rounded-lg border border-accent px-4 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
              onClick={() => {
                const next = !enabled;
                enabledRef.current = next;
                setEnabled(next);
                try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* Optional persistence. */ }
                if (next) announce("Button voice feedback on.");
                else {
                  utteranceRef.current = null;
                  window.speechSynthesis?.cancel();
                  setError("");
                }
              }}
            >
              Speak buttons: {enabled ? "On" : "Off"}
            </button>
            <p id="voice-help" className="text-slate-400">
              {supported === false ? "Voice is unavailable in this browser." : "Read button actions aloud. Turn off if you use a screen reader."}
            </p>
            {error && <p role="status" className="text-warn">{error}</p>}
          </div>
        </section>
        {children}
      </div>
    </VoiceContext.Provider>
  );
}
