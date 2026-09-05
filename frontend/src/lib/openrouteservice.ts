import type { Coordinates } from "@/types/monfate";

/**
 * OpenRouteService client — fetches real, road-following routes using the
 * "wheelchair" profile (avoids stairs, prefers curb cuts/ramps, accounts for
 * surface and incline where OSM data has it). This is what turns the map's
 * straight lines between stops into routes that actually follow real streets.
 *
 * Free tier: 2,000 requests/day per key, no credit card required.
 * https://openrouteservice.org
 *
 * NOTE: the key is called client-side (NEXT_PUBLIC_*), which is fine for a
 * hackathon demo — ORS free-tier keys are rate-limited per key, not a high
 * security concern. A production app would proxy this through a backend
 * route instead, so the key never reaches the browser.
 */

const ORS_API_KEY = process.env.NEXT_PUBLIC_ORS_API_KEY;

export const isOrsConfigured = Boolean(ORS_API_KEY);

interface OrsGeoJsonResponse {
  features: {
    geometry: {
      coordinates: [number, number][]; // [lng, lat] pairs, GeoJSON order
    };
  }[];
}

/**
 * Fetches a real wheelchair-accessible route through the given waypoints
 * (in order). Returns null on any failure — callers should fall back to
 * straight lines between the waypoints rather than showing nothing.
 */
export async function fetchWheelchairRoute(waypoints: Coordinates[]): Promise<Coordinates[] | null> {
  if (!ORS_API_KEY || waypoints.length < 2) return null;

  try {
    const response = await fetch("https://api.openrouteservice.org/v2/directions/wheelchair/geojson", {
      method: "POST",
      headers: {
        Authorization: ORS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // ORS expects [lng, lat] order — the reverse of our Coordinates type.
        coordinates: waypoints.map((wp) => [wp.lng, wp.lat]),
      }),
    });

    if (!response.ok) {
      console.warn("[MonFate] ORS routing request failed:", response.status, await response.text());
      return null;
    }

    const data: OrsGeoJsonResponse = await response.json();
    const line = data.features[0]?.geometry.coordinates;
    if (!line || line.length === 0) return null;

    return line.map(([lng, lat]) => ({ lat, lng }));
  } catch (error) {
    console.warn("[MonFate] ORS routing request errored:", error);
    return null;
  }
}
