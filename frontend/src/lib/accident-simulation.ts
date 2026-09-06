import { useEffect, useState } from "react";
import type { ActiveIncident, Coordinates, DetourSource, RouteIncident, TransitRoute } from "@/types/monfate";
import { fetchForcedDetour, isGoogleRoutesConfigured, type TrafficAwareRoute } from "./google-routes";
import { computeMlFallbackDetour } from "./ml-fallback-routing";
import { isFirebaseConfigured } from "./firebase";
import { deleteIncident, subscribeToIncidents, writeIncident } from "./firestore-incidents";

export type { ActiveIncident, DetourSource };

/**
 * Manages simulated road incidents and the real detour computed for each
 * one. Tries Google's forced-detour first; if that's unavailable (no key)
 * or fails (network, quota), falls back automatically to the on-device ML
 * routing in lib/ml-fallback-routing.ts.
 *
 * Incidents are written through to Firestore (route_incidents collection)
 * and subscribed to live, so triggering an accident here shows up on every
 * page and every device watching the map — not just local state that dies
 * the moment you navigate away. Falls back to local-only state if Firebase
 * isn't configured, so this still works for offline/no-backend demos.
 */
export function useAccidentSimulation(routes: TransitRoute[]) {
  const [incidents, setIncidents] = useState<Record<string, ActiveIncident>>({}); // keyed by route_id

  useEffect(() => {
    if (!isFirebaseConfigured) return; // stay on local-only state
    const unsubscribe = subscribeToIncidents(setIncidents);
    return () => unsubscribe?.();
  }, []);

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

    const loadingState: ActiveIncident = { incident, detour: null, detourSource: null };
    setIncidents((prev) => ({ ...prev, [routeId]: loadingState }));
    if (isFirebaseConfigured) {
      writeIncident(routeId, loadingState).catch((err) =>
        console.error("[MonFate] Failed to write incident to Firestore:", err),
      );
    }

    let detour: TrafficAwareRoute | null = null;
    let detourSource: DetourSource | null = null;

    if (isGoogleRoutesConfigured) {
      const waypoints = route.stops.map((s) => s.location);
      detour = await fetchForcedDetour(waypoints, location);
      if (detour) detourSource = "google";
    }

    if (!detour) {
      const fallback = computeMlFallbackDetour(routeId, location);
      if (fallback) {
        detour = fallback;
        detourSource = "ml_fallback";
      }
    }

    const resolvedState: ActiveIncident = { incident, detour, detourSource };
    setIncidents((prev) => {
      // Don't resurrect a detour for an incident that's since been cleared.
      if (!prev[routeId] || prev[routeId].incident.id !== incident.id) return prev;
      return { ...prev, [routeId]: resolvedState };
    });
    if (isFirebaseConfigured) {
      writeIncident(routeId, resolvedState).catch((err) =>
        console.error("[MonFate] Failed to update incident in Firestore:", err),
      );
    }
  };

  const clearAccident = (routeId: string) => {
    setIncidents((prev) => {
      const next = { ...prev };
      delete next[routeId];
      return next;
    });
    if (isFirebaseConfigured) {
      deleteIncident(routeId).catch((err) =>
        console.error("[MonFate] Failed to delete incident from Firestore:", err),
      );
    }
  };

  return { incidents, triggerAccident, clearAccident };
}
