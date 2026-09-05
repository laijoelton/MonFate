import { useEffect, useRef, useState } from "react";
import type { Coordinates, RampStatus, TransitRoute, TransitVehicle } from "@/types/monfate";
import { getRoute } from "./cyberjaya-routes";

interface BusSeed {
  vehicle_id: string;
  route_id: string;
  progress: number;
  speed: number;
  ramp_status: RampStatus;
  capacity_status: TransitVehicle["capacity_status"];
  wheelchair_space_available: boolean;
  priority_seats_available: boolean;
}

const INITIAL_FLEET: BusSeed[] = [
  { vehicle_id: "BUS-101", route_id: "C1", progress: 0.05, speed: 0.012, ramp_status: "deployed", capacity_status: "seats_available", wheelchair_space_available: true, priority_seats_available: true },
  { vehicle_id: "BUS-102", route_id: "C1", progress: 0.5, speed: 0.01, ramp_status: "stowed", capacity_status: "standing_room", wheelchair_space_available: false, priority_seats_available: true },
  { vehicle_id: "BUS-103", route_id: "C1", progress: 0.8, speed: 0.008, ramp_status: "stowed", capacity_status: "full", wheelchair_space_available: false, priority_seats_available: false },
  { vehicle_id: "BUS-104", route_id: "C1", progress: 0.3, speed: 0.009, ramp_status: "deployed", capacity_status: "seats_available", wheelchair_space_available: true, priority_seats_available: true },
  { vehicle_id: "BUS-201", route_id: "C2", progress: 0.15, speed: 0.011, ramp_status: "stowed", capacity_status: "seats_available", wheelchair_space_available: true, priority_seats_available: true },
  { vehicle_id: "BUS-202", route_id: "C2", progress: 0.65, speed: 0.009, ramp_status: "fault", capacity_status: "standing_room", wheelchair_space_available: false, priority_seats_available: true },
  { vehicle_id: "BUS-203", route_id: "C2", progress: 0.9, speed: 0.01, ramp_status: "deployed", capacity_status: "seats_available", wheelchair_space_available: true, priority_seats_available: false },
  { vehicle_id: "BUS-301", route_id: "C3", progress: 0.25, speed: 0.01, ramp_status: "stowed", capacity_status: "standing_room", wheelchair_space_available: true, priority_seats_available: false },
  { vehicle_id: "BUS-302", route_id: "C3", progress: 0.75, speed: 0.007, ramp_status: "stowed", capacity_status: "full", wheelchair_space_available: false, priority_seats_available: false },
  { vehicle_id: "BUS-401", route_id: "C4", progress: 0.1, speed: 0.01, ramp_status: "deployed", capacity_status: "seats_available", wheelchair_space_available: true, priority_seats_available: true },
  { vehicle_id: "BUS-402", route_id: "C4", progress: 0.55, speed: 0.008, ramp_status: "stowed", capacity_status: "standing_room", wheelchair_space_available: false, priority_seats_available: true },
];

/** Interpolates a position along any ordered list of points at the given progress (0-1). */
export function interpolateAlongPath(path: Coordinates[], progress: number): Coordinates {
  if (path.length === 1) return path[0];
  const finalIndex = path.length - 1;
  const pathProgress = progress * finalIndex;
  const currentIndex = Math.min(Math.floor(pathProgress), finalIndex - 1);
  const percentage = pathProgress - currentIndex;

  const start = path[currentIndex];
  const end = path[currentIndex + 1];

  return {
    lat: start.lat + (end.lat - start.lat) * percentage,
    lng: start.lng + (end.lng - start.lng) * percentage,
  };
}

/** Interpolates a bus's lat/lng along its route's stop-to-stop polyline at the given progress (0-1). */
export function getBusLocation(route: TransitRoute, progress: number): Coordinates {
  return interpolateAlongPath(route.stops.map((s) => s.location), progress);
}

/**
 * Inverse of interpolateAlongPath: given a real location, finds how far
 * along `path` (0-1) the closest point sits. Used to smoothly hand a bus
 * off between paths (normal route <-> detour) without it visually jumping —
 * see the transition effect in useSimulatedFleet below.
 */
export function progressAlongPath(location: Coordinates, path: Coordinates[]): number {
  if (path.length < 2) return 0;
  let bestDistSq = Infinity;
  let bestProgress = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((location.lng - a.lng) * dx + (location.lat - a.lat) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projLng = a.lng + t * dx;
    const projLat = a.lat + t * dy;
    const dLng = location.lng - projLng;
    const dLat = location.lat - projLat;
    const distSq = dLng * dLng + dLat * dLat;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestProgress = (i + t) / (path.length - 1);
    }
  }

  return bestProgress;
}

export function getNextStopName(route: TransitRoute, progress: number): string {
  const finalIndex = route.stops.length - 1;
  const routeProgress = progress * finalIndex;
  const nextIndex = Math.min(Math.floor(routeProgress) + 1, finalIndex);
  return route.stops[nextIndex].name;
}

export interface RouteDetour {
  path: Coordinates[];
  durationSeconds: number;
}

function seedToVehicle(seed: BusSeed, nowIso: string, detours?: Record<string, RouteDetour>): TransitVehicle {
  const route = getRoute(seed.route_id);
  if (!route) {
    throw new Error(`Unknown route_id in fleet seed: ${seed.route_id}`);
  }

  const detour = detours?.[seed.route_id];

  return {
    vehicle_id: seed.vehicle_id,
    route_id: seed.route_id,
    location: detour ? interpolateAlongPath(detour.path, seed.progress) : getBusLocation(route, seed.progress),
    heading_degrees: 0,
    speed_kmh: Math.round(seed.speed * 4000),
    is_accessible: seed.ramp_status !== "fault" && seed.ramp_status !== "not_equipped",
    ramp_status: seed.ramp_status,
    capacity_status: seed.capacity_status,
    wheelchair_space_available: seed.wheelchair_space_available,
    priority_seats_available: seed.priority_seats_available,
    next_stop_id: detour ? "Rerouting via detour" : getNextStopName(route, seed.progress),
    eta_seconds: Math.round((1 - (seed.progress * (route.stops.length - 1) % 1)) * 90),
    last_updated_at: nowIso,
  };
}

type VehicleAttributeUpdates = Partial<
  Pick<BusSeed, "ramp_status" | "capacity_status" | "wheelchair_space_available" | "priority_seats_available">
>;

/**
 * Simulates the Cyberjaya fleet moving along their routes, ticking every
 * `intervalMs`. Stands in for live vehicle telemetry until Codex's backend
 * milestone 5 (edge RTOS / CV simulation) lands — see docs/PROJECT_STATE.md.
 *
 * `reportVehicleIssue` lets a rider's report (e.g. "no ramp", "crowded")
 * mutate a specific bus's live state — the change persists across future
 * position ticks since only `progress` is touched by the interval below.
 */
export function useSimulatedFleet(
  intervalMs = 1200,
  routeDurationsSeconds?: Record<string, number>,
  routeDetours?: Record<string, RouteDetour>,
): {
  vehicles: TransitVehicle[];
  reportVehicleIssue: (vehicleId: string, updates: VehicleAttributeUpdates) => void;
} {
  const [seeds, setSeeds] = useState<BusSeed[]>(INITIAL_FLEET);
  const [vehicles, setVehicles] = useState<TransitVehicle[]>(() =>
    INITIAL_FLEET.map((seed) => seedToVehicle(seed, new Date().toISOString())),
  );
  const prevDetoursRef = useRef<Record<string, RouteDetour> | undefined>(undefined);

  // When a route's detour appears (accident triggered) or disappears
  // (cleared), keep every bus on that route visually where it actually is:
  // find its current real-world location on whichever path was active,
  // then re-anchor its progress to the equivalent point on the new path.
  // Without this, switching paths would jump the bus to whatever point
  // happens to sit at the same raw 0-1 fraction on a completely different
  // path — a visible teleport instead of a live reroute.
  useEffect(() => {
    const prevDetours = prevDetoursRef.current;
    prevDetoursRef.current = routeDetours;
    if (prevDetours === undefined) return; // first mount — nothing to reconcile yet

    setSeeds((current) =>
      current.map((seed) => {
        const had = prevDetours[seed.route_id];
        const has = routeDetours?.[seed.route_id];
        if (Boolean(had) === Boolean(has)) return seed; // no transition for this bus

        const route = getRoute(seed.route_id);
        if (!route) return seed;

        const normalPath = route.stops.map((s) => s.location);
        const oldPath = had ? had.path : normalPath;
        const newPath = has ? has.path : normalPath;

        const currentLocation = interpolateAlongPath(oldPath, seed.progress);
        const newProgress = progressAlongPath(currentLocation, newPath);

        return { ...seed, progress: newProgress };
      }),
    );
  }, [routeDetours]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeeds((current) =>
        current.map((seed) => {
          // Pacing priority: an active detour's own duration (route
          // Google actually picked to avoid the incident) > the plain
          // traffic-aware duration for the normal route > fixed default.
          const detourDuration = routeDetours?.[seed.route_id]?.durationSeconds;
          const trafficDuration = routeDurationsSeconds?.[seed.route_id];
          const effectiveDuration = detourDuration ?? trafficDuration;
          const step = effectiveDuration ? intervalMs / 1000 / effectiveDuration : seed.speed;
          return { ...seed, progress: (seed.progress + step) % 1 };
        }),
      );
    }, intervalMs);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, routeDurationsSeconds, routeDetours]);

  useEffect(() => {
    const nowIso = new Date().toISOString();
    setVehicles(seeds.map((seed) => seedToVehicle(seed, nowIso, routeDetours)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeds, routeDetours]);

  const reportVehicleIssue = (vehicleId: string, updates: VehicleAttributeUpdates) => {
    setSeeds((current) =>
      current.map((seed) => (seed.vehicle_id === vehicleId ? { ...seed, ...updates } : seed)),
    );
  };

  return { vehicles, reportVehicleIssue };
}
