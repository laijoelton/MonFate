import { useEffect, useState } from "react";
import type { Coordinates, RampStatus, TransitRoute, TransitVehicle } from "@/types/monfate";
import { getRoute } from "./cyberjaya-routes";

interface BusSeed {
  vehicle_id: string;
  route_id: string;
  progress: number;
  speed: number;
  ramp_status: RampStatus;
  capacity_status: TransitVehicle["capacity_status"];
}

const INITIAL_FLEET: BusSeed[] = [
  { vehicle_id: "BUS-101", route_id: "C1", progress: 0.05, speed: 0.012, ramp_status: "deployed", capacity_status: "seats_available" },
  { vehicle_id: "BUS-102", route_id: "C1", progress: 0.5, speed: 0.01, ramp_status: "stowed", capacity_status: "standing_room" },
  { vehicle_id: "BUS-103", route_id: "C1", progress: 0.8, speed: 0.008, ramp_status: "stowed", capacity_status: "full" },
  { vehicle_id: "BUS-201", route_id: "C2", progress: 0.15, speed: 0.011, ramp_status: "stowed", capacity_status: "seats_available" },
  { vehicle_id: "BUS-202", route_id: "C2", progress: 0.65, speed: 0.009, ramp_status: "fault", capacity_status: "standing_room" },
  { vehicle_id: "BUS-301", route_id: "C3", progress: 0.25, speed: 0.01, ramp_status: "stowed", capacity_status: "standing_room" },
  { vehicle_id: "BUS-302", route_id: "C3", progress: 0.75, speed: 0.007, ramp_status: "stowed", capacity_status: "full" },
];

/** Interpolates a bus's lat/lng along its route's stop-to-stop polyline at the given progress (0-1). */
export function getBusLocation(route: TransitRoute, progress: number): Coordinates {
  const finalIndex = route.stops.length - 1;
  const routeProgress = progress * finalIndex;
  const currentIndex = Math.min(Math.floor(routeProgress), finalIndex - 1);
  const percentage = routeProgress - currentIndex;

  const start = route.stops[currentIndex].location;
  const end = route.stops[currentIndex + 1].location;

  return {
    lat: start.lat + (end.lat - start.lat) * percentage,
    lng: start.lng + (end.lng - start.lng) * percentage,
  };
}

export function getNextStopName(route: TransitRoute, progress: number): string {
  const finalIndex = route.stops.length - 1;
  const routeProgress = progress * finalIndex;
  const nextIndex = Math.min(Math.floor(routeProgress) + 1, finalIndex);
  return route.stops[nextIndex].name;
}

function seedToVehicle(seed: BusSeed, nowIso: string): TransitVehicle {
  const route = getRoute(seed.route_id);
  if (!route) {
    throw new Error(`Unknown route_id in fleet seed: ${seed.route_id}`);
  }
  return {
    vehicle_id: seed.vehicle_id,
    route_id: seed.route_id,
    location: getBusLocation(route, seed.progress),
    heading_degrees: 0,
    speed_kmh: Math.round(seed.speed * 4000),
    is_accessible: seed.ramp_status !== "fault" && seed.ramp_status !== "not_equipped",
    ramp_status: seed.ramp_status,
    capacity_status: seed.capacity_status,
    next_stop_id: getNextStopName(route, seed.progress),
    eta_seconds: Math.round((1 - (seed.progress * (route.stops.length - 1) % 1)) * 90),
    last_updated_at: nowIso,
  };
}

/**
 * Simulates the Cyberjaya fleet moving along their routes, ticking every
 * `intervalMs`. Stands in for live vehicle telemetry until Codex's backend
 * milestone 5 (edge RTOS / CV simulation) lands — see docs/PROJECT_STATE.md.
 *
 * `reportVehicleIssue` lets a rider's report (e.g. "no ramp", "crowded")
 * mutate a specific bus's live state — the change persists across future
 * position ticks since only `progress` is touched by the interval below.
 */
export function useSimulatedFleet(intervalMs = 1200): {
  vehicles: TransitVehicle[];
  reportVehicleIssue: (vehicleId: string, updates: Partial<Pick<BusSeed, "ramp_status" | "capacity_status">>) => void;
} {
  const [seeds, setSeeds] = useState<BusSeed[]>(INITIAL_FLEET);
  const [vehicles, setVehicles] = useState<TransitVehicle[]>(() =>
    INITIAL_FLEET.map((seed) => seedToVehicle(seed, new Date().toISOString())),
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeeds((current) =>
        current.map((seed) => ({
          ...seed,
          progress: (seed.progress + seed.speed) % 1,
        })),
      );
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  useEffect(() => {
    const nowIso = new Date().toISOString();
    setVehicles(seeds.map((seed) => seedToVehicle(seed, nowIso)));
  }, [seeds]);

  const reportVehicleIssue = (
    vehicleId: string,
    updates: Partial<Pick<BusSeed, "ramp_status" | "capacity_status">>,
  ) => {
    setSeeds((current) =>
      current.map((seed) => (seed.vehicle_id === vehicleId ? { ...seed, ...updates } : seed)),
    );
  };

  return { vehicles, reportVehicleIssue };
}
