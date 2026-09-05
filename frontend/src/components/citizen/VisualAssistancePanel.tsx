"use client";

/**
 * Visual-assistance controls for blind and low-vision riders.
 *
 * Every cue the backend returns is rendered as text in an `aria-live` region
 * regardless of whether speech or vibration fired, so the panel stays usable
 * with the volume off, on a desktop with no vibration motor, or in a browser
 * without speech voices. Unsupported capabilities are stated plainly rather
 * than failing silently — a rider should know the phone will not buzz, not
 * discover it by missing their stop.
 */

import { useEffect, useState } from "react";
import { Bell, Footprints, Hand, Volume2, VolumeX } from "lucide-react";
import {
  DEFAULT_PREFERENCES,
  speechSupported,
  useVisualAssistance,
  vibrationSupported,
  type AssistancePreferences,
} from "@/lib/useVisualAssistance";

const TOGGLES: { key: keyof AssistancePreferences; label: string; hint: string }[] = [
  { key: "button_voice", label: "Speak button feedback", hint: "Confirms taps out loud" },
  { key: "voice_navigation", label: "Spoken directions", hint: "Reads each step aloud" },
  { key: "vibration_alerts", label: "Vibration alerts", hint: "Buzzes for bus and destination" },
];

export function VisualAssistancePanel() {
  const [preferences, setPreferences] = useState<AssistancePreferences>(DEFAULT_PREFERENCES);
  const [support, setSupport] = useState({ speech: true, vibration: true });

  // Capability detection runs after mount: `navigator` and `speechSynthesis`
  // do not exist during server rendering.
  useEffect(() => {
    const id = window.setTimeout(
      () => setSupport({ speech: speechSupported(), vibration: vibrationSupported() }),
      0,
    );
    return () => window.clearTimeout(id);
  }, []);

  const assist = useVisualAssistance(preferences);

  const toggle = (key: keyof AssistancePreferences) =>
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="dashboard-card side-panel-card">
      <div className="side-card-header">
        <div className="card-eyebrow">VISUAL ASSISTANCE</div>
        <h3>Audio &amp; Haptic Guidance</h3>
      </div>

      <p className="small muted" style={{ margin: "8px 0 16px" }}>
        Spoken directions and vibration cues for riders with low vision. Every
        cue is also shown as text below.
      </p>

      <div className="checkbox-list">
        {TOGGLES.map(({ key, label, hint }) => (
          <label key={key}>
            <input type="checkbox" checked={preferences[key]} onChange={() => toggle(key)} />
            <span>
              {label}
              <small style={{ display: "block", opacity: 0.7 }}>{hint}</small>
            </span>
          </label>
        ))}
      </div>

      {(!support.speech || !support.vibration) && (
        <p className="small muted" style={{ marginTop: 12 }}>
          {!support.speech && "This browser has no speech voices. "}
          {!support.vibration && "This device has no vibration motor. "}
          Text cues below still work.
        </p>
      )}

      <div className="stack-list" style={{ marginTop: 16, gap: 8 }}>
        <button
          type="button"
          data-voice-manual
          className="primary-btn"
          onClick={() => void assist.requestAssistance()}
          disabled={assist.busy}
        >
          <Hand size={16} aria-hidden /> Request boarding assistance
        </button>

        <button
          type="button"
          data-voice-manual
          className="ghost-btn"
          onClick={() => void assist.nextNavigationStep()}
          disabled={assist.busy}
        >
          <Footprints size={16} aria-hidden /> Next walking direction
        </button>

        <button
          type="button"
          data-voice-manual
          className="ghost-btn"
          onClick={() => void assist.triggerAlert("bus_approaching")}
          disabled={assist.busy}
        >
          <Bell size={16} aria-hidden /> Bus approaching alert
        </button>

        <button
          type="button"
          data-voice-manual
          className="ghost-btn"
          onClick={() => void assist.triggerAlert("destination_approaching")}
          disabled={assist.busy}
        >
          <Bell size={16} aria-hidden /> Destination approaching alert
        </button>
      </div>

      {/* The authoritative output. Announced to screen readers and always
          visible, whether or not audio or haptics were available. */}
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="stop-option"
        style={{ marginTop: 16, cursor: "default", minHeight: 56 }}
      >
        <span>
          <strong>
            {assist.error
              ? "Assistance unavailable"
              : (assist.feedback?.text ?? "No cue yet")}
          </strong>
          <small>
            {assist.error
              ? assist.error
              : assist.feedback
                ? [
                    assist.feedback.speech ? "spoken" : "silent",
                    assist.feedback.vibration_ms.length
                      ? `vibrated ${assist.feedback.vibration_ms.join("–")}ms`
                      : "no vibration",
                    assist.feedback.simulated ? "simulated" : "live",
                  ].join(" · ")
                : "Choose an action above."}
          </small>
        </span>
        {assist.feedback?.speech ? (
          <Volume2 size={16} aria-hidden />
        ) : (
          <VolumeX size={16} aria-hidden />
        )}
      </div>
    </div>
  );
}
