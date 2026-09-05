"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { getObstacles, getStops, getVehicles, wsUrl } from "./api";
import type {
  ConnState,
  DispatchAlert,
  ObstacleReport,
  TransitStop,
  TransitVehicle,
  VisionEvent,
} from "@/types/monfate";

const EVENT_LOG = 24;
const ALERT_LOG = 8;
const LAT_WINDOW = 40;
const STALE_MS = 10_000;

interface State {
  conn: ConnState;
  vehicles: Record<string, TransitVehicle>;
  obstacles: Record<string, ObstacleReport>;
  stops: TransitStop[];
  events: VisionEvent[];
  alerts: DispatchAlert[];
  pingMs: number | null;
  lagDropped: number;
  inferMs: number[];
  lastFrameAt: number | null;
}

const init: State = {
  conn: "offline",
  vehicles: {},
  obstacles: {},
  stops: [],
  events: [],
  alerts: [],
  pingMs: null,
  lagDropped: 0,
  inferMs: [],
  lastFrameAt: null,
};

type Action =
  | { type: "conn"; conn: ConnState }
  | { type: "ping"; ms: number }
  | { type: "vehicle"; v: TransitVehicle }
  | { type: "obstacle"; o: ObstacleReport }
  | { type: "vision"; e: VisionEvent }
  | { type: "alert"; a: DispatchAlert }
  | { type: "lag"; dropped: number }
  | { type: "seed"; vehicles: TransitVehicle[]; obstacles: ObstacleReport[]; stops: TransitStop[] }
  | { type: "dismissAlert"; id: string };

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "conn":
      return { ...state, conn: a.conn };
    case "ping":
      return { ...state, pingMs: a.ms };
    case "lag":
      return { ...state, lagDropped: state.lagDropped + a.dropped };
    case "vehicle":
      return {
        ...state,
        lastFrameAt: Date.now(),
        vehicles: { ...state.vehicles, [a.v.vehicle_id]: a.v },
      };
    case "obstacle":
      return {
        ...state,
        lastFrameAt: Date.now(),
        obstacles: { ...state.obstacles, [a.o.id]: a.o },
      };
    case "vision":
      return {
        ...state,
        lastFrameAt: Date.now(),
        events: [a.e, ...state.events].slice(0, EVENT_LOG),
        inferMs: [...state.inferMs, a.e.inference_ms].slice(-LAT_WINDOW),
      };
    case "alert":
      return { ...state, alerts: [a.a, ...state.alerts].slice(0, ALERT_LOG) };
    case "dismissAlert":
      return { ...state, alerts: state.alerts.filter((x) => x.alert_id !== a.id) };
    case "seed":
      return {
        ...state,
        stops: a.stops.length ? a.stops : state.stops,
        vehicles: Object.fromEntries(a.vehicles.map((v) => [v.vehicle_id, v])),
        obstacles: Object.fromEntries(a.obstacles.map((o) => [o.id, o])),
      };
    default:
      return state;
  }
}

/**
 * Live cockpit state over the backend WebSocket, with REST seeding and
 * exponential reconnect backoff. Falls back to `offline` rather than throwing:
 * the map and filters stay usable when the backend is down.
 */
export function useCockpit() {
  const [state, dispatch] = useReducer(reducer, init);
  const wsRef = useRef<WebSocket | null>(null);

  // Staleness has to be driven by a ticking clock, not by reading the wall
  // clock during render: the socket going quiet produces no state change, so a
  // render-time comparison would only re-evaluate when fresh data arrives —
  // exactly when the link is *not* stale.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 4000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let closed = false;
    let retry = 0;
    let pingTimer: number | undefined;

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(wsUrl("/api/v1/stream"));
      wsRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        dispatch({ type: "conn", conn: "online" });
        pingTimer = window.setInterval(() => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "ping", t: Date.now() }));
          }
        }, 3000);
      };

      ws.onmessage = (ev) => {
        let frame: { kind: string; data?: unknown; dropped?: number; t?: number };
        try {
          frame = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (frame.kind) {
          case "vehicle":
            return dispatch({ type: "vehicle", v: frame.data as TransitVehicle });
          case "obstacle":
            return dispatch({ type: "obstacle", o: frame.data as ObstacleReport });
          case "vision":
            return dispatch({ type: "vision", e: frame.data as VisionEvent });
          case "alert":
            return dispatch({ type: "alert", a: frame.data as DispatchAlert });
          case "lag":
            return dispatch({ type: "lag", dropped: frame.dropped ?? 0 });
          case "pong":
            return dispatch({ type: "ping", ms: Math.max(0, Date.now() - (frame.t ?? Date.now())) });
        }
      };

      const drop = () => {
        window.clearInterval(pingTimer);
        dispatch({ type: "conn", conn: "offline" });
        if (!closed) {
          retry = Math.min(retry + 1, 6);
          window.setTimeout(connect, 500 * 2 ** (retry - 1));
        }
      };
      ws.onclose = drop;
      ws.onerror = () => ws.close();
    };

    void (async () => {
      try {
        const [vehicles, obstacles, stops] = await Promise.all([
          getVehicles().catch(() => []),
          getObstacles().catch(() => []),
          getStops().catch(() => []),
        ]);
        dispatch({ type: "seed", vehicles, obstacles, stops });
      } catch {
        /* backend not up yet — the cockpit still renders */
      }
    })();

    connect();
    return () => {
      closed = true;
      window.clearInterval(pingTimer);
      wsRef.current?.close();
    };
  }, []);

  const conn: ConnState = useMemo(() => {
    if (state.conn === "offline") return "offline";
    const stale = state.lastFrameAt !== null && tick - state.lastFrameAt > STALE_MS;
    return stale || state.lagDropped > 0 ? "degraded" : "online";
  }, [state.conn, state.lastFrameAt, state.lagDropped, tick]);

  const inferP50 = useMemo(() => {
    if (!state.inferMs.length) return null;
    const s = [...state.inferMs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }, [state.inferMs]);

  return {
    ...state,
    conn,
    inferP50,
    vehicleList: Object.values(state.vehicles),
    obstacleList: Object.values(state.obstacles),
    dismissAlert: (id: string) => dispatch({ type: "dismissAlert", id }),
    pushObstacle: (o: ObstacleReport) => dispatch({ type: "obstacle", o }),
  };
}
