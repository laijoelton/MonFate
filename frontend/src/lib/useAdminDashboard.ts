"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCockpit } from "@/lib/useCockpit";
import { wsUrl } from "@/lib/api";
import {
  ADMIN_MOCK_ALERTS,
  ADMIN_MOCK_FORECASTS,
  ADMIN_MOCK_INFRASTRUCTURE,
  ADMIN_MOCK_OBSTACLES,
  ADMIN_MOCK_RECOMMENDATIONS,
  ADMIN_MOCK_REQUESTS,
  ADMIN_MOCK_STOPS,
  ADMIN_MOCK_VEHICLES,
} from "@/lib/admin-mock-data";
import type {
  ApprovalUiState,
  AssistanceRequest,
  DashboardMode,
  DemandForecast,
  InfrastructureStatus,
  OperationalAlert,
  Recommendation,
} from "@/types/admin";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
const REQUIRED_ADMIN_STREAMS = [
  "alerts",
  "requests",
  "forecasts",
  "infrastructure",
  "recommendations",
] as const;

function upsert<T>(items: T[], next: T, key: (item: T) => string): T[] {
  const id = key(next);
  const index = items.findIndex((item) => key(item) === id);
  if (index === -1) return [next, ...items];
  const copy = [...items];
  copy[index] = next;
  return copy;
}

async function getOptional<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function useAdminDashboard() {
  const cockpit = useCockpit();
  const [alerts, setAlerts] = useState<OperationalAlert[]>(ADMIN_MOCK_ALERTS);
  const [requests, setRequests] = useState<AssistanceRequest[]>(ADMIN_MOCK_REQUESTS);
  const [forecasts, setForecasts] = useState<DemandForecast[]>(ADMIN_MOCK_FORECASTS);
  const [infrastructure, setInfrastructure] =
    useState<InfrastructureStatus[]>(ADMIN_MOCK_INFRASTRUCTURE);
  const [recommendations, setRecommendations] =
    useState<Recommendation[]>(ADMIN_MOCK_RECOMMENDATIONS);
  const [liveStreams, setLiveStreams] = useState<Set<string>>(new Set());
  const [liveRecommendationIds, setLiveRecommendationIds] = useState<Set<string>>(new Set());
  const [approvalStates, setApprovalStates] = useState<Record<string, ApprovalUiState>>({});
  const approvalTimeouts = useRef<Record<string, number>>({});

  const markLive = useCallback((name: string) => {
    setLiveStreams((current) => {
      if (current.has(name)) return current;
      const next = new Set(current);
      next.add(name);
      return next;
    });
  }, []);

  const applyRecommendation = useCallback((recommendation: Recommendation, live = true) => {
    setRecommendations((current) => upsert(current, recommendation, (item) => item.id));
    if (live) {
      markLive("recommendations");
      setLiveRecommendationIds((current) => new Set(current).add(recommendation.id));
    }
    if (recommendation.approval_status !== "pending") {
      window.clearTimeout(approvalTimeouts.current[recommendation.id]);
      setApprovalStates((current) => ({ ...current, [recommendation.id]: "idle" }));
    }
  }, [markLive]);

  useEffect(() => {
    let closed = false;
    const timeouts = approvalTimeouts.current;

    void (async () => {
      const [liveAlerts, liveRequests, liveForecasts, liveInfrastructure, liveRecommendations] =
        await Promise.all([
          getOptional<OperationalAlert[]>("/api/v1/operational-alerts"),
          getOptional<AssistanceRequest[]>("/api/v1/assistance-requests"),
          getOptional<DemandForecast[]>("/api/v1/demand-forecasts"),
          getOptional<InfrastructureStatus[]>("/api/v1/infrastructure-status"),
          getOptional<Recommendation[]>("/api/v1/recommendations"),
        ]);
      if (closed) return;
      if (liveAlerts?.length) {
        setAlerts(liveAlerts);
        markLive("alerts");
      }
      if (liveRequests?.length) {
        setRequests(liveRequests);
        markLive("requests");
      }
      if (liveForecasts?.length) {
        setForecasts(liveForecasts);
        markLive("forecasts");
      }
      if (liveInfrastructure?.length) {
        setInfrastructure(liveInfrastructure);
        markLive("infrastructure");
      }
      if (liveRecommendations?.length) {
        setRecommendations(liveRecommendations);
        setLiveRecommendationIds(new Set(liveRecommendations.map((item) => item.id)));
        markLive("recommendations");
      }
    })();

    const socket = new WebSocket(wsUrl("/api/v1/stream"));
    socket.onmessage = (event) => {
      let frame: { kind?: string; data?: unknown };
      try {
        frame = JSON.parse(event.data) as { kind?: string; data?: unknown };
      } catch {
        return;
      }
      if (!frame.data) return;
      switch (frame.kind) {
        case "operational_alert":
          setAlerts((current) =>
            upsert(current, frame.data as OperationalAlert, (item) => item.id),
          );
          markLive("alerts");
          break;
        case "alert": {
          const candidate = frame.data as Partial<OperationalAlert>;
          if (candidate.type === "accident" || candidate.type === "breakdown") {
            setAlerts((current) =>
              upsert(current, candidate as OperationalAlert, (item) => item.id),
            );
            markLive("alerts");
          }
          break;
        }
        case "assistance_request":
          setRequests((current) =>
            upsert(current, frame.data as AssistanceRequest, (item) => item.id),
          );
          markLive("requests");
          break;
        case "demand_forecast":
          setForecasts((current) =>
            upsert(
              current,
              frame.data as DemandForecast,
              (item) => `${item.stop_id}:${item.horizon_minutes}`,
            ),
          );
          markLive("forecasts");
          break;
        case "infrastructure_status":
          setInfrastructure((current) =>
            upsert(current, frame.data as InfrastructureStatus, (item) => item.asset_id),
          );
          markLive("infrastructure");
          break;
        case "recommendation":
          applyRecommendation(frame.data as Recommendation);
          break;
      }
    };

    return () => {
      closed = true;
      socket.close();
      Object.values(timeouts).forEach((id) => window.clearTimeout(id));
    };
  }, [applyRecommendation, markLive]);

  const vehicles = cockpit.vehicleList.length >= 3 ? cockpit.vehicleList : ADMIN_MOCK_VEHICLES;
  const stops = cockpit.stops.length >= 5 ? cockpit.stops : ADMIN_MOCK_STOPS;
  const obstacles = cockpit.obstacleList.length ? cockpit.obstacleList : ADMIN_MOCK_OBSTACLES;

  const mode: DashboardMode = useMemo(() => {
    const adminLiveCount = REQUIRED_ADMIN_STREAMS.filter((name) => liveStreams.has(name)).length;
    const operationsLive = cockpit.conn !== "offline" && cockpit.vehicleList.length > 0;
    if (adminLiveCount === REQUIRED_ADMIN_STREAMS.length && operationsLive) return "live";
    if (adminLiveCount > 0 || operationsLive) return "mixed";
    return "simulated";
  }, [cockpit.conn, cockpit.vehicleList.length, liveStreams]);

  const approveRecommendation = useCallback(async (id: string) => {
    const current = recommendations.find((item) => item.id === id);
    if (!current || current.approval_status !== "pending") return;
    setApprovalStates((states) => ({ ...states, [id]: "saving" }));

    if (!liveRecommendationIds.has(id)) {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      applyRecommendation({ ...current, approval_status: "approved" }, false);
      setApprovalStates((states) => ({ ...states, [id]: "idle" }));
      return;
    }

    try {
      const response = await fetch(`${BASE}/api/v1/recommendations/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`approval failed: ${response.status}`);
      setApprovalStates((states) => ({ ...states, [id]: "waiting" }));
      approvalTimeouts.current[id] = window.setTimeout(() => {
        setApprovalStates((states) => ({ ...states, [id]: "failed" }));
      }, 4_500);
    } catch {
      setApprovalStates((states) => ({ ...states, [id]: "failed" }));
    }
  }, [applyRecommendation, liveRecommendationIds, recommendations]);

  return {
    ...cockpit,
    vehicles,
    stops,
    obstacles,
    alerts,
    requests,
    forecasts,
    infrastructure,
    recommendations,
    approvalStates,
    approveRecommendation,
    mode,
  };
}
