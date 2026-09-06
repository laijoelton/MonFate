"use client";

import { useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

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
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

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
    window.speechSynthesis.cancel();
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
    window.speechSynthesis.cancel();
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

      window.speechSynthesis.cancel();
      navigator.vibrate?.(0);

      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <section className="glass space-y-5 rounded-2xl p-5">
      <div>
        <h2 className="text-lg font-bold">Blind Assistance Demo</h2>

        <p className="text-sm text-slate-400">
          Choose a destination and press Start once. Directions and alerts
          will happen automatically.
        </p>
      </div>

      <fieldset className="space-y-3" disabled={running}>
        <legend className="text-sm font-semibold text-slate-200">
          Choose your destination
        </legend>

        <p className="text-xs text-slate-400">
          Use a screen reader, keyboard, touch, or mouse to select a
          destination.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {DESTINATIONS.map((destination) => {
            const selected = selectedDestination === destination;

            return (
              <button
                key={destination}
                type="button"
                data-voice-manual
                aria-pressed={selected}
                onClick={() => chooseDestination(destination)}
                className={`min-h-16 rounded-xl border px-4 py-3 text-left font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 ${
                  selected
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-slate-600 text-slate-100"
                }`}
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
        className="rounded-xl border border-accent bg-accent/10 p-4 text-lg font-semibold"
      >
        {currentMessage}
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          data-voice-manual
          onClick={startNavigation}
          disabled={running || !selectedDestination}
          className="min-h-14 rounded-xl bg-accent px-5 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running
            ? "Navigation Running"
            : selectedDestination
              ? "Start Voice Navigation"
              : "Choose a Destination First"}
        </button>

        <button
          type="button"
          data-voice-manual
          onClick={stopNavigation}
          disabled={!running}
          className="min-h-14 rounded-xl border border-slate-500 px-5 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Stop Navigation
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Bus and destination alerts are simulated automatically during this
        demonstration.
      </p>
    </section>
  );
}