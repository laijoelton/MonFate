"use client";

import { useEffect, useState } from "react";
import { getAssistanceRequests, wsUrl } from "./api";
import type { AssistanceRequest } from "@/types/admin";

function upsert(
  current: AssistanceRequest[],
  incoming: AssistanceRequest,
): AssistanceRequest[] {
  return [incoming, ...current.filter((item) => item.id !== incoming.id)].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  );
}

/**
 * Seeds confirmed chatbot assistance requests from FastAPI, then keeps the
 * queue current through the backend's existing assistance_request stream.
 */
export function useBackendAssistanceRequests() {
  const [requests, setRequests] = useState<AssistanceRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;

    getAssistanceRequests()
      .then((items) => {
        if (!stopped) {
          setRequests(items);
          setLoaded(true);
          setError(null);
        }
      })
      .catch(() => {
        if (!stopped) {
          setLoaded(true);
          setError("FastAPI assistance service is unavailable.");
        }
      });

    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(wsUrl("/api/v1/stream"));
      socket.onopen = () => {
        setConnected(true);
        setError(null);
      };
      socket.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data) as { kind?: string; data?: unknown };
          if (frame.kind === "assistance_request" && frame.data) {
            setRequests((current) =>
              upsert(current, frame.data as AssistanceRequest),
            );
          }
        } catch {
          // Ignore malformed/unrelated frames; the REST seed remains usable.
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!stopped) reconnectTimer = window.setTimeout(connect, 1500);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return { requests, loaded, connected, error };
}
