import { useState } from "react";
import type { Coordinates, RouteIncident, TransitRoute } from "@/types/monfate";
import { fetchForcedDetour, isGoogleRoutesConfigured, type TrafficAwareRoute } from "./google-routes";
<<<<<<< HEAD
import { computeMlFallbackDetour } from "./ml-fallback-routing";

export type DetourSource = "google" | "ml_fallback";

export interface ActiveIncident {
  incident: RouteIncident;
  detour: TrafficAwareRoute | null; // null while loading, or if nothing could be computed at all
  detourSource: DetourSource | null;
}

/**
 * Manages simulated road incidents and the detour computed for each one.
 * Tries Google's Routes API first (a real, live, traffic-aware detour via
 * fetchForcedDetour). If that's unavailable — no API key, network failure,
 * quota exhausted, outage — falls back to computeMlFallbackDetour, which
 * runs entirely on-device using a small trained regression model, so the
 * app keeps offering a real (if coarser) detour instead of just failing.
=======

export interface ActiveIncident {
  incident: RouteIncident;
  detour: TrafficAwareRoute | null; // null while loading, or if it never resolved
}

/**
 * Manages simulated road incidents and the real detour Google computes for
 * each one. This is the "route optimization" behind the accident demo:
 * triggering an incident forces a real route through a point deliberately
 * offset from the incident location, so Google has to compute an actual
 * road-following detour around it — see fetchForcedDetour in
 * lib/google-routes.ts.
>>>>>>> 9e66937e642b429933a10f99a5aefeadea03f6d9
 */
export function useAccidentSimulation(routes: TransitRoute[]) {
  const [incidents, setIncidents] = useState<Record<string, ActiveIncident>>({}); // keyed by route_id

  const triggerAccident = async (routeId: string, location: Coordinates, description: string) => {
    const route = routes.find((r) => r.route_id === routeId);
    if (!route) return;

    const incident: RouteIncident = {
      id: `incident-${routeId}-${Date.now()}`,
      route_id: routeId,
      location,
      description,
      reported_at: new Date().toISOString(),
    };

    // Show the incident immediately with detour still loading, then fill
<<<<<<< HEAD
    // it in once a source resolves.
    setIncidents((prev) => ({ ...prev, [routeId]: { incident, detour: null, detourSource: null } }));

    let detour: TrafficAwareRoute | null = null;
    let detourSource: DetourSource | null = null;

    if (isGoogleRoutesConfigured) {
      const waypoints = route.stops.map((s) => s.location);
      detour = await fetchForcedDetour(waypoints, location);
      if (detour) detourSource = "google";
    }

    if (!detour) {
      // Google unconfigured or the request failed — fall back to the
      // on-device ML-informed pathfinder so the demo still produces a
      // real detour instead of silently doing nothing.
      const fallback = computeMlFallbackDetour(routeId, location);
      if (fallback) {
        detour = fallback;
        detourSource = "ml_fallback";
      }
    }

    setIncidents((prev) => {
      // Don't resurrect a detour for an incident that's since been cleared.
      if (!prev[routeId] || prev[routeId].incident.id !== incident.id) return prev;
      return { ...prev, [routeId]: { incident, detour, detourSource } };
=======
    // it in once Google responds (or leave it null if unconfigured/failed —
    // callers should fall back to the base route in that case).
    setIncidents((prev) => ({ ...prev, [routeId]: { incident, detour: null } }));

    if (!isGoogleRoutesConfigured) return;

    const waypoints = route.stops.map((s) => s.location);
    const detour = await fetchForcedDetour(waypoints, location);
    setIncidents((prev) => {
      // Don't resurrect a detour for an incident that's since been cleared.
      if (!prev[routeId] || prev[routeId].incident.id !== incident.id) return prev;
      return { ...prev, [routeId]: { incident, detour } };
>>>>>>> 9e66937e642b429933a10f99a5aefeadea03f6d9
    });
  };

  const clearAccident = (routeId: string) => {
    setIncidents((prev) => {
      const next = { ...prev };
      delete next[routeId];
      return next;
    });
  };

  return { incidents, triggerAccident, clearAccident };
}
