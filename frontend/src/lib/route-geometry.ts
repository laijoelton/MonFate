import { useEffect, useState } from "react";
import type { Coordinates, TransitRoute } from "@/types/monfate";
import { fetchWheelchairRoute, isOrsConfigured } from "./openrouteservice";

/**
 * Fetches a real, road-following path for each route (via OpenRouteService's
 * wheelchair profile) once on mount. Returns a map of route_id -> path.
 * A route missing from the map (or with an empty array) means "use the
 * straight stop-to-stop line instead" — callers should always have that
 * fallback ready, since network/API failures shouldn't break the map.
 */
export function useRoutedPaths(routes: TransitRoute[]): Record<string, Coordinates[]> {
  const [paths, setPaths] = useState<Record<string, Coordinates[]>>({});

  useEffect(() => {
    if (!isOrsConfigured) return; // stay on straight lines

    let cancelled = false;

    async function loadAll() {
      const entries = await Promise.all(
        routes.map(async (route) => {
          const waypoints = route.stops.map((s) => s.location);
          const routed = await fetchWheelchairRoute(waypoints);
          return [route.route_id, routed] as const;
        }),
      );

      if (cancelled) return;
      const next: Record<string, Coordinates[]> = {};
      for (const [routeId, routed] of entries) {
        if (routed && routed.length > 0) next[routeId] = routed;
      }
      setPaths(next);
    }

    loadAll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return paths;
}
