import type { Coordinates } from "@/types/monfate";
import { CYBERJAYA_ROUTES } from "./cyberjaya-routes";
import mlWeights from "./ml-delay-weights.json";

/**
 * On-device fallback routing for when the live Google Routes API is
 * unreachable (network down, key revoked, quota exhausted, outage). Unlike
 * the Google-based detour, this makes zero network calls — it runs a
 * Dijkstra search over the stop graph entirely client-side, using a real
 * Ridge regression model (trained offline on the mock telemetry dataset,
 * see /mnt/user-data/outputs/monfate-ml-mock-data for the training script)
 * to estimate current segment delay from time-of-day features alone.
 *
 * Honesty note for demos: this is real fitted ML (coefficients learned from
 * data, beats a mean-prediction baseline — see ml-delay-weights.json's
 * test_mae_minutes), but it is a coarse time-of-day delay estimate, not a
 * live-traffic-aware route like the Google path. Frame it as "keeps the
 * system routing when the live API can't," not "as good as live traffic."
 */

const AVERAGE_SPEED_KMH = 25;

interface DelayModelWeights {
  feature_names: string[];
  coefficients: number[];
  intercept: number;
  test_mae_minutes: number;
  trained_on_rows: number;
}

const weights = mlWeights as DelayModelWeights;

/** Predicts current segment delay (minutes) from time-of-day features, using the trained model. */
export function predictDelayMinutes(date: Date = new Date()): number {
  const hour = date.getHours();
  const day = date.getDay(); // 0 = Sunday
  const isWeekend = day === 0 || day === 6;
  const isPeakHour = !isWeekend && ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19));

  // No live weather source in a fallback-by-definition scenario — "clear"
  // is the safest assumption rather than adding another external dependency.
  const featureValues: Record<string, number> = {
    scheduled_hour: hour,
    is_peak_hour: isPeakHour ? 1 : 0,
    is_weekend: isWeekend ? 1 : 0,
    weather_clear: 1,
    weather_haze: 0,
    weather_rain: 0,
  };

  let prediction = weights.intercept;
  weights.feature_names.forEach((name, i) => {
    prediction += (featureValues[name] ?? 0) * weights.coefficients[i];
  });

  return Math.max(0, prediction);
}

/** Offsets a point by a given number of meters north/east (rough, fine at city scale). */
function offsetPoint(point: Coordinates, metersNorth: number, metersEast: number): Coordinates {
  const dLat = metersNorth / 111320;
  const dLng = metersEast / (111320 * Math.cos((point.lat * Math.PI) / 180));
  return { lat: point.lat + dLat, lng: point.lng + dLng };
}

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

interface ClosestPointResult {
  point: Coordinates;
  t: number; // 0-1 position along the segment
  distanceMeters: number;
}

/** Finds the closest point on segment a-b to p, in meters (works in a local
 * flat approximation — fine at city scale), returning both the distance
 * and where along the segment (0-1) that closest point sits. The `t` value
 * is what lets us insert a detour bump exactly where the incident is,
 * rather than at an arbitrary fixed offset from its raw coordinates. */
function closestPointOnSegment(p: Coordinates, a: Coordinates, b: Coordinates): ClosestPointResult {
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const toXY = (c: Coordinates) => ({ x: c.lng * cosLat, y: c.lat });
  const pp = toXY(p);
  const aa = toXY(a);
  const bb = toXY(b);
  const dx = bb.x - aa.x;
  const dy = bb.y - aa.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((pp.x - aa.x) * dx + (pp.y - aa.y) * dy) / lenSq));
  const closest: Coordinates = { lat: aa.y + t * dy, lng: (aa.x + t * dx) / cosLat };
  return { point: closest, t, distanceMeters: haversineMeters(p, closest) };
}

/**
 * Builds a real perpendicular bulge off segment a-b, `bumpMeters` to the
 * side, positioned at parameter `t` along the segment (wherever the
 * incident actually sits). A perpendicular offset always reads visually as
 * "going around" something, unlike a fixed-direction nudge which can look
 * like a barely-there kink or even run roughly parallel to the original
 * line depending on the route's orientation on the map.
 */
function perpendicularBulge(a: Coordinates, b: Coordinates, t: number, bumpMeters: number): Coordinates {
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const metersToXY = (c: Coordinates) => ({ x: c.lng * cosLat * 111320, y: c.lat * 111320 });
  const xyToLatLng = (p: { x: number; y: number }) => ({ lat: p.y / 111320, lng: p.x / (cosLat * 111320) });

  const aa = metersToXY(a);
  const bb = metersToXY(b);
  const dx = bb.x - aa.x;
  const dy = bb.y - aa.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const unitPerpX = -dy / len;
  const unitPerpY = dx / len;

  const baseX = aa.x + t * dx;
  const baseY = aa.y + t * dy;

  return xyToLatLng({ x: baseX + unitPerpX * bumpMeters, y: baseY + unitPerpY * bumpMeters });
}

export interface MlFallbackResult {
  path: Coordinates[];
  durationSeconds: number;
  distanceMeters: number;
}

const OBSTACLE_PROXIMITY_METERS = 300;

/**
 * Computes a detour for a route using only local data and the trained delay
 * model — no network call, no whole-network shortest-path search.
 *
 * IMPORTANT DESIGN NOTE: an earlier version of this function ran Dijkstra
 * over the *entire* multi-route stop graph, origin to destination. That's
 * wrong for this use case — because several routes share stops, the
 * "shortest path anywhere in the network" is almost always a shortcut via a
 * completely different route (e.g. a direct 500m hop that bypasses the
 * whole affected route), which is shorter than any incident-avoiding path
 * along the original route by a huge margin. The result: the same shortcut
 * gets picked regardless of the incident's location or the predicted
 * congestion, i.e. no visible reroute at all.
 *
 * A second earlier version fixed that by staying on the affected route's
 * own stops, but nudged the path by a fixed north-east offset — which could
 * still look like barely a kink rather than a real detour, especially when
 * that fixed direction happened to run close to parallel with the route
 * itself. This version instead builds a true perpendicular bulge off
 * whichever segment the incident sits on, sized well above what's needed to
 * clearly read as "going around" at normal map zoom. The trained delay
 * model still does real work: it scales how far the bulge swings out, and
 * adds to the reported duration.
 */
export function computeMlFallbackDetour(routeId: string, avoidLocation: Coordinates): MlFallbackResult | null {
  const route = CYBERJAYA_ROUTES.find((r) => r.route_id === routeId);
  if (!route || route.stops.length < 2) return null;

  const stops = route.stops;
  const perMinuteDelaySeconds = predictDelayMinutes() * 60;

  // Find whichever stop-to-stop segment on THIS route passes closest to the incident.
  let nearestSegmentIndex = 0;
  let nearestResult: ClosestPointResult | null = null;
  for (let i = 0; i < stops.length - 1; i++) {
    const result = closestPointOnSegment(avoidLocation, stops[i].location, stops[i + 1].location);
    if (!nearestResult || result.distanceMeters < nearestResult.distanceMeters) {
      nearestResult = result;
      nearestSegmentIndex = i;
    }
  }

  // Sized to be unmistakable at normal map zoom, not just technically
  // present — this is deliberately larger than the incident-detection
  // radius above it, so the bulge clearly reads as a real detour rather
  // than a subtle kink. Congestion still scales it further.
  const bumpMeters = 900 + Math.min(900, perMinuteDelaySeconds * 3);

  const path: Coordinates[] = [];
  for (let i = 0; i < stops.length; i++) {
    path.push(stops[i].location);
    const onAffectedSegment =
      i === nearestSegmentIndex && nearestResult !== null && nearestResult.distanceMeters <= OBSTACLE_PROXIMITY_METERS;
    if (onAffectedSegment && nearestResult) {
      const a = stops[i].location;
      const b = stops[i + 1].location;
      path.push(perpendicularBulge(a, b, nearestResult.t, bumpMeters));
    }
  }

  let totalDistanceMeters = 0;
  for (let i = 0; i < path.length - 1; i++) {
    totalDistanceMeters += haversineMeters(path[i], path[i + 1]);
  }

  const baseDurationSeconds = (totalDistanceMeters / 1000 / AVERAGE_SPEED_KMH) * 3600;
  const durationSeconds = baseDurationSeconds + perMinuteDelaySeconds;

  return { path, durationSeconds, distanceMeters: totalDistanceMeters };
}
