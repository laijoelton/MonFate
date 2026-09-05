"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bus,
  CheckCircle2,
  Clock3,
  Construction,
  DoorOpen,
  MapPin,
  Route,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  UserRoundCheck,
  Wrench,
  X,
} from "lucide-react";
import { MapHud } from "@/components/MapHud";
import { TelemetryStrip } from "@/components/TelemetryStrip";
import { TransitTrackerCard } from "@/components/TransitTrackerCard";
import { Card } from "@/components/ui/Card";
import { useAdminDashboard } from "@/lib/useAdminDashboard";
import type {
  AssistanceRequestStatus,
  InfrastructureState,
  OperationalSeverity,
  Recommendation,
} from "@/types/admin";

const severityRank: Record<OperationalSeverity, number> = { critical: 3, warning: 2, info: 1 };
const severityStyle: Record<OperationalSeverity, string> = {
  critical: "border-down/40 bg-down/10 text-down",
  warning: "border-warn/40 bg-warn/10 text-warn",
  info: "border-accent/40 bg-accent/10 text-accent",
};
const infrastructureStyle: Record<InfrastructureState, string> = {
  operational: "bg-ok/15 text-ok ring-ok/30",
  faulty: "bg-warn/15 text-warn ring-warn/30",
  inaccessible: "bg-down/15 text-down ring-down/30",
};
const requestStyle: Record<AssistanceRequestStatus, string> = {
  pending: "bg-warn/15 text-warn ring-warn/30",
  confirmed: "bg-accent/15 text-accent ring-accent/30",
  completed: "bg-ok/15 text-ok ring-ok/30",
  cancelled: "bg-slate-700/50 text-slate-400 ring-slate-600/50",
};

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown time" : `${date.toISOString().slice(11, 16)} UTC`;
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {children}
      </select>
    </label>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <article className="glass rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="tabular mt-2 text-3xl font-bold text-slate-50">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </div>
        <span className="rounded-xl bg-accent/10 p-2.5 text-accent" aria-hidden>{icon}</span>
      </div>
    </article>
  );
}

export default function AdminDashboard() {
  const dashboard = useAdminDashboard();
  const [severity, setSeverity] = useState("all");
  const [requestStatus, setRequestStatus] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [selectedObstacle, setSelectedObstacle] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Recommendation | null>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const lastApprovalTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!confirming) return;
    confirmCancelRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConfirming(null);
        window.setTimeout(() => lastApprovalTrigger.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [confirming]);

  const routeOptions = useMemo(
    () => [...new Set(dashboard.vehicles.map((vehicle) => vehicle.route_id))].sort(),
    [dashboard.vehicles],
  );

  const visibleAlerts = useMemo(
    () => dashboard.alerts
      .filter((alert) => severity === "all" || alert.severity === severity)
      .filter((alert) => routeFilter === "all" || alert.route_id === routeFilter)
      .sort((a, b) => severityRank[b.severity] - severityRank[a.severity]),
    [dashboard.alerts, routeFilter, severity],
  );

  const visibleRequests = useMemo(
    () => dashboard.requests
      .filter((request) => requestStatus === "all" || request.status === requestStatus)
      .filter((request) => routeFilter === "all" || request.bus_id === null ||
        dashboard.vehicles.find((vehicle) => vehicle.vehicle_id === request.bus_id)?.route_id === routeFilter)
      .sort((a, b) => (a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0)),
    [dashboard.requests, dashboard.vehicles, requestStatus, routeFilter],
  );

  const pendingRequests = dashboard.requests.filter((request) => request.status === "pending").length;
  const activeAlerts = dashboard.alerts.filter((alert) => alert.status === "active").length;
  const unavailableAssets = dashboard.infrastructure.filter((asset) => asset.status !== "operational").length;
  const pendingRecommendations = dashboard.recommendations.filter(
    (recommendation) => recommendation.approval_status === "pending",
  ).length;
  const maxDemand = Math.max(1, ...dashboard.forecasts.map((item) => item.expected_passengers));

  const closeConfirmation = () => {
    setConfirming(null);
    window.setTimeout(() => lastApprovalTrigger.current?.focus(), 0);
  };

  const approve = (recommendation: Recommendation, trigger: HTMLButtonElement) => {
    if (recommendation.action === "send_emergency_assistance") {
      lastApprovalTrigger.current = trigger;
      setConfirming(recommendation);
      return;
    }
    void dashboard.approveRecommendation(recommendation.id);
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-800/70 bg-slate-950/45 px-4 py-4 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="rounded-full border border-slate-700 p-2 text-slate-300 hover:border-accent/50 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label="Return to citizen cockpit"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Operations control</p>
              <h1 className="text-xl font-bold tracking-tight text-slate-50">MonFate Admin Dashboard</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${
                dashboard.mode === "live"
                  ? "bg-ok/15 text-ok ring-ok/30"
                  : dashboard.mode === "mixed"
                    ? "bg-warn/15 text-warn ring-warn/30"
                    : "bg-accent/15 text-accent ring-accent/30"
              }`}
              role="status"
            >
              {dashboard.mode === "live" ? "Live services" : dashboard.mode === "mixed" ? "Live + fallback" : "Simulated data"}
            </span>
            <Link
              href="/"
              className="hidden rounded-full bg-accent px-4 py-2 text-sm font-semibold text-slate-950 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
            >
              Citizen cockpit
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] flex-1 space-y-5 px-4 py-5 md:px-6">
        <section aria-labelledby="overview-title">
          <h2 id="overview-title" className="sr-only">Operations overview</h2>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard label="Active fleet" value={String(dashboard.vehicles.length)} detail="Three buses tracked" icon={<Bus className="h-5 w-5" />} />
            <MetricCard label="Open requests" value={String(pendingRequests)} detail="Passenger accessibility" icon={<UserRoundCheck className="h-5 w-5" />} />
            <MetricCard label="Active incidents" value={String(activeAlerts)} detail="Accidents and breakdowns" icon={<TriangleAlert className="h-5 w-5" />} />
            <MetricCard label="Awaiting approval" value={String(pendingRecommendations)} detail="Human decision required" icon={<Sparkles className="h-5 w-5" />} />
          </div>
        </section>

        <TelemetryStrip conn={dashboard.conn} pingMs={dashboard.pingMs} vehicles={dashboard.vehicles} obstacles={dashboard.obstacles} />

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]" aria-labelledby="live-operations-title">
          <Card title="Live bus locations">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-400">
              <span id="live-operations-title">Cyberjaya network · five monitored stops</span>
              <span className="inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-ok" aria-hidden /> Position stream</span>
            </div>
            <div className="h-[390px]">
              <MapHud
                obstacles={dashboard.obstacles}
                vehicles={dashboard.vehicles}
                stops={dashboard.stops}
                activeFilters={new Set()}
                selectedObstacleId={selectedObstacle}
                onSelectObstacle={(obstacle) => setSelectedObstacle(obstacle.id)}
              />
            </div>
            <p className="mt-2 min-h-5 text-xs text-slate-400" aria-live="polite">
              {selectedObstacle
                ? dashboard.obstacles.find((obstacle) => obstacle.id === selectedObstacle)?.description
                : "Select an obstacle marker for operational details."}
            </p>
          </Card>

          <Card title="Fleet and crowd levels">
            <div className="max-h-[470px] space-y-3 overflow-y-auto pr-1">
              {dashboard.vehicles.map((vehicle) => (
                <TransitTrackerCard key={vehicle.vehicle_id} vehicle={vehicle} />
              ))}
            </div>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card title="Accident and breakdown alerts">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-400">Urgent incidents are shown first.</p>
              <div className="flex flex-wrap gap-2">
                <SelectField label="Severity" value={severity} onChange={setSeverity}>
                  <option value="all">All</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option>
                </SelectField>
                <SelectField label="Route" value={routeFilter} onChange={setRouteFilter}>
                  <option value="all">All</option>{routeOptions.map((route) => <option key={route} value={route}>{route}</option>)}
                </SelectField>
              </div>
            </div>
            <div className="space-y-3" aria-live="polite">
              {visibleAlerts.length === 0 ? <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No incidents match these filters.</p> : visibleAlerts.map((alert) => (
                <article key={alert.id} className={`rounded-xl border p-4 ${severityStyle[alert.severity]}`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm text-slate-100">{titleCase(alert.type)}</strong>
                        <span className="rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-semibold uppercase">{alert.severity}</span>
                        <span className="text-xs text-slate-400">{alert.status}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-300">{alert.message}</p>
                      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                        <span>{alert.bus_id} · {alert.route_id}</span><span>{alert.location}</span><span>{timeLabel(alert.timestamp)}</span>
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </Card>

          <Card title="Passenger accessibility requests">
            <div className="mb-4 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-400">Pending requests are shown first.</p>
              <SelectField label="Status" value={requestStatus} onChange={setRequestStatus}>
                <option value="all">All</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
              </SelectField>
            </div>
            <div className="space-y-3" aria-live="polite">
              {visibleRequests.length === 0 ? <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No requests match these filters.</p> : visibleRequests.map((request) => (
                <article key={request.id} className="rounded-xl border border-slate-700/70 bg-slate-900/45 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{request.passenger_need}</p>
                      <p className="mt-1 text-xs text-slate-400">{request.stop_id} · {request.bus_id ?? "Bus not assigned"}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ring-1 ring-inset ${requestStyle[request.status]}`}>{request.status}</span>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" aria-hidden /> Received {timeLabel(request.timestamp)}</p>
                </article>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
          <Card title="Peak-hour demand heatmap">
            <p className="mb-4 text-xs text-slate-400">Expected passengers by stop. Darker cells indicate greater demand.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] border-separate border-spacing-2 text-left text-xs">
                <caption className="sr-only">Passenger demand forecast for the next 30 and 60 minutes</caption>
                <thead><tr className="text-slate-500"><th scope="col" className="px-2 font-medium">Stop</th><th scope="col" className="px-2 font-medium">Now</th><th scope="col" className="px-2 font-medium">+30 min</th><th scope="col" className="px-2 font-medium">+60 min</th></tr></thead>
                <tbody>
                  {dashboard.stops.map((stop) => {
                    const f30 = dashboard.forecasts.find((item) => item.stop_id === stop.stop_id && item.horizon_minutes === 30);
                    const f60 = dashboard.forecasts.find((item) => item.stop_id === stop.stop_id && item.horizon_minutes === 60);
                    const values = [Math.round((f30?.expected_passengers ?? 0) * 0.7), f30?.expected_passengers ?? 0, f60?.expected_passengers ?? 0];
                    return <tr key={stop.stop_id}>
                      <th scope="row" className="max-w-44 truncate px-2 py-2 font-medium text-slate-200">{stop.name}</th>
                      {values.map((value, index) => <td key={index} className="tabular rounded-lg border border-accent/20 px-4 py-3 text-center font-semibold text-slate-50" style={{ backgroundColor: `oklch(0.55 0.13 230 / ${0.14 + (value / maxDemand) * 0.7})` }} aria-label={`${value} expected passengers ${index === 0 ? "now" : `in ${index * 30} minutes`}`}>{value}</td>)}
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[30, 60].map((horizon) => {
                const items = dashboard.forecasts.filter((item) => item.horizon_minutes === horizon);
                const total = items.reduce((sum, item) => sum + item.expected_passengers, 0);
                const confidence = items.length ? items.reduce((sum, item) => sum + item.confidence, 0) / items.length : 0;
                return <div key={horizon} className="rounded-xl border border-slate-700/70 bg-slate-900/45 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{horizon}-minute forecast</p>
                  <p className="tabular mt-1 text-2xl font-bold text-slate-50">{total} <span className="text-sm font-normal text-slate-400">passengers</span></p>
                  <p className="mt-1 text-xs text-slate-400">{Math.round(confidence * 100)}% confidence · weekday pattern + live capacity</p>
                </div>;
              })}
            </div>
          </Card>

          <Card title="Accessibility infrastructure">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-400"><span>Ramps, lifts and stations</span><span>{unavailableAssets} need attention</span></div>
            <div className="space-y-3">
              {dashboard.infrastructure.map((asset) => (
                <article key={asset.asset_id} className="rounded-xl border border-slate-700/70 bg-slate-900/45 p-4">
                  <div className="flex items-start gap-3">
                    <span className="rounded-lg bg-slate-800 p-2 text-slate-300" aria-hidden>{asset.type === "ramp" ? <DoorOpen className="h-4 w-4" /> : asset.type === "lift" ? <Wrench className="h-4 w-4" /> : <Construction className="h-4 w-4" />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-100">{asset.name}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ring-1 ring-inset ${infrastructureStyle[asset.status]}`}>{asset.status}</span></div>
                      <p className="mt-1 text-xs text-slate-400">{asset.detail}</p>
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" aria-hidden /> {asset.location} · {timeLabel(asset.updated_at)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </Card>
        </section>

        <section aria-labelledby="recommendations-title">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Decision support</p><h2 id="recommendations-title" className="text-lg font-bold text-slate-50">AI recommendations requiring human approval</h2></div><p className="text-xs text-slate-400">No operational action runs automatically.</p></div>
          <div className="grid gap-4 lg:grid-cols-3">
            {dashboard.recommendations.map((recommendation) => {
              const uiState = dashboard.approvalStates[recommendation.id] ?? "idle";
              const isApproved = recommendation.approval_status === "approved";
              return <article key={recommendation.id} className="glass flex flex-col rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3"><span className="rounded-xl bg-accent/10 p-2.5 text-accent" aria-hidden>{recommendation.action === "reroute" ? <Route className="h-5 w-5" /> : recommendation.action === "send_emergency_assistance" ? <ShieldAlert className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}</span><span className="tabular rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">{Math.round(recommendation.confidence * 100)}% confidence</span></div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-accent">{titleCase(recommendation.action)}</p>
                <h3 className="mt-1 text-base font-semibold text-slate-50">{recommendation.affected_bus_id ?? recommendation.affected_route_id ?? "Network action"}</h3>
                <p className="mt-2 text-sm text-slate-300">{recommendation.reason}</p>
                <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-900/50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Expected impact</p><p className="mt-1 text-xs text-slate-300">{recommendation.expected_impact}</p></div>
                <div className="mt-auto pt-5">
                  {isApproved ? <p className="flex items-center justify-center gap-2 rounded-xl bg-ok/15 px-4 py-3 text-sm font-semibold text-ok" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden /> Approved by operator</p> : <button type="button" onClick={(event) => approve(recommendation, event.currentTarget)} disabled={uiState === "saving" || uiState === "waiting"} className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-slate-950 hover:opacity-90 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{uiState === "saving" ? "Sending approval…" : uiState === "waiting" ? "Waiting for live confirmation…" : uiState === "failed" ? "Retry approval" : "Approve Recommendation"}</button>}
                  {uiState === "failed" && <p className="mt-2 text-xs text-down" role="alert">Approval was not confirmed. The recommendation remains pending.</p>}
                </div>
              </article>;
            })}
          </div>
        </section>
      </main>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeConfirmation(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="emergency-title" className="glass w-full max-w-lg rounded-2xl p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><span className="rounded-xl bg-down/15 p-3 text-down"><ShieldAlert className="h-6 w-6" aria-hidden /></span><button type="button" onClick={closeConfirmation} className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="Close emergency approval"><X className="h-4 w-4" /></button></div>
            <h2 id="emergency-title" className="mt-5 text-xl font-bold text-slate-50">Confirm emergency assistance</h2>
            <p className="mt-2 text-sm text-slate-300">This sends a high-priority operational instruction. Confirm that a human operator has reviewed the evidence.</p>
            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300"><strong className="text-slate-100">Reason:</strong> {confirming.reason}</div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button ref={confirmCancelRef} type="button" onClick={closeConfirmation} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800">Cancel</button><button type="button" onClick={() => { const id = confirming.id; closeConfirmation(); void dashboard.approveRecommendation(id); }} className="rounded-xl bg-down px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">Confirm and send</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
