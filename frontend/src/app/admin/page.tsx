"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Accessibility,
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bus,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Construction,
  DoorOpen,
  LayoutDashboard,
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

type Dashboard = ReturnType<typeof useAdminDashboard>;
type AdminView = "overview" | "operations" | "accessibility" | "demand" | "recommendations";

const views: Array<{
  id: AdminView;
  label: string;
  mobileLabel: string;
  description: string;
  icon: ReactNode;
}> = [
  { id: "overview", label: "Overview", mobileLabel: "Overview", description: "Network summary", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "operations", label: "Live operations", mobileLabel: "Operations", description: "Fleet and incidents", icon: <Bus className="h-4 w-4" /> },
  { id: "accessibility", label: "Accessibility", mobileLabel: "Access", description: "Requests and assets", icon: <Accessibility className="h-4 w-4" /> },
  { id: "demand", label: "Demand intelligence", mobileLabel: "Demand", description: "30 and 60 min forecast", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "recommendations", label: "AI recommendations", mobileLabel: "AI", description: "Human approval queue", icon: <Sparkles className="h-4 w-4" /> },
];

const validViews = new Set<AdminView>(views.map((view) => view.id));
const severityRank: Record<OperationalSeverity, number> = { critical: 3, warning: 2, info: 1 };
const severityStyle: Record<OperationalSeverity, string> = {
  critical: "border-[#f0c4b7] bg-[#fff2ed] text-[#9c2d32]",
  warning: "border-[#ead5a4] bg-[#fff8e7] text-[#875f04]",
  info: "border-[#b9d3ef] bg-[#eef6ff] text-[#245d9f]",
};
const infrastructureStyle: Record<InfrastructureState, string> = {
  operational: "bg-[#e7f7ec] text-[#24733b] ring-[#a9d9b7]",
  faulty: "bg-[#fff4d9] text-[#875f04] ring-[#ead5a4]",
  inaccessible: "bg-[#fff0f0] text-[#9c2d32] ring-[#efbfc1]",
};
const requestStyle: Record<AssistanceRequestStatus, string> = {
  pending: "bg-[#fff4d9] text-[#875f04] ring-[#ead5a4]",
  confirmed: "bg-[#e6f1ff] text-[#245d9f] ring-[#b9d3ef]",
  completed: "bg-[#e7f7ec] text-[#24733b] ring-[#a9d9b7]",
  cancelled: "bg-[#eef2f0] text-[#66736d] ring-[#d9e4df]",
};

const surface = "rounded-[20px] border border-[#d9e4df] bg-white shadow-[0_7px_22px_rgba(26,61,48,0.07)]";
const itemSurface = "rounded-[17px] border border-[#d9e4df] bg-white";
const focusRing = "focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#84d4ba]";

const timeLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown time" : `${date.toISOString().slice(11, 16)} UTC`;
};

const titleCase = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-[#52615a]">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`rounded-xl border border-[#cddad4] bg-white px-3 py-2 text-xs font-semibold text-[#17211d] ${focusRing}`}>{children}</select>
    </label>
  );
}

function MetricCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return (
    <article className={`${surface} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#66736d]">{label}</p><p className="tabular mt-2 text-3xl font-black text-[#17211d]">{value}</p><p className="mt-1 text-xs text-[#66736d]">{detail}</p></div>
        <span className="rounded-[13px] bg-[#e4f4ee] p-2.5 text-[#0b6b52]" aria-hidden>{icon}</span>
      </div>
    </article>
  );
}

function ViewHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div><p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#0b6b52]">{eyebrow}</p><h2 className="mt-1 text-2xl font-black tracking-[-.025em] text-[#17211d] md:text-3xl">{title}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[#66736d]">{description}</p></div>
  );
}

function Preview({ view, label, title, detail, urgent = false }: { view: AdminView; label: string; title: string; detail: string; urgent?: boolean }) {
  return (
    <Link href={`/admin?view=${view}`} scroll={false} className={`group ${surface} ${focusRing} flex min-h-36 flex-col p-4 transition hover:-translate-y-0.5 hover:border-[#a9cbbb] hover:shadow-[0_10px_28px_rgba(26,61,48,0.11)]`}>
      <div className="flex justify-between gap-3"><p className={`text-xs font-extrabold uppercase tracking-[.12em] ${urgent ? "text-[#b92d32]" : "text-[#0b6b52]"}`}>{label}</p><ChevronRight className="h-4 w-4 text-[#839089] transition group-hover:text-[#0b6b52]" aria-hidden /></div>
      <p className="mt-3 text-sm font-bold text-[#17211d]">{title}</p><p className="mt-1 text-xs leading-5 text-[#66736d]">{detail}</p>
    </Link>
  );
}

function Overview({ dashboard }: { dashboard: Dashboard }) {
  const requests = dashboard.requests.filter((item) => item.status === "pending");
  const alerts = dashboard.alerts.filter((item) => item.status === "active").sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  const assets = dashboard.infrastructure.filter((item) => item.status !== "operational");
  const recommendations = dashboard.recommendations.filter((item) => item.approval_status === "pending");
  const request = [...requests].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))[0];
  const demand = (horizon: number) => dashboard.forecasts.filter((item) => item.horizon_minutes === horizon).reduce((sum, item) => sum + item.expected_passengers, 0);

  return (
    <div className="space-y-5">
      <ViewHeader eyebrow="Command centre" title="Operations overview" description="The highest-priority information from every operator workflow." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
        <MetricCard label="Active fleet" value={`${dashboard.vehicles.length}`} detail="Buses tracked" icon={<Bus className="h-5 w-5" />} />
        <MetricCard label="Open requests" value={`${requests.length}`} detail="Passenger accessibility" icon={<UserRoundCheck className="h-5 w-5" />} />
        <MetricCard label="Active incidents" value={`${alerts.length}`} detail="Accidents and breakdowns" icon={<TriangleAlert className="h-5 w-5" />} />
        <MetricCard label="Awaiting approval" value={`${recommendations.length}`} detail="Human decision required" icon={<Sparkles className="h-5 w-5" />} />
        <MetricCard label="Assets unavailable" value={`${assets.length}`} detail="Ramps, lifts and stations" icon={<Wrench className="h-5 w-5" />} />
      </div>
      <TelemetryStrip appearance="sampai" conn={dashboard.conn} pingMs={dashboard.pingMs} vehicles={dashboard.vehicles} obstacles={dashboard.obstacles} />
      <section><h3 className="mb-3 text-lg font-black text-[#17211d]">What needs attention now</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Preview view="operations" label="Incident" urgent={alerts[0]?.severity === "critical"} title={alerts[0] ? `${titleCase(alerts[0].type)} · ${alerts[0].route_id}` : "No active incidents"} detail={alerts[0]?.message ?? "No unresolved operational alerts."} />
        <Preview view="accessibility" label="Accessibility" title={request?.passenger_need ?? "No pending assistance"} detail={request ? `${request.stop_id} · ${request.bus_id ?? "Bus not assigned"}` : `${assets.length} assets need attention.`} />
        <Preview view="demand" label="Demand" title={`${demand(30)} passengers in 30 minutes`} detail={`${demand(60)} passengers expected in 60 minutes.`} />
        <Preview view="recommendations" label="Decision support" urgent={recommendations[0]?.action === "send_emergency_assistance"} title={recommendations[0] ? titleCase(recommendations[0].action) : "Approval queue clear"} detail={recommendations[0]?.reason ?? "No recommendations are waiting."} />
      </div></section>
    </div>
  );
}

function IncidentList({ dashboard, severity, route }: { dashboard: Dashboard; severity: string; route: string }) {
  const items = dashboard.alerts.filter((item) => severity === "all" || item.severity === severity).filter((item) => route === "all" || item.route_id === route).sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  return (
    <div className="grid gap-3 xl:grid-cols-2" aria-live="polite">
      {items.length ? items.map((alert) => <article key={alert.id} className={`rounded-[17px] border p-4 ${severityStyle[alert.severity]}`}><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-[#17211d]">{titleCase(alert.type)}</strong><span className="rounded-full border border-current/30 px-2 py-.5 text-[10px] font-extrabold uppercase">{alert.severity}</span><span className="text-xs text-[#66736d]">{alert.status}</span></div><p className="mt-1 text-sm text-[#46534d]">{alert.message}</p><p className="mt-2 flex flex-wrap gap-3 text-xs text-[#66736d]"><span>{alert.bus_id} · {alert.route_id}</span><span>{alert.location}</span><span>{timeLabel(alert.timestamp)}</span></p></div></div></article>) : <p className="rounded-[17px] border border-dashed border-[#b7c9c1] p-6 text-center text-sm text-[#66736d]">No incidents match these filters.</p>}
    </div>
  );
}

function Operations({ dashboard, severity, setSeverity, route, setRoute, obstacle, setObstacle }: { dashboard: Dashboard; severity: string; setSeverity: (value: string) => void; route: string; setRoute: (value: string) => void; obstacle: string | null; setObstacle: (value: string | null) => void }) {
  const routes = [...new Set(dashboard.vehicles.map((item) => item.route_id))].sort();
  return (
    <div className="space-y-5">
      <ViewHeader eyebrow="Network control" title="Live operations" description="Monitor vehicles, accessibility obstacles, crowd levels, accidents and breakdowns." />
      <TelemetryStrip appearance="sampai" conn={dashboard.conn} pingMs={dashboard.pingMs} vehicles={dashboard.vehicles} obstacles={dashboard.obstacles} />
      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card appearance="sampai" title="Live bus locations"><div className="mb-3 flex justify-between text-xs text-[#66736d]"><span>Cyberjaya network · five stops</span><span className="flex items-center gap-1 font-semibold text-[#24733b]"><Activity className="h-3.5 w-3.5" /> Position stream</span></div><div className="h-[390px]"><MapHud appearance="sampai" obstacles={dashboard.obstacles} vehicles={dashboard.vehicles} stops={dashboard.stops} activeFilters={new Set()} selectedObstacleId={obstacle} onSelectObstacle={(item) => setObstacle(item.id)} /></div><p className="mt-2 min-h-5 text-xs text-[#66736d]" aria-live="polite">{obstacle ? dashboard.obstacles.find((item) => item.id === obstacle)?.description : "Select an obstacle marker for details."}</p></Card>
        <Card appearance="sampai" title="Fleet and crowd levels"><div className="max-h-[470px] space-y-3 overflow-y-auto pr-1">{dashboard.vehicles.map((item) => <TransitTrackerCard appearance="sampai" key={item.vehicle_id} vehicle={item} />)}</div></Card>
      </section>
      <Card appearance="sampai" title="Accident and breakdown alerts"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#66736d]">Urgent incidents are shown first.</p><div className="flex flex-wrap gap-2"><SelectField label="Severity" value={severity} onChange={setSeverity}><option value="all">All</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></SelectField><SelectField label="Route" value={route} onChange={setRoute}><option value="all">All</option>{routes.map((item) => <option key={item}>{item}</option>)}</SelectField></div></div><IncidentList dashboard={dashboard} severity={severity} route={route} /></Card>
    </div>
  );
}

function AccessibilityView({ dashboard, status, setStatus, route, setRoute }: { dashboard: Dashboard; status: string; setStatus: (value: string) => void; route: string; setRoute: (value: string) => void }) {
  const routes = [...new Set(dashboard.vehicles.map((item) => item.route_id))].sort();
  const requests = dashboard.requests.filter((item) => status === "all" || item.status === status).filter((item) => route === "all" || item.bus_id === null || dashboard.vehicles.find((bus) => bus.vehicle_id === item.bus_id)?.route_id === route).sort((a, b) => a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0);
  const unavailable = dashboard.infrastructure.filter((item) => item.status !== "operational").length;
  return (
    <div className="space-y-5">
      <ViewHeader eyebrow="Inclusive service" title="Accessibility" description="Coordinate passenger assistance and track ramps, lifts and stations." />
      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card appearance="sampai" title="Passenger accessibility requests"><div className="mb-4 flex flex-wrap justify-between gap-3"><p className="text-xs text-[#66736d]">Pending requests are shown first.</p><div className="flex flex-wrap gap-2"><SelectField label="Status" value={status} onChange={setStatus}><option value="all">All</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></SelectField><SelectField label="Route" value={route} onChange={setRoute}><option value="all">All</option>{routes.map((item) => <option key={item}>{item}</option>)}</SelectField></div></div><div className="space-y-3" aria-live="polite">{requests.length ? requests.map((item) => <article key={item.id} className={`${itemSurface} p-4`}><div className="flex justify-between gap-3"><div><p className="text-sm font-bold text-[#17211d]">{item.passenger_need}</p><p className="mt-1 text-xs text-[#66736d]">{item.stop_id} · {item.bus_id ?? "Bus not assigned"}</p></div><span className={`h-fit rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase ring-1 ring-inset ${requestStyle[item.status]}`}>{item.status}</span></div><p className="mt-3 flex items-center gap-1 text-xs text-[#66736d]"><Clock3 className="h-3.5 w-3.5" /> Received {timeLabel(item.timestamp)}</p></article>) : <p className="rounded-[17px] border border-dashed border-[#b7c9c1] p-6 text-center text-sm text-[#66736d]">No requests match these filters.</p>}</div></Card>
        <Card appearance="sampai" title="Accessibility infrastructure"><div className="mb-3 flex justify-between text-xs text-[#66736d]"><span>Ramps, lifts and stations</span><span>{unavailable} need attention</span></div><div className="space-y-3">{dashboard.infrastructure.map((item) => <article key={item.asset_id} className={`${itemSurface} p-4`}><div className="flex gap-3"><span className="h-fit rounded-[13px] bg-[#e4f4ee] p-2 text-[#0b6b52]" aria-hidden>{item.type === "ramp" ? <DoorOpen className="h-4 w-4" /> : item.type === "lift" ? <Wrench className="h-4 w-4" /> : <Construction className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-bold text-[#17211d]">{item.name}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase ring-1 ring-inset ${infrastructureStyle[item.status]}`}>{item.status}</span></div><p className="mt-1 text-xs text-[#66736d]">{item.detail}</p><p className="mt-2 flex items-center gap-1 text-xs text-[#66736d]"><MapPin className="h-3.5 w-3.5" /> {item.location} · {timeLabel(item.updated_at)}</p></div></div></article>)}</div></Card>
      </section>
    </div>
  );
}

function Demand({ dashboard }: { dashboard: Dashboard }) {
  const max = Math.max(1, ...dashboard.forecasts.map((item) => item.expected_passengers));
  return (
    <div className="space-y-5">
      <ViewHeader eyebrow="Planning intelligence" title="Demand intelligence" description="Compare stop-level demand across the next 30 and 60 minutes." />
      <Card appearance="sampai" title="Peak-hour demand heatmap"><p className="mb-4 text-xs text-[#66736d]">Darker cells indicate greater demand.</p><div className="overflow-x-auto"><table className="w-full min-w-[540px] border-separate border-spacing-2 text-left text-xs"><caption className="sr-only">Passenger demand forecast</caption><thead><tr className="text-[#66736d]"><th className="px-2">Stop</th><th>Now</th><th>+30 min</th><th>+60 min</th></tr></thead><tbody>{dashboard.stops.map((stop) => { const f30 = dashboard.forecasts.find((item) => item.stop_id === stop.stop_id && item.horizon_minutes === 30); const f60 = dashboard.forecasts.find((item) => item.stop_id === stop.stop_id && item.horizon_minutes === 60); const values = [Math.round((f30?.expected_passengers ?? 0) * .7), f30?.expected_passengers ?? 0, f60?.expected_passengers ?? 0]; return <tr key={stop.stop_id}><th className="px-2 py-2 text-[#17211d]">{stop.name}</th>{values.map((value, index) => <td key={index} className="rounded-xl border border-[#a9cbbb] px-4 py-3 text-center font-bold text-[#17211d]" style={{ backgroundColor: `rgba(11, 107, 82, ${.08 + value / max * .34})` }}>{value}</td>)}</tr>; })}</tbody></table></div><div className="mt-4 grid gap-3 md:grid-cols-2">{[30, 60].map((horizon) => { const items = dashboard.forecasts.filter((item) => item.horizon_minutes === horizon); const total = items.reduce((sum, item) => sum + item.expected_passengers, 0); const confidence = items.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, items.length); return <div key={horizon} className="rounded-[17px] border border-[#d9e4df] bg-[#f3f7f5] p-4"><p className="text-xs font-extrabold uppercase text-[#66736d]">{horizon}-minute forecast</p><p className="mt-1 text-2xl font-black text-[#17211d]">{total} <span className="text-sm font-normal text-[#66736d]">passengers</span></p><p className="text-xs text-[#66736d]">{Math.round(confidence * 100)}% confidence · weekday pattern + live capacity</p></div>; })}</div></Card>
      <div className="grid gap-3 lg:grid-cols-2">{dashboard.forecasts.filter((item) => item.horizon_minutes === 30).map((item) => <article key={item.stop_id} className={`${surface} p-4`}><div className="flex justify-between gap-3"><div><p className="text-sm font-bold text-[#17211d]">{dashboard.stops.find((stop) => stop.stop_id === item.stop_id)?.name}</p><p className="mt-1 text-xs text-[#66736d]">{item.explanation}</p></div><span className="h-fit rounded-full bg-[#eef4f1] px-2.5 py-1 text-xs font-bold text-[#52615a]">{Math.round(item.confidence * 100)}%</span></div><p className="mt-3 text-xs font-extrabold uppercase text-[#0b6b52]">{titleCase(item.crowd_level)} demand</p></article>)}</div>
    </div>
  );
}

function Recommendations({ dashboard, approve }: { dashboard: Dashboard; approve: (item: Recommendation, button: HTMLButtonElement) => void }) {
  return (
    <div className="space-y-5">
      <ViewHeader eyebrow="Decision support" title="AI recommendations" description="Review evidence and expected impact before authorising an action." />
      <p className="rounded-[17px] border border-[#a9cbbb] bg-[#e4f4ee] px-4 py-3 text-xs font-semibold text-[#075340]">No operational action runs automatically. Every recommendation requires a human decision.</p>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{dashboard.recommendations.map((item) => { const state = dashboard.approvalStates[item.id] ?? "idle"; return <article key={item.id} className={`${surface} flex flex-col p-5`}><div className="flex justify-between"><span className="rounded-[13px] bg-[#e4f4ee] p-2.5 text-[#0b6b52]">{item.action === "reroute" ? <Route className="h-5 w-5" /> : item.action === "send_emergency_assistance" ? <ShieldAlert className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}</span><span className="h-fit rounded-full bg-[#eef4f1] px-2.5 py-1 text-xs font-bold text-[#52615a]">{Math.round(item.confidence * 100)}% confidence</span></div><p className="mt-4 text-xs font-extrabold uppercase text-[#0b6b52]">{titleCase(item.action)}</p><h3 className="mt-1 font-bold text-[#17211d]">{item.affected_bus_id ?? item.affected_route_id ?? "Network action"}</h3><p className="mt-2 text-sm leading-6 text-[#46534d]">{item.reason}</p><div className="mt-4 rounded-[14px] border border-[#d9e4df] bg-[#f3f7f5] p-3"><p className="text-[10px] font-extrabold uppercase text-[#66736d]">Expected impact</p><p className="mt-1 text-xs text-[#46534d]">{item.expected_impact}</p></div><div className="mt-auto pt-5">{item.approval_status === "approved" ? <p className="flex justify-center gap-2 rounded-[14px] bg-[#e7f7ec] px-4 py-3 text-sm font-bold text-[#24733b]"><CheckCircle2 className="h-4 w-4" /> Approved by operator</p> : <button type="button" disabled={state === "saving" || state === "waiting"} onClick={(event) => approve(item, event.currentTarget)} className={`w-full rounded-[14px] bg-[#0b6b52] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#075340] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}>{state === "saving" ? "Sending approval…" : state === "waiting" ? "Waiting for live confirmation…" : state === "failed" ? "Retry approval" : "Approve Recommendation"}</button>}{state === "failed" && <p className="mt-2 text-xs font-semibold text-[#b92d32]" role="alert">Approval was not confirmed. The recommendation remains pending.</p>}</div></article>; })}</div>
    </div>
  );
}

function DashboardContent() {
  const dashboard = useAdminDashboard();
  const params = useSearchParams();
  const requested = params.get("view") as AdminView | null;
  const active: AdminView = requested && validViews.has(requested) ? requested : "overview";
  const [severity, setSeverity] = useState("all");
  const [requestStatus, setRequestStatus] = useState("all");
  const [operationsRoute, setOperationsRoute] = useState("all");
  const [accessibilityRoute, setAccessibilityRoute] = useState("all");
  const [obstacle, setObstacle] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Recommendation | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const approvalTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!confirming) return;
    cancelButton.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConfirming(null);
        setTimeout(() => approvalTrigger.current?.focus());
      }
    };
    addEventListener("keydown", escape);
    return () => removeEventListener("keydown", escape);
  }, [confirming]);

  const closeConfirmation = () => {
    setConfirming(null);
    setTimeout(() => approvalTrigger.current?.focus());
  };
  const approve = (item: Recommendation, button: HTMLButtonElement) => {
    if (item.action === "send_emergency_assistance") {
      approvalTrigger.current = button;
      setConfirming(item);
    } else {
      void dashboard.approveRecommendation(item.id);
    }
  };
  const modeClass = dashboard.mode === "live" ? "bg-[#e7f7ec] text-[#24733b] ring-[#a9d9b7]" : dashboard.mode === "mixed" ? "bg-[#fff4d9] text-[#875f04] ring-[#ead5a4]" : "bg-[#e4f4ee] text-[#075340] ring-[#a9cbbb]";

  let content: ReactNode = <Overview dashboard={dashboard} />;
  if (active === "operations") content = <Operations dashboard={dashboard} severity={severity} setSeverity={setSeverity} route={operationsRoute} setRoute={setOperationsRoute} obstacle={obstacle} setObstacle={setObstacle} />;
  if (active === "accessibility") content = <AccessibilityView dashboard={dashboard} status={requestStatus} setStatus={setRequestStatus} route={accessibilityRoute} setRoute={setAccessibilityRoute} />;
  if (active === "demand") content = <Demand dashboard={dashboard} />;
  if (active === "recommendations") content = <Recommendations dashboard={dashboard} approve={approve} />;

  return (
    <div className="sampai-admin min-h-screen bg-[linear-gradient(180deg,#f4f8f6_0%,#edf4f1_100%)] font-[Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] text-[#17211d] lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-[#d9e4df] bg-white/95 p-4 shadow-[8px_0_30px_rgba(25,60,47,.05)] backdrop-blur lg:flex">
        <div className="mb-7 px-2 pt-2"><p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#0b6b52]">Operations control</p><h1 className="mt-1 text-xl font-black tracking-[-.025em]">SampAI Admin</h1></div>
        <nav aria-label="Admin dashboard sections" className="space-y-1">{views.map((item) => <Link key={item.id} href={`/admin?view=${item.id}`} scroll={false} aria-current={active === item.id ? "page" : undefined} className={`flex items-center gap-3 rounded-[14px] px-3 py-3 ${focusRing} ${active === item.id ? "bg-[#e4f4ee] text-[#075340] ring-1 ring-[#a9cbbb]" : "text-[#46534d] hover:bg-[#eef4f1]"}`}><span className={`rounded-xl p-2 ${active === item.id ? "bg-white text-[#0b6b52]" : "bg-[#eef4f1] text-[#52615a]"}`}>{item.icon}</span><span><span className="block text-sm font-extrabold">{item.label}</span><span className="block text-[11px] text-[#66736d]">{item.description}</span></span></Link>)}</nav>
        <div className="mt-auto space-y-3 pt-6"><span className={`block rounded-[14px] px-3 py-2 text-center text-xs font-bold ring-1 ring-inset ${modeClass}`} role="status">{dashboard.mode === "live" ? "Live services" : dashboard.mode === "mixed" ? "Live + fallback" : "Simulated data"}</span><Link href="/" className={`flex justify-center gap-2 rounded-[14px] border border-[#cddad4] px-3 py-2.5 text-sm font-extrabold text-[#075340] hover:bg-[#eef4f1] ${focusRing}`}><ArrowLeft className="h-4 w-4" /> Citizen App</Link></div>
      </aside>

      <div className="min-w-0 pb-24 lg:pb-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#d9e4df] bg-white/95 px-4 py-3 shadow-[0_4px_18px_rgba(25,60,47,.05)] backdrop-blur lg:hidden"><div><p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#0b6b52]">SampAI Admin</p><p className="text-sm font-black">{views.find((item) => item.id === active)?.label}</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${modeClass}`}>{dashboard.mode}</span><Link href="/" aria-label="Open Citizen App" className={`rounded-full bg-[#0b6b52] p-2 text-white ${focusRing}`}><ArrowLeft className="h-4 w-4" /></Link></div></header>
        <main className="mx-auto w-full max-w-[1500px] px-4 py-5 md:px-6 md:py-7">{content}</main>
      </div>

      <nav aria-label="Admin dashboard sections" className="fixed inset-x-0 bottom-0 z-40 grid h-[76px] grid-cols-5 border-t border-[#dce6e1] bg-white/96 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-6px_30px_rgba(25,60,47,.08)] backdrop-blur lg:hidden">{views.map((item) => <Link key={item.id} href={`/admin?view=${item.id}`} scroll={false} aria-current={active === item.id ? "page" : undefined} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-[13px] px-1 text-[10px] font-bold ${focusRing} ${active === item.id ? "bg-[#e4f4ee] text-[#075340]" : "text-[#6f7b75] hover:bg-[#eef4f1]"}`}><span className="[&>svg]:h-5 [&>svg]:w-5">{item.icon}</span><span className="truncate">{item.mobileLabel}</span></Link>)}</nav>

      {confirming && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0f1e18]/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeConfirmation(); }}><section role="dialog" aria-modal="true" aria-labelledby="emergency-title" className={`${surface} w-full max-w-lg p-6`}><div className="flex justify-between"><span className="rounded-[13px] bg-[#fff0f0] p-2 text-[#b92d32]"><ShieldAlert className="h-6 w-6" /></span><button onClick={closeConfirmation} aria-label="Close emergency approval" className={`rounded-full bg-[#eef4f1] p-2 text-[#17211d] ${focusRing}`}><X className="h-4 w-4" /></button></div><h2 id="emergency-title" className="mt-5 text-xl font-black">Confirm emergency assistance</h2><p className="mt-2 text-sm text-[#66736d]">Confirm that a human operator has reviewed the evidence.</p><div className="mt-4 rounded-[14px] border border-[#d9e4df] bg-[#f3f7f5] p-4 text-sm text-[#46534d]"><strong className="text-[#17211d]">Reason:</strong> {confirming.reason}</div><div className="mt-6 flex justify-end gap-3"><button ref={cancelButton} onClick={closeConfirmation} className={`rounded-[14px] border border-[#cddad4] px-4 py-2.5 font-bold text-[#52615a] hover:bg-[#eef4f1] ${focusRing}`}>Cancel</button><button onClick={() => { const id = confirming.id; closeConfirmation(); void dashboard.approveRecommendation(id); }} className={`rounded-[14px] bg-[#b92d32] px-4 py-2.5 font-extrabold text-white hover:bg-[#9c2d32] ${focusRing}`}>Confirm and send</button></div></section></div>}
    </div>
  );
}

export default function AdminDashboard() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#eef4f1] text-sm font-semibold text-[#66736d]">Loading SampAI Admin…</div>}><DashboardContent /></Suspense>;
}
