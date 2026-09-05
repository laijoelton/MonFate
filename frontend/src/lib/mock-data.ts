import type {
  AccessibilityFeature,
  ObstacleReport,
  TransitVehicle,
} from "@/types/monfate";

/**
 * Mock data standing in for `backend_api` responses until Codex's API
 * milestones land (see docs/PROJECT_STATE.md milestone tracker).
 * Coordinates are grid units (0-100) on the mock map, not real lat/lng.
 */

export const MOCK_OBSTACLES: ObstacleReport[] = [
  {
    id: "obs-001",
    obstacle_type: "blocked_ramp",
    location: { lat: 32, lng: 28 },
    description: "Delivery truck blocking curb ramp at 5th & Main.",
    affects: ["wheelchair_ramp", "stroller_friendly"],
    status: "active",
    trust_score: 94,
    verification_count: 7,
    reported_at: "2026-09-05T13:40:00Z",
    last_verified_at: "2026-09-05T14:48:00Z",
    reported_by: "rider-2291",
  },
  {
    id: "obs-002",
    obstacle_type: "elevator_outage",
    location: { lat: 61, lng: 45 },
    description: "Station elevator out of service, no ETA posted.",
    affects: ["working_elevator"],
    status: "active",
    trust_score: 88,
    verification_count: 4,
    reported_at: "2026-09-05T12:10:00Z",
    last_verified_at: "2026-09-05T14:20:00Z",
    reported_by: null,
  },
  {
    id: "obs-003",
    obstacle_type: "missing_tactile_paving",
    location: { lat: 47, lng: 70 },
    description: "Crosswalk resurfacing removed tactile paving strip.",
    affects: ["tactile_paving"],
    status: "disputed",
    trust_score: 52,
    verification_count: 1,
    reported_at: "2026-09-05T09:05:00Z",
    last_verified_at: "2026-09-05T09:05:00Z",
    reported_by: "rider-1187",
  },
  {
    id: "obs-004",
    obstacle_type: "construction",
    location: { lat: 20, lng: 62 },
    description: "Sidewalk closed for scaffolding, narrow detour only.",
    affects: ["wheelchair_ramp", "stroller_friendly", "tactile_paving"],
    status: "active",
    trust_score: 97,
    verification_count: 12,
    reported_at: "2026-09-04T08:00:00Z",
    last_verified_at: "2026-09-05T14:50:00Z",
    reported_by: "rider-0456",
  },
];

export const MOCK_VEHICLES: TransitVehicle[] = [
  {
    vehicle_id: "bus-14",
    route_id: "Route 14 - Downtown Loop",
    location: { lat: 40, lng: 38 },
    heading_degrees: 95,
    speed_kmh: 22,
    is_accessible: true,
    ramp_status: "stowed",
    capacity_status: "seats_available",
    wheelchair_space_available: true,
    priority_seats_available: true,
    next_stop_id: "stop-main-5th",
    eta_seconds: 165,
    last_updated_at: "2026-09-05T14:52:30Z",
  },
  {
    vehicle_id: "bus-22",
    route_id: "Route 22 - Riverside",
    location: { lat: 55, lng: 30 },
    heading_degrees: 210,
    speed_kmh: 0,
    is_accessible: true,
    ramp_status: "deployed",
    capacity_status: "standing_room",
    wheelchair_space_available: false,
    priority_seats_available: true,
    next_stop_id: "stop-riverside-park",
    eta_seconds: 0,
    last_updated_at: "2026-09-05T14:53:00Z",
  },
];

export const ACCESSIBILITY_FILTERS: AccessibilityFeature[] = [
  "wheelchair_ramp",
  "tactile_paving",
  "working_elevator",
  "stroller_friendly",
];

/** Fixed reference "now" so relative-time display stays deterministic against the mock timestamps above. */
export const MOCK_NOW = "2026-09-05T14:53:30Z";
