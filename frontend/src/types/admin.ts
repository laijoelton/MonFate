import type { Coordinates } from "@/types/monfate";

export type OperationalAlertType = "accident" | "breakdown";
export type OperationalSeverity = "info" | "warning" | "critical";
export type OperationalStatus = "active" | "acknowledged" | "resolved";

export interface OperationalAlert {
  id: string;
  type: OperationalAlertType;
  severity: OperationalSeverity;
  bus_id: string;
  route_id: string;
  location: string;
  message: string;
  status: OperationalStatus;
  timestamp: string;
}

export type AssistanceRequestStatus = "pending" | "confirmed" | "completed" | "cancelled";

export interface AssistanceRequest {
  id: string;
  passenger_need: string;
  stop_id: string;
  bus_id: string | null;
  status: AssistanceRequestStatus;
  timestamp: string;
}

export type DemandCrowdLevel = "low" | "moderate" | "high" | "very_high";

export interface DemandForecast {
  stop_id: string;
  horizon_minutes: 30 | 60;
  expected_passengers: number;
  crowd_level: DemandCrowdLevel;
  confidence: number;
  explanation: string;
  generated_at: string;
}

export type InfrastructureType = "ramp" | "lift" | "station";
export type InfrastructureState = "operational" | "faulty" | "inaccessible";

export interface InfrastructureStatus {
  asset_id: string;
  name: string;
  type: InfrastructureType;
  location: string;
  coordinates?: Coordinates;
  status: InfrastructureState;
  detail: string;
  updated_at: string;
}

export type RecommendationAction =
  | "dispatch"
  | "reroute"
  | "notify_passengers"
  | "send_emergency_assistance";
export type RecommendationStatus = "pending" | "approved" | "rejected";

export interface Recommendation {
  id: string;
  action: RecommendationAction;
  reason: string;
  affected_bus_id: string | null;
  affected_route_id: string | null;
  confidence: number;
  expected_impact: string;
  approval_status: RecommendationStatus;
  timestamp: string;
}

export type DashboardMode = "live" | "mixed" | "simulated";
export type ApprovalUiState = "idle" | "saving" | "waiting" | "failed";
