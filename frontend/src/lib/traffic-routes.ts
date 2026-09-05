import { useEffect, useState } from "react";
import type { TransitRoute } from "@/types/monfate";
import { fetchTrafficAwareRoute, isGoogleRoutesConfigured, type TrafficAwareRoute } from "./google-routes";

/**
 * Fetches a real, current-traffic-aware driving route for each transit
 * route once on mount — deliberately NOT on an interval, since each call
 * is a billable Google Routes API request (see google-routes.ts cost
 * notes). A route missing from the returned map means "fall back to a
 * straight line and default speed" — always keep that fallback ready.
 */
export function useTrafficAwareRoutes(routes: TransitRoute[]): Record<string, TrafficAwareRoute> {
  const [data, setData] = useState<Record<string, TrafficAwareRoute>>({});

  useEffect(() => {
    if (!isGoogleRoutesConfigured) return; // stay on straight lines + default speed

    let cancelled = false;

    async function loadAll() {
      const entries = await Promise.all(
        routes.map(async (route) => {
          const waypoints = route.stops.map((s) => s.location);
          const result = await fetchTrafficAwareRoute(waypoints);
          return [route.route_id, result] as const;
        }),
      );

      if (cancelled) return;
      const next: Record<string, TrafficAwareRoute> = {};
      for (const [routeId, result] of entries) {
        if (result) next[routeId] = result;
      }
      setData(next);
    }

    loadAll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return data;
}
