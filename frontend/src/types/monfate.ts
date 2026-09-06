/**
 * TypeScript mirror of the Pydantic contracts in
 * `backend_api/app/schemas/`. Keep these in sync — see AGENTS.md guardrail #4.
 */

export type AccessibilityFeature =
  | "wheelchair_ramp"
  | "tactile_paving"
  | "working_elevator"
  | "stroller_friendly";

export interface Coordinates {
  lat: number;
  lng: number;
}

export type ObstacleType =
  | "blocked_ramp"
  | "elevator_outage"
  | "missing_tactile_paving"
  | "construction"
  | "sidewalk_obstruction"
  | "other";

export type ObstacleStatus = "active" | "resolved" | "disputed";

export interface ObstacleReport {
  id: string;
  obstacle_type: ObstacleType;
  location: Coordinates;
  description: string;
  affects: AccessibilityFeature[];
  status: ObstacleStatus;
  trust_score: number;
  verification_count: number;
  reported_at: string;
  last_verified_at: string;
  reported_by: string | null;
}

export type RampStatus = "stowed" | "deployed" | "fault" | "not_equipped";

export type CapacityStatus =
  | "empty"
  | "seats_available"
  | "standing_room"
  | "full";

export interface TransitVehicle {
  vehicle_id: string;
  route_id: string;
  location: Coordinates;
  heading_degrees: number;
  speed_kmh: number;
  is_accessible: boolean;
  ramp_status: RampStatus;
  capacity_status: CapacityStatus;
  wheelchair_space_available: boolean;
  priority_seats_available: boolean;
  next_stop_id: string;
  eta_seconds: number;
  last_updated_at: string;
  progress?: number;
}

/** What a rider can filter buses by — separate from AccessibilityFeature
 * (which describes stops/obstacles, not vehicles). */
export type BusNeed = "ramp" | "wheelchair_space" | "priority_seat";

export const BUS_NEED_LABELS: Record<BusNeed, string> = {
  ramp: "Wheelchair Ramp",
  wheelchair_space: "Wheelchair Space",
  priority_seat: "Priority Seating",
};

/** A rider- or CV-submitted report about a specific bus's attributes,
 * held as `status: "pending"` until an admin approves or rejects it — see
 * `lib/firestore-vehicle-reports.ts`. */
export type VehicleReportStatus = "pending" | "approved" | "rejected";

export interface VehicleReport {
  id: string;
  vehicle_id: string;
  route_id: string;
  label: string;
  updates: Partial<
    Pick<TransitVehicle, "ramp_status" | "capacity_status" | "wheelchair_space_available" | "priority_seats_available">
  >;
  status: VehicleReportStatus;
  reported_at: string;
  reported_by: string | null;
}

export interface AccessibilityRoute {
  route_id: string;
  origin: Coordinates;
  destination: Coordinates;
  waypoints: Coordinates[];
  accessibility_score: number;
  active_obstacle_ids: string[];
  required_features: AccessibilityFeature[];
  estimated_duration_seconds: number;
  computed_at: string;
}

// --- station CCTV edge vision -----------------------------------------------

/** Classes the station-CCTV head is configured for (edge_vision/classes.yaml). */
export type DetectionLabel =
  | "wheelchair"
  | "stroller"
  | "mobility_aid"
  | "ambulant"
  | "other";

/** Image-free detection record — mirrors edge_vision.emitter.DetectionEvent. */
export interface VisionEvent {
  schema_version: number;
  event_id: string;
  device_id: string;
  observed_at: string;
  model_version: string;
  label: DetectionLabel | string;
  confidence: number | null;
  object_count: number;
  inference_ms: number;
  bbox_xyxy: [number, number, number, number] | null;
  is_simulation: boolean;
}

// --- pre-emptive dispatch ----------------------------------------------------

export type AlertKind = "assistive_boarding" | "approach_blocked";
export type AlertSeverity = "info" | "warning" | "critical";

export interface DispatchAlert {
  alert_id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  stop_id: string;
  vehicle_id: string | null;
  route_id: string | null;
  headline: string;
  detail: string;
  detected_label: string | null;
  affects: AccessibilityFeature[];
  confidence: number | null;
  eta_seconds: number | null;
  raised_at: string;
  obstacle_id: string | null;
}

export interface TransitStop {
  stop_id: string;
  name: string;
  location: Coordinates;
}

export type ConnState = "online" | "offline" | "degraded" | "mock";

export const DETECTION_LABELS: Record<string, string> = {
  wheelchair: "Wheelchair",
  stroller: "Stroller",
  mobility_aid: "Mobility Aid",
  ambulant: "Ambulant",
  other: "Other",
};

export type DispatchSeverity = "critical" | "warning" | "info";

export type NeedType = "ramp" | "wheelchair_space" | "priority_seat";

/** A citizen's planned trip with selected accessibility needs — feeds the
 * admin dashboard's "Passenger accessibility requests" and demand views. */
export interface TripRequest {
  id: string;
  from_stop_id: string;
  to_stop_id: string;
  needs: NeedType[];
  estimated_duration_seconds: number | null;
  requested_at: string;
}

export interface RouteStop {
  id: string;
  name: string;
  location: Coordinates;
  accessible: boolean;
}

export interface TransitRoute {
  route_id: string;
  name: string;
  color: string;
  stops: RouteStop[];
}

/** A road-level incident (accident, breakdown, closure) that forces buses
 * on a route to detour — distinct from ObstacleReport, which is a
 * pedestrian/stop-level accessibility issue. See lib/accident-simulation.ts. */
export interface RouteIncident {
  id: string;
  route_id: string;
  location: Coordinates;
  description: string;
  reported_at: string;
}

export type DetourSource = "google" | "ml_fallback";

/** Structurally identical to google-routes.ts's TrafficAwareRoute — kept as
 * its own type here (rather than importing that one) so this file never
 * depends on lib code, avoiding a circular import with google-routes.ts
 * (which already imports Coordinates from here). */
export interface DetourRoute {
  path: Coordinates[];
  durationSeconds: number;
  distanceMeters: number;
}

/** A route's currently active incident plus whichever detour was computed
 * for it — stored in Firestore (see lib/firestore-incidents.ts) so it's
 * genuinely shared across every page and device, not local-only state. */
export interface ActiveIncident {
  incident: RouteIncident;
  detour: DetourRoute | null;
  detourSource: DetourSource | null;
}

export const ACCESSIBILITY_FEATURE_LABELS: Record<AccessibilityFeature, string> = {
  wheelchair_ramp: "Wheelchair Ramp",
  tactile_paving: "Tactile Paving",
  working_elevator: "Working Elevators",
  stroller_friendly: "Stroller Friendly",
};

export const OBSTACLE_TYPE_LABELS: Record<ObstacleType, string> = {
  blocked_ramp: "Blocked Ramp",
  elevator_outage: "Elevator Outage",
  missing_tactile_paving: "Missing Tactile Paving",
  construction: "Construction",
  sidewalk_obstruction: "Sidewalk Obstruction",
  other: "Other",
};
