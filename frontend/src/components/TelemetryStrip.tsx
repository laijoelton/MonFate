"use client";

import { Activity, Bus, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { StatusPill } from "@/components/ui/StatusPill";
import type { ConnState, ObstacleReport, TransitVehicle } from "@/types/monfate";

function Metric({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="glass flex items-center gap-3 rounded-xl px-4 py-3">
      <span className="text-accent" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="tabular truncate text-lg font-semibold text-slate-100">{value}</p>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

const CONN_LABEL: Record<ConnState, string> = {
  online: "Live",
  degraded: "Degraded",
  offline: "Offline",
  mock: "Simulated",
};

export function TelemetryStrip({
  conn,
  pingMs,
  vehicles,
  obstacles,
}: {
  conn: ConnState;
  pingMs: number | null;
  vehicles: TransitVehicle[];
  obstacles: ObstacleReport[];
}) {
  const accessible = vehicles.filter((v) => v.is_accessible).length;
  const rampFaults = vehicles.filter((v) => v.ramp_status === "fault").length;
  const active = obstacles.filter((o) => o.status === "active");
  const trusted = active.filter((o) => o.trust_score >= 70).length;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="glass flex items-center justify-between gap-3 rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-accent" aria-hidden>
            {conn === "offline" ? <WifiOff className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-xs text-slate-500">Telemetry link</p>
            <p className="text-lg font-semibold text-slate-100">{CONN_LABEL[conn]}</p>
          </div>
        </div>
        <StatusPill
          tone={conn === "online" ? "ok" : conn === "degraded" ? "warn" : "down"}
          pulse={conn === "online"}
        >
          {pingMs !== null ? `${pingMs} ms` : "--"}
        </StatusPill>
      </div>

      <Metric
        icon={<Bus className="h-5 w-5" />}
        label="Fleet"
        value={`${accessible}/${vehicles.length}`}
        sub={rampFaults ? `${rampFaults} ramp fault${rampFaults > 1 ? "s" : ""}` : "accessible vehicles"}
      />

      <Metric
        icon={<TriangleAlert className="h-5 w-5" />}
        label="Active obstacles"
        value={String(active.length)}
        sub={`${trusted} above trust threshold`}
      />

      <Metric
        icon={<Activity className="h-5 w-5" />}
        label="Stops monitored"
        value={String(new Set(vehicles.map((v) => v.next_stop_id).filter(Boolean)).size)}
        sub="with inbound vehicles"
      />
    </div>
  );
}
