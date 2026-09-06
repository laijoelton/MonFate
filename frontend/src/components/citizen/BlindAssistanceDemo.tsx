"use client";

/**
 * Scripted voice-navigation demo for blind and low-vision riders.
 *
 * Adopted from the `youdi` branch, replacing the earlier VisualAssistancePanel.
 * Two things it does that the old panel did not:
 *
 * 1. **Destination selection.** The rider picks where they are going before
 *    navigation starts, so the spoken cues name a real place instead of
 *    narrating an abstract sequence of steps.
 * 2. **Audible vibration fallback** (`playVibrationSound`). `navigator.vibrate`
 *    is a no-op on desktop and on all of iOS Safari, so on those platforms the
 *    haptic channel is simply invisible. Rendering the same pattern as a low
 *    square wave keeps the alert perceivable — the pattern is still conveyed,
 *    just through a different sense.
 *
 * The visible `aria-live` message is never conditional on speech or vibration
 * succeeding: a rider with the volume down, no voice pack, or no vibration
 * motor still gets every cue as text.
 */

import { useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

/** `speechSynthesis` is absent in some browsers; every use goes through these. */
function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function cancelSpeech() {
  if (!speechAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* teardown must not throw */
  }
}

const DESTINATIONS = [
  "Cyberjaya Transport Terminal",
  "Tamarind Square",
  "MRT Cyberjaya City Centre",
];

type Feedback = {
  text: string;
  speech: string | null;
  vibration_ms: number[];
};

function speak(text: string) {
  if (!speechAvailable()) return;

  cancelSpeech();

  const message = new SpeechSynthesisUtterance(text);
  message.lang = "en-US";
  message.rate = 0.9;

  window.speechSynthesis.speak(message);
}

export function BlindAssistanceDemo() {
  const [selectedDestination, setSelectedDestination] = useState("");
  const [running, setRunning] = useState(false);
  const [currentMessage, setCurrentMessage] = useState(
    "Choose a destination to begin.",
  );
  const [error, setError] = useState("");

  const timerIds = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  function clearTimers() {
    timerIds.current.forEach((timer) => {
      window.clearTimeout(timer);
    });

    timerIds.current = [];
  }

  function prepareAlertSound() {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    void audioContextRef.current.resume();
  }

  function playVibrationSound(pattern: number[]) {
    const audioContext = audioContextRef.current;

    if (!audioContext) return 0;

    let startTime = audioContext.currentTime;
    let totalDuration = 0;

    pattern.forEach((duration, index) => {
      const durationInSeconds = duration / 1000;

      // Even positions are vibration periods.
      // Odd positions are pauses.
      if (index % 2 === 0) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "square";
        oscillator.frequency.value = 120;
        gain.gain.value = 0.06;

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start(startTime);
        oscillator.stop(startTime + durationInSeconds);
      }

      startTime += durationInSeconds;
      totalDuration += duration;
    });

    return totalDuration;
  }

  async function playDirection(step: number) {
    try {
      const response = await fetch(
        `${API_URL}/api/v1/visual-assistance/demo/navigation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            step,
            preferences: {
              button_voice: true,
              voice_navigation: true,
              vibration_alerts: true,
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Navigation request failed");
      }

      const feedback: Feedback = await response.json();

      setCurrentMessage(feedback.text);
      setError("");
      speak(feedback.speech ?? feedback.text);
    } catch {
      clearTimers();
      setRunning(false);
      setError(
        "Could not load directions. Check that the backend is running.",
      );
    }
  }

  async function playAutomaticAlert(
    event: "bus_approaching" | "destination_approaching",
  ) {
    try {
      const response = await fetch(
        `${API_URL}/api/v1/visual-assistance/demo/alerts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event,
            preferences: {
              button_voice: true,
              voice_navigation: true,
              vibration_alerts: true,
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Alert request failed");
      }

      const feedback: Feedback = await response.json();

      const alertText =
        event === "destination_approaching"
          ? `You have arrived at ${selectedDestination}.`
          : feedback.text;

      setCurrentMessage(alertText);
      setError("");

      // Real vibration on supported Android devices.
      if (feedback.vibration_ms.length > 0) {
        navigator.vibrate?.(feedback.vibration_ms);
      }

      // Audible vibration simulation for laptops.
      const soundDuration = playVibrationSound(feedback.vibration_ms);

      const speechTimer = window.setTimeout(() => {
        speak(alertText);
      }, soundDuration + 150);

      timerIds.current.push(speechTimer);
    } catch {
      clearTimers();
      setRunning(false);
      setError("Could not play the automatic alert.");
    }
  }

  function chooseDestination(destination: string) {
    setSelectedDestination(destination);
    setCurrentMessage(
      `${destination} selected. Press Start Voice Navigation.`,
    );
    setError("");

    speak(
      `${destination} selected. Press Start Voice Navigation to confirm and begin.`,
    );
  }

  function startNavigation() {
    if (!selectedDestination) {
      setError("Please select a destination first.");
      speak("Please select a destination first.");
      return;
    }

    clearTimers();
    cancelSpeech();
    navigator.vibrate?.(0);
    prepareAlertSound();

    setRunning(true);
    setError("");
    setCurrentMessage(`Navigating to ${selectedDestination}.`);

    speak(
      `${selectedDestination} confirmed. Voice navigation started.`,
    );

    const firstDirection = window.setTimeout(() => {
      void playDirection(0);
    }, 1500);

    const secondDirection = window.setTimeout(() => {
      void playDirection(1);
    }, 6000);

    const thirdDirection = window.setTimeout(() => {
      void playDirection(2);
    }, 10500);

    const busAlert = window.setTimeout(() => {
      void playAutomaticAlert("bus_approaching");
    }, 15000);

    const destinationAlert = window.setTimeout(() => {
      void playAutomaticAlert("destination_approaching").finally(() => {
        setRunning(false);
      });
    }, 21000);

    timerIds.current.push(
      firstDirection,
      secondDirection,
      thirdDirection,
      busAlert,
      destinationAlert,
    );
  }

  function stopNavigation() {
    clearTimers();
    cancelSpeech();
    navigator.vibrate?.(0);

    setRunning(false);
    setCurrentMessage("Voice navigation stopped.");
    speak("Voice navigation stopped.");
  }

  useEffect(() => {
    return () => {
      timerIds.current.forEach((timer) => {
        window.clearTimeout(timer);
      });

      cancelSpeech();
      navigator.vibrate?.(0);

      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div className="dashboard-card side-panel-card">
      <div className="side-card-header">
        <div className="card-eyebrow">VOICE GUIDANCE</div>
        <h3>Blind Assistance</h3>
      </div>

      <p className="small muted" style={{ margin: "8px 0 16px" }}>
        Choose a destination and press Start once. Directions and alerts then
        play automatically.
      </p>

      <fieldset
        disabled={running}
        style={{ border: 0, margin: 0, padding: 0 }}
      >
        <legend className="card-eyebrow" style={{ marginBottom: 6 }}>
          CHOOSE YOUR DESTINATION
        </legend>

        <div style={{ display: "grid", gap: 8 }}>
          {DESTINATIONS.map((destination) => {
            const selected = selectedDestination === destination;

            return (
              <button
                key={destination}
                type="button"
                // Speaks its own confirmation below, so the global button-voice
                // layer must not announce the label on top of it.
                data-voice-manual
                aria-pressed={selected}
                onClick={() => chooseDestination(destination)}
                className={selected ? "primary-button" : "secondary-button"}
                style={{ minHeight: 52, justifyContent: "flex-start" }}
              >
                {destination}
              </button>
            );
          })}
        </div>
      </fieldset>

      <p
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        style={{
          margin: "16px 0",
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid var(--border, #d4d4d8)",
          background: "var(--surface-muted, #f4f4f5)",
          fontWeight: 600,
        }}
      >
        {currentMessage}
      </p>

      {error && (
        <p role="alert" className="small" style={{ color: "#dc2626" }}>
          {error}
        </p>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        <button
          type="button"
          data-voice-manual
          onClick={startNavigation}
          disabled={running || !selectedDestination}
          className="primary-button"
          style={{ minHeight: 52 }}
        >
          {running
            ? "Navigation running"
            : selectedDestination
              ? "Start voice navigation"
              : "Choose a destination first"}
        </button>

        <button
          type="button"
          data-voice-manual
          onClick={stopNavigation}
          disabled={!running}
          className="secondary-button"
          style={{ minHeight: 52 }}
        >
          Stop navigation
        </button>
      </div>

      <p className="small muted" style={{ marginTop: 12 }}>
        Bus and destination alerts are simulated for this demonstration.
      </p>
    </div>
  );
}
