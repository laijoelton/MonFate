import type { Coordinates } from "@/types/monfate";

/**
 * Google Routes API client — fetches a real, traffic-aware driving route
 * between waypoints. This is what your buses actually experience (they're
 * vehicles on roads, subject to real congestion) as opposed to the
 * wheelchair-profile pedestrian routing in openrouteservice.ts, which is
 * for a rider walking to/from a stop.
 *
 * IMPORTANT COST NOTE: Google requires a billing account with a card on
 * file even for free-tier usage (the old $200/month credit was retired in
 * March 2025). Traffic-aware routing falls under the "Pro" SKU category —
 * 5,000 free requests/month, billed per request after that, with no
 * automatic hard cap (only after-the-fact budget alerts). This client is
 * called once per route on page load (see lib/traffic-routes.ts), not on
 * every simulation tick, to keep usage low.
 */

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export const isGoogleRoutesConfigured = Boolean(GOOGLE_MAPS_API_KEY);

export interface TrafficAwareRoute {
  path: Coordinates[];
  durationSeconds: number;
  distanceMeters: number;
}

/** Decodes Google's polyline encoding format into [lat, lng] pairs. */
function decodePolyline(encoded: string): Coordinates[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: Coordinates[] = [];

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return coordinates;
}

/** Approximate distance between two points in meters (haversine). */
function haversineMeters(a: Coordinates, b: Coordinates): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The closest any point on `path` gets to `point`, in meters. */
function minDistanceToPath(point: Coordinates, path: Coordinates[]): number {
  let min = Infinity;
  for (const p of path) {
    const d = haversineMeters(point, p);
    if (d < min) min = d;
  }
  return min;
}

async function requestRoutes(
  waypoints: Coordinates[],
  computeAlternativeRoutes: boolean,
): Promise<TrafficAwareRoute[]> {
  if (!GOOGLE_MAPS_API_KEY || waypoints.length < 2) return [];

  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const intermediates = waypoints.slice(1, -1);

  try {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        intermediates: intermediates.map((wp) => ({
          location: { latLng: { latitude: wp.lat, longitude: wp.lng } },
        })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes,
      }),
    });

    if (!response.ok) {
      console.warn("[MonFate] Google Routes request failed:", response.status, await response.text());
      return [];
    }

    const data = await response.json();
    const routes = data.routes ?? [];
    return routes
      .filter((r: { polyline?: { encodedPolyline?: string }; duration?: string }) => r.polyline?.encodedPolyline && r.duration)
      .map((r: { polyline: { encodedPolyline: string }; duration: string; distanceMeters?: number }) => ({
        path: decodePolyline(r.polyline.encodedPolyline),
        durationSeconds: parseInt(String(r.duration).replace("s", ""), 10),
        distanceMeters: r.distanceMeters ?? 0,
      }));
  } catch (error) {
    console.warn("[MonFate] Google Routes request errored:", error);
    return [];
  }
}

/**
 * Fetches a real, current-traffic-aware driving route through the given
 * waypoints (first = origin, last = destination, rest = intermediate stops
 * in order). Returns null on any failure — callers should fall back to
 * straight lines and a fixed default speed.
 */
export async function fetchTrafficAwareRoute(waypoints: Coordinates[]): Promise<TrafficAwareRoute | null> {
  const routes = await requestRoutes(waypoints, false);
  return routes[0] ?? null;
}

/** Index of the waypoint closest to `point`. */
function nearestWaypointIndex(waypoints: Coordinates[], point: Coordinates): number {
  let best = 0;
  let bestDist = Infinity;
  waypoints.forEach((wp, i) => {
    const d = haversineMeters(wp, point);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/** Offsets a point by a given number of meters north/east (rough, fine at city scale). */
function offsetPoint(point: Coordinates, metersNorth: number, metersEast: number): Coordinates {
  const dLat = metersNorth / 111320;
  const dLng = metersEast / (111320 * Math.cos((point.lat * Math.PI) / 180));
  return { lat: point.lat + dLat, lng: point.lng + dLng };
}

/**
 * Fetches the primary route plus Google's alternative routes (up to ~3
 * total), and picks whichever one stays furthest from `avoidLocation`.
 * NOTE: for short, closely-spaced local trips (like stops a few hundred
 * meters apart), Google frequently has no genuinely different alternative
 * to offer and returns just one route — in that case this can't produce a
 * real detour. Prefer fetchForcedDetour below for reliability.
 */
export async function fetchDetourAwayFrom(
  waypoints: Coordinates[],
  avoidLocation: Coordinates,
): Promise<TrafficAwareRoute | null> {
  const routes = await requestRoutes(waypoints, true);
  if (routes.length === 0) return null;
  if (routes.length === 1) return routes[0]; // no alternative existed — best we can do

  let best = routes[0];
  let bestDistance = minDistanceToPath(avoidLocation, best.path);
  for (const route of routes.slice(1)) {
    const distance = minDistanceToPath(avoidLocation, route.path);
    if (distance > bestDistance) {
      best = route;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Deterministically forces a real detour around `avoidLocation`: finds the
 * waypoint nearest the incident and temporarily nudges it a few hundred
 * meters to one side, then asks Google for a real route through that
 * nudged point. Since the point Google is asked to pass through is
 * genuinely different from the incident location, this reliably produces
 * an actual road-following detour — unlike fetchDetourAwayFrom, it doesn't
 * depend on Google's alternate-route engine happening to find something
 * different on its own. Tries a few offset directions and keeps whichever
 * resulting route ends up furthest from the incident.
 */
export async function fetchForcedDetour(
  waypoints: Coordinates[],
  avoidLocation: Coordinates,
): Promise<TrafficAwareRoute | null> {
  if (waypoints.length < 2) return null;

  const nudgeIndex = nearestWaypointIndex(waypoints, avoidLocation);
  const offsetDirections: [number, number][] = [
    [250, 250],
    [-250, 250],
    [250, -250],
    [-250, -250],
  ];

  let best: TrafficAwareRoute | null = null;
  let bestDistance = -Infinity;

  for (const [north, east] of offsetDirections) {
    const nudgedWaypoints = [...waypoints];
    nudgedWaypoints[nudgeIndex] = offsetPoint(avoidLocation, north, east);

    const routes = await requestRoutes(nudgedWaypoints, false);
    if (routes.length === 0) continue;

    const distance = minDistanceToPath(avoidLocation, routes[0].path);
    if (distance > bestDistance) {
      best = routes[0];
      bestDistance = distance;
    }
  }

  return best;
}
