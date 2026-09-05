"use client";

/**
 * Client for the visual-assistance endpoints.
 *
 * The backend returns *instructions* — text, an optional spoken string, and a
 * vibration pattern — and this hook executes them, because speech synthesis and
 * the vibration motor only exist in the browser.
 *
 * Two rules this module holds to, both because the users are blind or
 * low-vision riders rather than because a linter asked:
 *
 * 1. **Text is never conditional.** The backend always sends `text` even when
 *    speech is disabled, and the caller always renders it. Audio is an
 *    addition to the visible state, never a replacement for it — a rider with
 *    the volume off, or on a device with no speech voices installed, must still
 *    get the message.
 * 2. **Nothing is assumed present.** `speechSynthesis` is absent in some
 *    browsers and `navigator.vibrate` is unsupported on desktop and all of iOS
 *    Safari. Both are feature-detected, and an unsupported motor degrades to
 *    text rather than throwing.
 */

import { useCallback, useRef, useState } from "react";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export interface AssistancePreferences {
  button_voice: boolean;
  voice_navigation: boolean;
  vibration_alerts: boolean;
}

export interface AssistanceFeedback {
  text: string;
  speech: string | null;
  vibration_ms: number[];
  simulated: boolean;
}

export type AlertEvent = "bus_approaching" | "destination_approaching";

export const DEFAULT_PREFERENCES: AssistancePreferences = {
  button_voice: true,
  voice_navigation: true,
  vibration_alerts: true,
};

/** Number of scripted steps the backend exposes (DEMO_STEPS). */
export const NAVIGATION_STEPS = 3;

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function vibrationSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function speak(phrase: string): void {
  if (!speechSupported()) return;
  try {
    // Cancel first: queued utterances otherwise stack up and the rider hears
    // the previous instruction before the current one, which is worse than
    // silence when the message is "turn left".
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  } catch {
    /* a missing voice pack must not break the visible feedback */
  }
}

function vibrate(pattern: number[]): void {
  if (!pattern.length || !vibrationSupported()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* unsupported or blocked by the platform; text still shows */
  }
}

export function useVisualAssistance(preferences: AssistancePreferences) {
  const [feedback, setFeedback] = useState<AssistanceFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = useRef(0);

  // `object` rather than Record<string, unknown>: the typed preference and
  // request interfaces have no index signature, so the stricter type rejects
  // them at the call sites below.
  const call = useCallback(
    async (path: string, body: object) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`${BASE}/api/v1/visual-assistance${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const data: AssistanceFeedback = await res.json();
        setFeedback(data);
        if (data.speech) speak(data.speech);
        vibrate(data.vibration_ms);
        return data;
      } catch {
        // Surface the failure in text rather than leaving a rider waiting on a
        // cue that is never coming.
        setError("Could not reach the assistance service.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const requestAssistance = useCallback(
    () => call("/request-assistance", preferences),
    [call, preferences],
  );

  const nextNavigationStep = useCallback(() => {
    const current = step.current;
    step.current = (current + 1) % NAVIGATION_STEPS;
    return call("/demo/navigation", { step: current, preferences });
  }, [call, preferences]);

  const triggerAlert = useCallback(
    (event: AlertEvent) => call("/demo/alerts", { event, preferences }),
    [call, preferences],
  );

  const resetNavigation = useCallback(() => {
    step.current = 0;
  }, []);

  return {
    feedback,
    busy,
    error,
    requestAssistance,
    nextNavigationStep,
    triggerAlert,
    resetNavigation,
  };
}
