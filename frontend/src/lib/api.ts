/**
 * Backend client. Paths are relative so a dev proxy or same-origin deploy both
 * work; set NEXT_PUBLIC_BACKEND_URL to point at a backend on another host.
 */

import type {
  ObstacleReport,
  TransitStop,
  TransitVehicle,
  VisionEvent,
} from "@/types/monfate";
import type { CitizenChatMessage } from "@/types/chat";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const getHealth = () => get<{ status: string; mock_data: boolean }>("/health");
export const getObstacles = () => get<ObstacleReport[]>("/api/v1/obstacles");
export const getVehicles = () => get<TransitVehicle[]>("/api/v1/vehicles");
export const getStops = () => get<TransitStop[]>("/api/v1/stops");
export const getStopEvents = (stopId: string) =>
  get<VisionEvent[]>(`/api/v1/stops/${stopId}/events`);

export function wsUrl(path: string): string {
  if (BASE) return BASE.replace(/^http/, "ws") + path;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

export async function postObstacle(body: {
  obstacle_type: string;
  location: { lat: number; lng: number };
  description: string;
  affects: string[];
  reported_by?: string | null;
}): Promise<{ status: string; obstacle: ObstacleReport }> {
  const res = await fetch(`${BASE}/api/v1/obstacles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`report failed: ${res.status}`);
  return res.json();
}

export async function postAssistanceRequest(body: {
  passenger_need: string;
  stop_id: string;
  bus_id: string | null;
  client_request_id: string;
}) {
  const res = await fetch(`${BASE}/api/v1/assistance-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`assistance request failed: ${res.status}`);
  return res.json() as Promise<{
    status: string;
    created: boolean;
    assistance_request: { id: string; status: string };
  }>;
}

export async function openChatStream(
  messages: Pick<CitizenChatMessage, "role" | "content">[],
  sessionId: string,
  signal: AbortSignal,
) {
  const response = await fetch(`${BASE}/api/v1/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Chat-Session-ID": sessionId,
    },
    body: JSON.stringify({ messages: messages.slice(-20) }),
    signal,
  });
  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? `chat failed: ${response.status}`);
  }
  return response.body;
}
