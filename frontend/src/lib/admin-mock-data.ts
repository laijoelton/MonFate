import type { ObstacleReport, TransitStop, TransitVehicle } from "@/types/monfate";
import type {
  AssistanceRequest,
  DemandForecast,
  InfrastructureStatus,
  OperationalAlert,
  Recommendation,
} from "@/types/admin";

// Fixed seed time keeps server prerendering and client hydration identical.
const DEMO_TIME = Date.parse("2026-09-05T04:02:00Z");
const ago = (minutes: number) => new Date(DEMO_TIME - minutes * 60_000).toISOString();

export const ADMIN_MOCK_STOPS: TransitStop[] = [
  { stop_id: "stop_01", name: "Cyberjaya City Centre", location: { lat: 2.9213, lng: 101.6559 } },
  { stop_id: "stop_02", name: "MRT Cyberjaya", location: { lat: 2.9168, lng: 101.6662 } },
  { stop_id: "stop_03", name: "Tamarind Square", location: { lat: 2.9095, lng: 101.6625 } },
  { stop_id: "stop_04", name: "Multimedia University", location: { lat: 2.9286, lng: 101.6418 } },
  { stop_id: "stop_05", name: "Hospital Cyberjaya", location: { lat: 2.9362, lng: 101.6751 } },
];

export const ADMIN_MOCK_VEHICLES: TransitVehicle[] = [
  {
    vehicle_id: "B101",
    route_id: "CJ01",
    location: { lat: 2.9187, lng: 101.6598 },
    heading_degrees: 52,
    speed_kmh: 28,
    is_accessible: true,
    ramp_status: "stowed",
    capacity_status: "standing_room",
    next_stop_id: "stop_01",
    eta_seconds: 240,
    last_updated_at: ago(0),
  },
  {
    vehicle_id: "B202",
    route_id: "CJ02",
    location: { lat: 2.9251, lng: 101.6496 },
    heading_degrees: 118,
    speed_kmh: 0,
    is_accessible: true,
    ramp_status: "fault",
    capacity_status: "seats_available",
    next_stop_id: "stop_04",
    eta_seconds: 540,
    last_updated_at: ago(1),
  },
  {
    vehicle_id: "B303",
    route_id: "CJ03",
    location: { lat: 2.9142, lng: 101.6708 },
    heading_degrees: 310,
    speed_kmh: 34,
    is_accessible: true,
    ramp_status: "deployed",
    capacity_status: "seats_available",
    next_stop_id: "stop_05",
    eta_seconds: 360,
    last_updated_at: ago(0),
  },
];

export const ADMIN_MOCK_OBSTACLES: ObstacleReport[] = [
  {
    id: "obs-ramp-01",
    obstacle_type: "blocked_ramp",
    location: { lat: 2.9214, lng: 101.6561 },
    description: "Ramp landing area blocked by maintenance equipment.",
    affects: ["wheelchair_ramp", "stroller_friendly"],
    status: "active",
    trust_score: 92,
    verification_count: 3,
    reported_at: ago(18),
    last_verified_at: ago(4),
    reported_by: null,
  },
  {
    id: "obs-lift-02",
    obstacle_type: "elevator_outage",
    location: { lat: 2.9169, lng: 101.6661 },
    description: "Platform lift unavailable; use the north entrance.",
    affects: ["working_elevator", "wheelchair_ramp"],
    status: "active",
    trust_score: 87,
    verification_count: 2,
    reported_at: ago(42),
    last_verified_at: ago(12),
    reported_by: null,
  },
];

export const ADMIN_MOCK_ALERTS: OperationalAlert[] = [
  {
    id: "alert-accident-01",
    type: "accident",
    severity: "critical",
    bus_id: "B101",
    route_id: "CJ01",
    location: "Persiaran APEC",
    message: "Road collision is blocking the normal route toward City Centre.",
    status: "active",
    timestamp: ago(3),
  },
  {
    id: "alert-breakdown-02",
    type: "breakdown",
    severity: "warning",
    bus_id: "B202",
    route_id: "CJ02",
    location: "Multimedia University",
    message: "Vehicle stopped after a ramp self-test fault.",
    status: "acknowledged",
    timestamp: ago(11),
  },
];

export const ADMIN_MOCK_REQUESTS: AssistanceRequest[] = [
  {
    id: "assist-1001",
    passenger_need: "Ramp and boarding support",
    stop_id: "stop_01",
    bus_id: "B101",
    status: "pending",
    timestamp: ago(2),
  },
  {
    id: "assist-1002",
    passenger_need: "Audio guidance and extra boarding time",
    stop_id: "stop_03",
    bus_id: "B303",
    status: "confirmed",
    timestamp: ago(9),
  },
  {
    id: "assist-1003",
    passenger_need: "Priority seating",
    stop_id: "stop_05",
    bus_id: null,
    status: "pending",
    timestamp: ago(14),
  },
];

const forecast = (
  stop_id: string,
  horizon_minutes: 30 | 60,
  expected_passengers: number,
  confidence: number,
): DemandForecast => ({
  stop_id,
  horizon_minutes,
  expected_passengers,
  crowd_level:
    expected_passengers >= 48
      ? "very_high"
      : expected_passengers >= 34
        ? "high"
        : expected_passengers >= 20
          ? "moderate"
          : "low",
  confidence,
  explanation: "Weekday peak pattern adjusted using current vehicle capacity and recent stop activity.",
  generated_at: ago(1),
});

export const ADMIN_MOCK_FORECASTS: DemandForecast[] = [
  forecast("stop_01", 30, 44, 0.86), forecast("stop_01", 60, 55, 0.79),
  forecast("stop_02", 30, 38, 0.84), forecast("stop_02", 60, 49, 0.77),
  forecast("stop_03", 30, 25, 0.81), forecast("stop_03", 60, 32, 0.75),
  forecast("stop_04", 30, 18, 0.78), forecast("stop_04", 60, 27, 0.72),
  forecast("stop_05", 30, 31, 0.82), forecast("stop_05", 60, 43, 0.76),
];

export const ADMIN_MOCK_INFRASTRUCTURE: InfrastructureStatus[] = [
  {
    asset_id: "ramp-B202",
    name: "Bus B202 ramp",
    type: "ramp",
    location: "Multimedia University",
    status: "faulty",
    detail: "Self-test failed; maintenance notified.",
    updated_at: ago(7),
  },
  {
    asset_id: "lift-MRT-N",
    name: "MRT north-platform lift",
    type: "lift",
    location: "MRT Cyberjaya",
    status: "faulty",
    detail: "Unavailable; direct passengers to the south entrance.",
    updated_at: ago(12),
  },
  {
    asset_id: "station-city-centre",
    name: "City Centre bay A",
    type: "station",
    location: "Cyberjaya City Centre",
    status: "inaccessible",
    detail: "Ramp landing zone blocked pending clearance.",
    updated_at: ago(4),
  },
  {
    asset_id: "ramp-B303",
    name: "Bus B303 ramp",
    type: "ramp",
    location: "Hospital Cyberjaya route",
    status: "operational",
    detail: "Last self-test passed.",
    updated_at: ago(2),
  },
];

export const ADMIN_MOCK_RECOMMENDATIONS: Recommendation[] = [
  {
    id: "rec-reroute-01",
    action: "reroute",
    reason: "The CJ01 corridor is blocked by an active accident and B101 is approaching the closure.",
    affected_bus_id: "B101",
    affected_route_id: "CJ01",
    confidence: 0.91,
    expected_impact: "Use the hospital loop; add approximately 6 minutes and preserve accessible stops.",
    approval_status: "pending",
    timestamp: ago(2),
  },
  {
    id: "rec-notify-02",
    action: "notify_passengers",
    reason: "The MRT platform lift is unavailable during the forecast peak.",
    affected_bus_id: null,
    affected_route_id: "CJ02",
    confidence: 0.88,
    expected_impact: "Notify affected passengers and direct them to the accessible south entrance.",
    approval_status: "pending",
    timestamp: ago(5),
  },
  {
    id: "rec-emergency-03",
    action: "send_emergency_assistance",
    reason: "An assistance request remains unassigned near an inaccessible station entrance.",
    affected_bus_id: null,
    affected_route_id: "CJ03",
    confidence: 0.74,
    expected_impact: "Send a station support team to verify conditions and assist the passenger.",
    approval_status: "pending",
    timestamp: ago(8),
  },
];
