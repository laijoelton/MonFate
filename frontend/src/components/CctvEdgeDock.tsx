"use client";

import { Cctv, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { ConnState, VisionEvent } from "@/types/monfate";
import { DETECTION_LABELS } from "@/types/monfate";
import { formatRelativeTime } from "@/lib/format";

const LABEL_TONE: Record<string, "ok" | "warn" | "accent" | "idle"> = {
  wheelchair: "accent",
  mobility_aid: "accent",
  stroller: "ok",
  ambulant: "idle",
  other: "idle",
};

/**
 * Station CCTV edge-vision dock: the detection feed as metadata, never frames.
 * The node runs inference locally and ships only a label + confidence, so this
 * panel deliberately has no video element to render.
 */
export function CctvEdgeDock({
  events,
  conn,
  inferP50,
  nowIso,
}: {
  events: VisionEvent[];
  conn: ConnState;
  inferP50: number | null;
  nowIso: string;
}) {
  const latest = events[0];

  return (
    <Card
      title="CCTV Edge Vision"
      icon={<Cctv aria-hidden className="h-4 w-4 text-accent" />}
      right={
        <StatusPill tone={conn === "online" ? "ok" : conn === "degraded" ? "warn" : "idle"} pulse={conn === "online"}>
          {conn === "online" ? "Inferring" : conn === "degraded" ? "Degraded" : "No node"}
        </StatusPill>
      }
    >
      <div className="mb-3 flex items-center gap-2 rounded-lg bg-slate-800/40 px-3 py-2 text-xs text-slate-400">
        <ShieldCheck aria-hidden className="h-4 w-4 shrink-0 text-ok" />
        <span>
          Image-free dispatch — these events carry labels only, never frames or faces.
        </span>
      </div>

      {latest ? (
        <div className="mb-3 rounded-lg border border-slate-700/50 bg-slate-800/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-100">
              {DETECTION_LABELS[latest.label] ?? latest.label}
            </span>
            <StatusPill tone={LABEL_TONE[latest.label] ?? "idle"}>
              {latest.confidence !== null ? `${Math.round(latest.confidence * 100)}%` : "n/a"}
            </StatusPill>
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-400">
            <div>
              <dt className="text-slate-500">Stop</dt>
              <dd className="tabular text-slate-300">{latest.device_id}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Inference</dt>
              <dd className="tabular text-slate-300">{latest.inference_ms} ms</dd>
            </div>
            <div>
              <dt className="text-slate-500">Model</dt>
              <dd className="truncate text-slate-300" title={latest.model_version}>
                {latest.is_simulation ? "simulated" : latest.model_version}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mb-3 rounded-lg border border-dashed border-slate-700/60 px-3 py-6 text-center text-xs text-slate-500">
          No detections yet. Start the backend with SYS_MOCK_DATA=true, or run
          the edge node against a stop.
        </p>
      )}

      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>Recent detections</span>
        {inferP50 !== null && <span className="tabular">p50 {inferP50} ms</span>}
      </div>

      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {events.slice(0, 12).map((e) => (
          <li
            key={e.event_id}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs odd:bg-slate-800/25"
          >
            <span className="truncate text-slate-300">
              {DETECTION_LABELS[e.label] ?? e.label}
              <span className="ml-1.5 text-slate-500">{e.device_id}</span>
            </span>
            <span className="tabular shrink-0 text-slate-500">
              {formatRelativeTime(e.observed_at, nowIso)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
