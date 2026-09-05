"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { CYBERJAYA_ROUTES } from "@/lib/cyberjaya-routes";
import { isGoogleRoutesConfigured } from "@/lib/google-routes";
import type { ActiveIncident } from "@/lib/accident-simulation";

interface AccidentSimulatorPanelProps {
  incidents: Record<string, ActiveIncident>;
  onTrigger: (routeId: string, stopId: string, description: string) => void;
  onClear: (routeId: string) => void;
}

export function AccidentSimulatorPanel({ incidents, onTrigger, onClear }: AccidentSimulatorPanelProps) {
  const [routeId, setRouteId] = useState(CYBERJAYA_ROUTES[0].route_id);
  const [stopId, setStopId] = useState(CYBERJAYA_ROUTES[0].stops[0]?.id ?? "");
  const [description, setDescription] = useState("Accident reported near this stop");

  const selectedRoute = CYBERJAYA_ROUTES.find((r) => r.route_id === routeId) ?? CYBERJAYA_ROUTES[0];

  const handleTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    onTrigger(routeId, stopId, description);
  };

  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <AlertTriangle aria-hidden className="h-4 w-4" />
<<<<<<< HEAD
        Simulate accident (real routing + ML fallback demo)
=======
        Simulate accident (route optimization demo)
>>>>>>> 9e66937e642b429933a10f99a5aefeadea03f6d9
      </h2>

      {!isGoogleRoutesConfigured && (
        <p className="text-xs text-amber-800 dark:text-amber-300">
<<<<<<< HEAD
          <code className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> isn't set, so detours will be computed by
          the on-device ML fallback instead of live Google routing — still real, just coarser.
=======
          Add <code className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to see a real computed detour —
          without it, the incident shows but buses stay on the normal route.
>>>>>>> 9e66937e642b429933a10f99a5aefeadea03f6d9
        </p>
      )}

      <form onSubmit={handleTrigger} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select
          value={routeId}
          onChange={(e) => {
            setRouteId(e.target.value);
            const newRoute = CYBERJAYA_ROUTES.find((r) => r.route_id === e.target.value);
            setStopId(newRoute?.stops[0]?.id ?? "");
          }}
          className="rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm dark:border-amber-700 dark:bg-zinc-900"
        >
          {CYBERJAYA_ROUTES.map((route) => (
            <option key={route.route_id} value={route.route_id}>
              {route.route_id} · {route.name}
            </option>
          ))}
        </select>

        <select
          value={stopId}
          onChange={(e) => setStopId(e.target.value)}
          className="rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm dark:border-amber-700 dark:bg-zinc-900"
        >
          {selectedRoute.stops.map((stop) => (
            <option key={stop.id} value={stop.id}>
              Near {stop.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Trigger accident
        </button>
      </form>

      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description shown on the map"
        className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm dark:border-amber-700 dark:bg-zinc-900"
      />

      {Object.values(incidents).length > 0 && (
        <ul className="space-y-1.5 pt-1">
<<<<<<< HEAD
          {Object.values(incidents).map(({ incident, detour, detourSource }) => (
=======
          {Object.values(incidents).map(({ incident, detour }) => (
>>>>>>> 9e66937e642b429933a10f99a5aefeadea03f6d9
            <li
              key={incident.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs dark:bg-zinc-900"
            >
              <span className="text-zinc-700 dark:text-zinc-300">
                <b>{incident.route_id}</b>: {incident.description} —{" "}
                {detour ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    detour found (~{Math.round(detour.durationSeconds / 60)} min)
<<<<<<< HEAD
                    {detourSource === "ml_fallback" && (
                      <span className="ml-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                        ML fallback
                      </span>
                    )}
                    {detourSource === "google" && (
                      <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
                        live routing
                      </span>
                    )}
=======
>>>>>>> 9e66937e642b429933a10f99a5aefeadea03f6d9
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">computing detour…</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onClear(incident.route_id)}
                aria-label="Clear accident"
                className="flex-shrink-0 rounded-full p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
