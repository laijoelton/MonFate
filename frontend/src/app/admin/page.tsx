"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Accessibility, Activity, AlertTriangle, ArrowLeft, BarChart3, Bus, CheckCircle2,
  ChevronRight, Clock3, Construction, DoorOpen, LayoutDashboard, MapPin, Menu,
  Route, ShieldAlert, Sparkles, TriangleAlert, UserRoundCheck, Wrench, X,
} from "lucide-react";
import { MapHud } from "@/components/MapHud";
import { TelemetryStrip } from "@/components/TelemetryStrip";
import { TransitTrackerCard } from "@/components/TransitTrackerCard";
import { Card } from "@/components/ui/Card";
import { useAdminDashboard } from "@/lib/useAdminDashboard";
import type { AssistanceRequestStatus, InfrastructureState, OperationalSeverity, Recommendation } from "@/types/admin";

type Dashboard = ReturnType<typeof useAdminDashboard>;
type AdminView = "overview" | "operations" | "accessibility" | "demand" | "recommendations";

const views: Array<{ id: AdminView; label: string; description: string; icon: ReactNode }> = [
  { id: "overview", label: "Overview", description: "Network summary", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "operations", label: "Live operations", description: "Fleet and incidents", icon: <Bus className="h-4 w-4" /> },
  { id: "accessibility", label: "Accessibility", description: "Requests and assets", icon: <Accessibility className="h-4 w-4" /> },
  { id: "demand", label: "Demand intelligence", description: "30 and 60 min forecast", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "recommendations", label: "AI recommendations", description: "Human approval queue", icon: <Sparkles className="h-4 w-4" /> },
];
const validViews = new Set<AdminView>(views.map((view) => view.id));
const severityRank: Record<OperationalSeverity, number> = { critical: 3, warning: 2, info: 1 };
const severityStyle: Record<OperationalSeverity, string> = {
  critical: "border-down/40 bg-down/10 text-down", warning: "border-warn/40 bg-warn/10 text-warn", info: "border-accent/40 bg-accent/10 text-accent",
};
const infrastructureStyle: Record<InfrastructureState, string> = {
  operational: "bg-ok/15 text-ok ring-ok/30", faulty: "bg-warn/15 text-warn ring-warn/30", inaccessible: "bg-down/15 text-down ring-down/30",
};
const requestStyle: Record<AssistanceRequestStatus, string> = {
  pending: "bg-warn/15 text-warn ring-warn/30", confirmed: "bg-accent/15 text-accent ring-accent/30", completed: "bg-ok/15 text-ok ring-ok/30", cancelled: "bg-slate-700/50 text-slate-400 ring-slate-600/50",
};

const timeLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown time" : `${date.toISOString().slice(11, 16)} UTC`;
};
const titleCase = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="flex items-center gap-2 text-xs text-slate-400"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{children}</select></label>;
}

function MetricCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return <article className="glass rounded-xl p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[.14em] text-slate-500">{label}</p><p className="tabular mt-2 text-3xl font-bold text-slate-50">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div><span className="rounded-xl bg-accent/10 p-2.5 text-accent" aria-hidden>{icon}</span></div></article>;
}

function ViewHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">{eyebrow}</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-50">{title}</h2><p className="mt-1 max-w-3xl text-sm text-slate-400">{description}</p></div>;
}

function Preview({ view, label, title, detail, urgent = false }: { view: AdminView; label: string; title: string; detail: string; urgent?: boolean }) {
  return <Link href={`/admin?view=${view}`} scroll={false} className="group glass flex min-h-36 flex-col rounded-xl p-4 hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"><div className="flex justify-between gap-3"><p className={`text-xs font-semibold uppercase tracking-[.14em] ${urgent ? "text-down" : "text-accent"}`}>{label}</p><ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-accent" aria-hidden /></div><p className="mt-3 text-sm font-semibold text-slate-100">{title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p></Link>;
}

function Overview({ dashboard }: { dashboard: Dashboard }) {
  const requests = dashboard.requests.filter((item) => item.status === "pending");
  const alerts = dashboard.alerts.filter((item) => item.status === "active").sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  const assets = dashboard.infrastructure.filter((item) => item.status !== "operational");
  const recommendations = dashboard.recommendations.filter((item) => item.approval_status === "pending");
  const request = [...requests].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))[0];
  const demand = (horizon: number) => dashboard.forecasts.filter((item) => item.horizon_minutes === horizon).reduce((sum, item) => sum + item.expected_passengers, 0);
  return <div className="space-y-5">
    <ViewHeader eyebrow="Command centre" title="Operations overview" description="The highest-priority information from every operator workflow." />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
      <MetricCard label="Active fleet" value={`${dashboard.vehicles.length}`} detail="Buses tracked" icon={<Bus className="h-5 w-5" />} />
      <MetricCard label="Open requests" value={`${requests.length}`} detail="Passenger accessibility" icon={<UserRoundCheck className="h-5 w-5" />} />
      <MetricCard label="Active incidents" value={`${alerts.length}`} detail="Accidents and breakdowns" icon={<TriangleAlert className="h-5 w-5" />} />
      <MetricCard label="Awaiting approval" value={`${recommendations.length}`} detail="Human decision required" icon={<Sparkles className="h-5 w-5" />} />
      <MetricCard label="Assets unavailable" value={`${assets.length}`} detail="Ramps, lifts and stations" icon={<Wrench className="h-5 w-5" />} />
    </div>
    <TelemetryStrip conn={dashboard.conn} pingMs={dashboard.pingMs} vehicles={dashboard.vehicles} obstacles={dashboard.obstacles} />
    <section><h3 className="mb-3 text-lg font-bold text-slate-50">What needs attention now</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Preview view="operations" label="Incident" urgent={alerts[0]?.severity === "critical"} title={alerts[0] ? `${titleCase(alerts[0].type)} · ${alerts[0].route_id}` : "No active incidents"} detail={alerts[0]?.message ?? "No unresolved operational alerts."} />
      <Preview view="accessibility" label="Accessibility" title={request?.passenger_need ?? "No pending assistance"} detail={request ? `${request.stop_id} · ${request.bus_id ?? "Bus not assigned"}` : `${assets.length} assets need attention.`} />
      <Preview view="demand" label="Demand" title={`${demand(30)} passengers in 30 minutes`} detail={`${demand(60)} passengers expected in 60 minutes.`} />
      <Preview view="recommendations" label="Decision support" urgent={recommendations[0]?.action === "send_emergency_assistance"} title={recommendations[0] ? titleCase(recommendations[0].action) : "Approval queue clear"} detail={recommendations[0]?.reason ?? "No recommendations are waiting."} />
    </div></section>
  </div>;
}

function IncidentList({ dashboard, severity, route }: { dashboard: Dashboard; severity: string; route: string }) {
  const items = dashboard.alerts.filter((item) => severity === "all" || item.severity === severity).filter((item) => route === "all" || item.route_id === route).sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  return <div className="grid gap-3 xl:grid-cols-2" aria-live="polite">{items.length ? items.map((alert) => <article key={alert.id} className={`rounded-xl border p-4 ${severityStyle[alert.severity]}`}><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-100">{titleCase(alert.type)}</strong><span className="rounded-full border border-current/30 px-2 py-.5 text-[10px] font-semibold uppercase">{alert.severity}</span><span className="text-xs text-slate-400">{alert.status}</span></div><p className="mt-1 text-sm text-slate-300">{alert.message}</p><p className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400"><span>{alert.bus_id} · {alert.route_id}</span><span>{alert.location}</span><span>{timeLabel(alert.timestamp)}</span></p></div></div></article>) : <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No incidents match these filters.</p>}</div>;
}

function Operations({ dashboard, severity, setSeverity, route, setRoute, obstacle, setObstacle }: { dashboard: Dashboard; severity: string; setSeverity: (v: string) => void; route: string; setRoute: (v: string) => void; obstacle: string | null; setObstacle: (v: string | null) => void }) {
  const routes = [...new Set(dashboard.vehicles.map((item) => item.route_id))].sort();
  return <div className="space-y-5"><ViewHeader eyebrow="Network control" title="Live operations" description="Monitor vehicles, accessibility obstacles, crowd levels, accidents and breakdowns." /><TelemetryStrip conn={dashboard.conn} pingMs={dashboard.pingMs} vehicles={dashboard.vehicles} obstacles={dashboard.obstacles} />
    <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]"><Card title="Live bus locations"><div className="mb-3 flex justify-between text-xs text-slate-400"><span>Cyberjaya network · five stops</span><span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5 text-ok" /> Position stream</span></div><div className="h-[390px]"><MapHud obstacles={dashboard.obstacles} vehicles={dashboard.vehicles} stops={dashboard.stops} activeFilters={new Set()} selectedObstacleId={obstacle} onSelectObstacle={(item) => setObstacle(item.id)} /></div><p className="mt-2 min-h-5 text-xs text-slate-400" aria-live="polite">{obstacle ? dashboard.obstacles.find((item) => item.id === obstacle)?.description : "Select an obstacle marker for details."}</p></Card><Card title="Fleet and crowd levels"><div className="max-h-[470px] space-y-3 overflow-y-auto">{dashboard.vehicles.map((item) => <TransitTrackerCard key={item.vehicle_id} vehicle={item} />)}</div></Card></section>
    <Card title="Accident and breakdown alerts"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-400">Urgent incidents are shown first.</p><div className="flex flex-wrap gap-2"><SelectField label="Severity" value={severity} onChange={setSeverity}><option value="all">All</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></SelectField><SelectField label="Route" value={route} onChange={setRoute}><option value="all">All</option>{routes.map((item) => <option key={item}>{item}</option>)}</SelectField></div></div><IncidentList dashboard={dashboard} severity={severity} route={route} /></Card>
  </div>;
}

function AccessibilityView({ dashboard, status, setStatus, route, setRoute }: { dashboard: Dashboard; status: string; setStatus: (v: string) => void; route: string; setRoute: (v: string) => void }) {
  const routes = [...new Set(dashboard.vehicles.map((item) => item.route_id))].sort();
  const requests = dashboard.requests.filter((item) => status === "all" || item.status === status).filter((item) => route === "all" || item.bus_id === null || dashboard.vehicles.find((bus) => bus.vehicle_id === item.bus_id)?.route_id === route).sort((a, b) => a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0);
  const unavailable = dashboard.infrastructure.filter((item) => item.status !== "operational").length;
  return <div className="space-y-5"><ViewHeader eyebrow="Inclusive service" title="Accessibility" description="Coordinate passenger assistance and track ramps, lifts and stations." /><section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
    <Card title="Passenger accessibility requests"><div className="mb-4 flex flex-wrap justify-between gap-2"><p className="text-xs text-slate-400">Pending requests are shown first.</p><div className="flex flex-wrap gap-2"><SelectField label="Status" value={status} onChange={setStatus}><option value="all">All</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></SelectField><SelectField label="Route" value={route} onChange={setRoute}><option value="all">All</option>{routes.map((item) => <option key={item}>{item}</option>)}</SelectField></div></div><div className="space-y-3" aria-live="polite">{requests.length ? requests.map((item) => <article key={item.id} className="rounded-xl border border-slate-700/70 bg-slate-900/45 p-4"><div className="flex justify-between gap-3"><div><p className="text-sm font-semibold text-slate-100">{item.passenger_need}</p><p className="mt-1 text-xs text-slate-400">{item.stop_id} · {item.bus_id ?? "Bus not assigned"}</p></div><span className={`h-fit rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ring-1 ring-inset ${requestStyle[item.status]}`}>{item.status}</span></div><p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" /> Received {timeLabel(item.timestamp)}</p></article>) : <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No requests match these filters.</p>}</div></Card>
    <Card title="Accessibility infrastructure"><div className="mb-3 flex justify-between text-xs text-slate-400"><span>Ramps, lifts and stations</span><span>{unavailable} need attention</span></div><div className="space-y-3">{dashboard.infrastructure.map((item) => <article key={item.asset_id} className="rounded-xl border border-slate-700/70 bg-slate-900/45 p-4"><div className="flex gap-3"><span className="h-fit rounded-lg bg-slate-800 p-2" aria-hidden>{item.type === "ramp" ? <DoorOpen className="h-4 w-4" /> : item.type === "lift" ? <Wrench className="h-4 w-4" /> : <Construction className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold text-slate-100">{item.name}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ring-1 ring-inset ${infrastructureStyle[item.status]}`}>{item.status}</span></div><p className="mt-1 text-xs text-slate-400">{item.detail}</p><p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" /> {item.location} · {timeLabel(item.updated_at)}</p></div></div></article>)}</div></Card>
  </section></div>;
}

function Demand({ dashboard }: { dashboard: Dashboard }) {
  const max = Math.max(1, ...dashboard.forecasts.map((item) => item.expected_passengers));
  return <div className="space-y-5"><ViewHeader eyebrow="Planning intelligence" title="Demand intelligence" description="Compare stop-level demand across the next 30 and 60 minutes." /><Card title="Peak-hour demand heatmap"><p className="mb-4 text-xs text-slate-400">Darker cells indicate greater demand.</p><div className="overflow-x-auto"><table className="w-full min-w-[540px] border-separate border-spacing-2 text-left text-xs"><caption className="sr-only">Passenger demand forecast</caption><thead><tr className="text-slate-500"><th className="px-2">Stop</th><th>Now</th><th>+30 min</th><th>+60 min</th></tr></thead><tbody>{dashboard.stops.map((stop) => { const f30 = dashboard.forecasts.find((item) => item.stop_id === stop.stop_id && item.horizon_minutes === 30); const f60 = dashboard.forecasts.find((item) => item.stop_id === stop.stop_id && item.horizon_minutes === 60); const values = [Math.round((f30?.expected_passengers ?? 0) * .7), f30?.expected_passengers ?? 0, f60?.expected_passengers ?? 0]; return <tr key={stop.stop_id}><th className="px-2 py-2 text-slate-200">{stop.name}</th>{values.map((value, index) => <td key={index} className="rounded-lg border border-accent/20 px-4 py-3 text-center font-semibold" style={{ backgroundColor: `oklch(0.55 0.13 230 / ${.14 + value / max * .7})` }}>{value}</td>)}</tr>; })}</tbody></table></div><div className="mt-4 grid gap-3 md:grid-cols-2">{[30, 60].map((horizon) => { const items = dashboard.forecasts.filter((item) => item.horizon_minutes === horizon); const total = items.reduce((sum, item) => sum + item.expected_passengers, 0); const confidence = items.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, items.length); return <div key={horizon} className="rounded-xl border border-slate-700 bg-slate-900/45 p-4"><p className="text-xs uppercase text-slate-500">{horizon}-minute forecast</p><p className="mt-1 text-2xl font-bold">{total} <span className="text-sm font-normal text-slate-400">passengers</span></p><p className="text-xs text-slate-400">{Math.round(confidence * 100)}% confidence · weekday pattern + live capacity</p></div>; })}</div></Card>
    <div className="grid gap-3 lg:grid-cols-2">{dashboard.forecasts.filter((item) => item.horizon_minutes === 30).map((item) => <article key={item.stop_id} className="glass rounded-xl p-4"><div className="flex justify-between gap-3"><div><p className="text-sm font-semibold">{dashboard.stops.find((stop) => stop.stop_id === item.stop_id)?.name}</p><p className="mt-1 text-xs text-slate-400">{item.explanation}</p></div><span className="h-fit rounded-full bg-slate-800 px-2.5 py-1 text-xs">{Math.round(item.confidence * 100)}%</span></div><p className="mt-3 text-xs font-semibold uppercase text-accent">{titleCase(item.crowd_level)} demand</p></article>)}</div>
  </div>;
}

function Recommendations({ dashboard, approve }: { dashboard: Dashboard; approve: (item: Recommendation, button: HTMLButtonElement) => void }) {
  return <div className="space-y-5"><ViewHeader eyebrow="Decision support" title="AI recommendations" description="Review evidence and expected impact before authorising an action." /><p className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-xs text-slate-300">No operational action runs automatically. Every recommendation requires a human decision.</p><div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{dashboard.recommendations.map((item) => { const state = dashboard.approvalStates[item.id] ?? "idle"; return <article key={item.id} className="glass flex flex-col rounded-2xl p-5"><div className="flex justify-between"><span className="rounded-xl bg-accent/10 p-2.5 text-accent">{item.action === "reroute" ? <Route className="h-5 w-5" /> : item.action === "send_emergency_assistance" ? <ShieldAlert className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}</span><span className="h-fit rounded-full bg-slate-800 px-2.5 py-1 text-xs">{Math.round(item.confidence * 100)}% confidence</span></div><p className="mt-4 text-xs font-semibold uppercase text-accent">{titleCase(item.action)}</p><h3 className="mt-1 font-semibold">{item.affected_bus_id ?? item.affected_route_id ?? "Network action"}</h3><p className="mt-2 text-sm text-slate-300">{item.reason}</p><div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/50 p-3"><p className="text-[10px] uppercase text-slate-500">Expected impact</p><p className="mt-1 text-xs text-slate-300">{item.expected_impact}</p></div><div className="mt-auto pt-5">{item.approval_status === "approved" ? <p className="flex justify-center gap-2 rounded-xl bg-ok/15 px-4 py-3 text-sm font-semibold text-ok"><CheckCircle2 className="h-4 w-4" /> Approved by operator</p> : <button type="button" disabled={state === "saving" || state === "waiting"} onClick={(event) => approve(item, event.currentTarget)} className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60">{state === "saving" ? "Sending approval…" : state === "waiting" ? "Waiting for live confirmation…" : state === "failed" ? "Retry approval" : "Approve Recommendation"}</button>}{state === "failed" && <p className="mt-2 text-xs text-down" role="alert">Approval was not confirmed. The recommendation remains pending.</p>}</div></article>; })}</div></div>;
}

function DashboardContent() {
  const dashboard = useAdminDashboard();
  const params = useSearchParams();
  const requested = params.get("view") as AdminView | null;
  const active: AdminView = requested && validViews.has(requested) ? requested : "overview";
  const [menuOpen, setMenuOpen] = useState(false);
  const [severity, setSeverity] = useState("all"); const [requestStatus, setRequestStatus] = useState("all");
  const [operationsRoute, setOperationsRoute] = useState("all"); const [accessibilityRoute, setAccessibilityRoute] = useState("all");
  const [obstacle, setObstacle] = useState<string | null>(null); const [confirming, setConfirming] = useState<Recommendation | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null); const mobileNav = useRef<HTMLElement>(null); const cancelButton = useRef<HTMLButtonElement>(null); const approvalTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { if (!menuOpen) return; mobileNav.current?.querySelector<HTMLAnchorElement>("a")?.focus(); const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuOpen(false); setTimeout(() => menuButton.current?.focus()); } }; addEventListener("keydown", escape); return () => removeEventListener("keydown", escape); }, [menuOpen]);
  useEffect(() => { if (!confirming) return; cancelButton.current?.focus(); const escape = (e: KeyboardEvent) => { if (e.key === "Escape") closeConfirmation(); }; addEventListener("keydown", escape); return () => removeEventListener("keydown", escape); });
  const closeMenu = () => { setMenuOpen(false); setTimeout(() => menuButton.current?.focus()); };
  const closeConfirmation = () => { setConfirming(null); setTimeout(() => approvalTrigger.current?.focus()); };
  const approve = (item: Recommendation, button: HTMLButtonElement) => { if (item.action === "send_emergency_assistance") { approvalTrigger.current = button; setConfirming(item); } else void dashboard.approveRecommendation(item.id); };
  const nav = (mobile = false) => <nav ref={mobile ? mobileNav : undefined} aria-label="Admin dashboard sections" className="space-y-1">{views.map((item) => <Link key={item.id} href={`/admin?view=${item.id}`} scroll={false} onClick={mobile ? closeMenu : undefined} aria-current={active === item.id ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${active === item.id ? "bg-accent/15 text-accent ring-1 ring-accent/25" : "text-slate-300 hover:bg-slate-800/70"}`}><span className="rounded-lg bg-slate-800/80 p-2">{item.icon}</span><span><span className="block text-sm font-semibold">{item.label}</span><span className="block text-[11px] text-slate-500">{item.description}</span></span></Link>)}</nav>;
  const modeClass = dashboard.mode === "live" ? "bg-ok/15 text-ok ring-ok/30" : dashboard.mode === "mixed" ? "bg-warn/15 text-warn ring-warn/30" : "bg-accent/15 text-accent ring-accent/30";

  let content: ReactNode = <Overview dashboard={dashboard} />;
  if (active === "operations") content = <Operations dashboard={dashboard} severity={severity} setSeverity={setSeverity} route={operationsRoute} setRoute={setOperationsRoute} obstacle={obstacle} setObstacle={setObstacle} />;
  if (active === "accessibility") content = <AccessibilityView dashboard={dashboard} status={requestStatus} setStatus={setRequestStatus} route={accessibilityRoute} setRoute={setAccessibilityRoute} />;
  if (active === "demand") content = <Demand dashboard={dashboard} />;
  if (active === "recommendations") content = <Recommendations dashboard={dashboard} approve={approve} />;

  return <div className="min-h-full lg:grid lg:grid-cols-[270px_minmax(0,1fr)]">
    <aside className="sticky top-0 hidden h-screen flex-col border-r border-slate-800/70 bg-slate-950/65 p-4 backdrop-blur lg:flex"><div className="mb-7 px-2 pt-2"><p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">Operations control</p><h1 className="mt-1 text-xl font-bold">MonFate Admin</h1></div>{nav()}<div className="mt-auto space-y-3 pt-6"><span className={`block rounded-xl px-3 py-2 text-center text-xs font-semibold ring-1 ring-inset ${modeClass}`} role="status">{dashboard.mode === "live" ? "Live services" : dashboard.mode === "mixed" ? "Live + fallback" : "Simulated data"}</span><Link href="/" className="flex justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2.5 text-sm font-semibold text-slate-300"><ArrowLeft className="h-4 w-4" /> Citizen cockpit</Link></div></aside>
    <div className="min-w-0"><header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur lg:hidden"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-accent">MonFate Admin</p><p className="text-sm font-bold">{views.find((item) => item.id === active)?.label}</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ${modeClass}`}>{dashboard.mode}</span><button ref={menuButton} type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="mobile-admin-navigation" className="rounded-lg border border-slate-700 p-2" aria-label="Open admin navigation"><Menu className="h-5 w-5" /></button></div></header><main className="mx-auto w-full max-w-[1500px] px-4 py-5 md:px-6 md:py-7">{content}</main></div>
    {menuOpen && <div className="fixed inset-0 z-50 bg-slate-950/80 lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMenu(); }}><section id="mobile-admin-navigation" role="dialog" aria-modal="true" aria-label="Admin navigation" className="flex h-full w-[min(86vw,320px)] flex-col border-r border-slate-800 bg-slate-950 p-4"><div className="mb-6 flex justify-between px-2 pt-2"><div><p className="text-xs uppercase tracking-[.18em] text-accent">Operations control</p><p className="text-xl font-bold">MonFate Admin</p></div><button type="button" onClick={closeMenu} aria-label="Close admin navigation"><X className="h-5 w-5" /></button></div>{nav(true)}<Link href="/" className="mt-auto flex justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2.5"><ArrowLeft className="h-4 w-4" /> Citizen cockpit</Link></section></div>}
    {confirming && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeConfirmation(); }}><section role="dialog" aria-modal="true" aria-labelledby="emergency-title" className="glass w-full max-w-lg rounded-2xl p-6"><div className="flex justify-between"><ShieldAlert className="h-6 w-6 text-down" /><button onClick={closeConfirmation} aria-label="Close emergency approval"><X className="h-4 w-4" /></button></div><h2 id="emergency-title" className="mt-5 text-xl font-bold">Confirm emergency assistance</h2><p className="mt-2 text-sm text-slate-300">Confirm that a human operator has reviewed the evidence.</p><div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm"><strong>Reason:</strong> {confirming.reason}</div><div className="mt-6 flex justify-end gap-3"><button ref={cancelButton} onClick={closeConfirmation} className="rounded-xl border border-slate-700 px-4 py-2.5">Cancel</button><button onClick={() => { const id = confirming.id; closeConfirmation(); void dashboard.approveRecommendation(id); }} className="rounded-xl bg-down px-4 py-2.5 font-semibold">Confirm and send</button></div></section></div>}
  </div>;
}

export default function AdminDashboard() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading admin dashboard…</div>}><DashboardContent /></Suspense>;
}
