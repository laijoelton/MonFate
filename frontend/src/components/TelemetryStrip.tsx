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
  appearance,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  appearance: "default" | "sampai";
}) {
  const isSampai = appearance === "sampai";

  return (
    <div
      className={`${
        isSampai
          ? "flex items-center gap-3 rounded-[18px] border border-[#d9e4df] bg-white px-4 py-3 shadow-[0_7px_22px_rgba(26,61,48,0.06)]"
          : "glass flex items-center gap-3 rounded-xl px-4 py-3"
      }`}
    >
      <span
        className={isSampai ? "rounded-xl bg-[#e4f4ee] p-2 text-[#0b6b52]" : "text-accent"}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className={`text-xs ${isSampai ? "text-[#66736d]" : "text-slate-500"}`}>{label}</p>
        <p className={`tabular truncate text-lg font-semibold ${isSampai ? "text-[#17211d]" : "text-slate-100"}`}>{value}</p>
        {sub && <p className={`truncate text-xs ${isSampai ? "text-[#66736d]" : "text-slate-500"}`}>{sub}</p>}
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
  appearance = "default",
}: {
  conn: ConnState;
  pingMs: number | null;
  vehicles: TransitVehicle[];
  obstacles: ObstacleReport[];
  appearance?: "default" | "sampai";
}) {
  const isSampai = appearance === "sampai";
  const accessible = vehicles.filter((v) => v.is_accessible).length;
  const rampFaults = vehicles.filter((v) => v.ramp_status === "fault").length;
  const active = obstacles.filter((o) => o.status === "active");
  const trusted = active.filter((o) => o.trust_score >= 70).length;
  const sampaiConnectionClass = conn === "online"
    ? "bg-[#e7f7ec] text-[#24733b] ring-[#a9d9b7]"
    : conn === "degraded"
      ? "bg-[#fff4d9] text-[#875f04] ring-[#ead5a4]"
      : "bg-[#fff0f0] text-[#9c2d32] ring-[#efbfc1]";

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className={`${isSampai ? "flex items-center justify-between gap-3 rounded-[18px] border border-[#d9e4df] bg-white px-4 py-3 shadow-[0_7px_22px_rgba(26,61,48,0.06)]" : "glass flex items-center justify-between gap-3 rounded-xl px-4 py-3"}`}>
        <div className="flex items-center gap-3">
          <span className={isSampai ? "rounded-xl bg-[#e4f4ee] p-2 text-[#0b6b52]" : "text-accent"} aria-hidden>
            {conn === "offline" ? <WifiOff className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}
          </span>
          <div>
            <p className={`text-xs ${isSampai ? "text-[#66736d]" : "text-slate-500"}`}>Telemetry link</p>
            <p className={`text-lg font-semibold ${isSampai ? "text-[#17211d]" : "text-slate-100"}`}>{CONN_LABEL[conn]}</p>
          </div>
        </div>
        {isSampai ? (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${sampaiConnectionClass}`}>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-current ${conn === "online" ? "animate-livepulse" : ""}`} />
            {pingMs !== null ? `${pingMs} ms` : "--"}
          </span>
        ) : (
          <StatusPill
            tone={conn === "online" ? "ok" : conn === "degraded" ? "warn" : "down"}
            pulse={conn === "online"}
          >
            {pingMs !== null ? `${pingMs} ms` : "--"}
          </StatusPill>
        )}
      </div>

      <Metric
        icon={<Bus className="h-5 w-5" />}
        label="Fleet"
        value={`${accessible}/${vehicles.length}`}
        sub={rampFaults ? `${rampFaults} ramp fault${rampFaults > 1 ? "s" : ""}` : "accessible vehicles"}
        appearance={appearance}
      />

      <Metric
        icon={<TriangleAlert className="h-5 w-5" />}
        label="Active obstacles"
        value={String(active.length)}
        sub={`${trusted} above trust threshold`}
        appearance={appearance}
      />

      <Metric
        icon={<Activity className="h-5 w-5" />}
        label="Stops monitored"
        value={String(new Set(vehicles.map((v) => v.next_stop_id).filter(Boolean)).size)}
        sub="with inbound vehicles"
        appearance={appearance}
      />
    </div>
  );
}
