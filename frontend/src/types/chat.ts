import type { AccessibilityFeature, ObstacleType } from "@/types/monfate";

export interface CitizenChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface AssistanceProposal {
  action: "assistance_request";
  passenger_need: string;
  stop_id: string;
  bus_id: string | null;
}

export interface ObstacleProposal {
  action: "obstacle_report";
  obstacle_type: ObstacleType;
  stop_id: string;
  description: string;
  affects: AccessibilityFeature[];
}

export type ChatActionProposal = AssistanceProposal | ObstacleProposal;

export type ProposalState = "pending" | "submitting" | "submitted" | "cancelled" | "failed";

export interface PendingProposal {
  id: string;
  proposal: ChatActionProposal;
  state: ProposalState;
  error?: string;
}
