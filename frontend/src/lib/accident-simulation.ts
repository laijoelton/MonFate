import { useState } from "react";
import type { Coordinates, RouteIncident, TransitRoute } from "@/types/monfate";
import { fetchForcedDetour, isGoogleRoutesConfigured, type TrafficAwareRoute } from "./google-routes";

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
