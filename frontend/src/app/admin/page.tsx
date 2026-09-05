"use client";

import "./cockpit-theme.css";
import Link from "next/link";
<<<<<<< HEAD
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
=======
import { useEffect, useState } from "react";
>>>>>>> 9e66937e642b429933a10f99a5aefeadea03f6d9
import {
  AlertTriangle,
  ArrowLeft,
  Bus,
  Check,
  MapPin,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Gauge } from "@/components/ui/Gauge";
import { DispatchAlertBanner } from "@/components/DispatchAlertBanner";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  approveVehicleReport,
  rejectVehicleReport,
  subscribeToPendingVehicleReports,
} from "@/lib/firestore-vehicle-reports";
import { subscribeToObstacles } from "@/lib/firestore-obstacles";
import { subscribeToVehicleAttributes, type VehicleAttributes } from "@/lib/firestore-vehicles";
import { subscribeToTripRequests } from "@/lib/firestore-trip-requests";
import { useSimulatedFleet } from "@/lib/fleet-simulation";
<<<<<<< HEAD
import { useTrafficAwareRoutes } from "@/lib/traffic-routes";
=======
>>>>>>> 9e66937e642b429933a10f99a5aefeadea03f6d9
import { useAccidentSimulation } from "@/lib/accident-simulation";
import { AccidentSimulatorPanel } from "@/components/AccidentSimulatorPanel";
import { getRoute, ALL_STOPS, CYBERJAYA_ROUTES } from "@/lib/cyberjaya-routes";
import { NEED_LABELS } from "@/lib/user-profile";
import type { DispatchAlert, ObstacleReport, TransitVehicle, TripRequest, VehicleReport } from "@/types/monfate";

<<<<<<< HEAD
// Leaflet reaches into `window` at import time, so this must never render
// on the server — ssr: false keeps it out of Next.js's server render pass.
const CyberjayaMap = dynamic(
  () => import("@/components/CyberjayaMap").then((mod) => mod.CyberjayaMap),
  { ssr: false, loading: () => <div style={{ height: 420, display: "grid", placeItems: "center" }}>Loading map…</div> },
);

=======
>>>>>>> 9e66937e642b429933a10f99a5aefeadea03f6d9
export default function AdminPage() {
  const [reports, setReports] = useState<VehicleReport[]>([]);
  const [obstacles, setObstacles] = useState<ObstacleReport[]>([]);
  const [vehicleAttributes, setVehicleAttributes] = useState<Record<string, VehicleAttributes>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  const [tripRequests, setTripRequests] = useState<TripRequest[]>([]);

<<<<<<< HEAD
  const trafficRoutes = useTrafficAwareRoutes(CYBERJAYA_ROUTES);
  const { incidents, triggerAccident, clearAccident } = useAccidentSimulation(CYBERJAYA_ROUTES);
  const routeDetours = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(incidents)
          .filter(([, active]) => active.detour)
          .map(([routeId, active]) => [routeId, active.detour!]),
      ),
    [incidents],
  );
  const routeDurationsSeconds = useMemo(
    () => Object.fromEntries(Object.entries(trafficRoutes).map(([id, r]) => [id, r.durationSeconds])),
    [trafficRoutes],
  );
  const { vehicles: simulatedVehicles } = useSimulatedFleet(1200, routeDurationsSeconds, routeDetours);
=======
  const { vehicles: simulatedVehicles } = useSimulatedFleet();
  const { incidents, triggerAccident, clearAccident } = useAccidentSimulation(CYBERJAYA_ROUTES);
>>>>>>> 9e66937e642b429933a10f99a5aefeadea03f6d9
  const vehicles: TransitVehicle[] = simulatedVehicles.map((v) => ({
    ...v,
    ...(vehicleAttributes[v.vehicle_id] ?? {}),
  }));

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const unsubscribeReports = subscribeToPendingVehicleReports(
      (r) => {
        setReports(r);
        setReportsLoaded(true);
        setError(null);
      },
      (err) => setError(`Couldn't load pending reports: ${err.message}`),
    );
    const unsubscribeObstacles = subscribeToObstacles(
      setObstacles,
      (err) => setError(`Couldn't load obstacle reports: ${err.message}`),
    );
    const unsubscribeVehicles = subscribeToVehicleAttributes(setVehicleAttributes);
    const unsubscribeTripRequests = subscribeToTripRequests(
      setTripRequests,
      (err) => setError(`Couldn't load trip requests: ${err.message}`),
    );

    return () => {
      unsubscribeReports?.();
      unsubscribeObstacles?.();
      unsubscribeVehicles?.();
      unsubscribeTripRequests?.();
    };
  }, []);

  const handleTriggerAccident = (routeId: string, stopId: string, description: string) => {
    const route = CYBERJAYA_ROUTES.find((r) => r.route_id === routeId);
    const stop = route?.stops.find((s) => s.id === stopId);
    if (!stop) return;
    triggerAccident(routeId, stop.location, description);
  };

  const handleApprove = async (report: VehicleReport) => {
    setBusy(report.id);
    setError(null);
    try {
      await approveVehicleReport(report);
    } catch (err) {
      setError(`Approve failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async (report: VehicleReport) => {
    setBusy(report.id);
    setError(null);
    try {
      await rejectVehicleReport(report.id);
    } catch (err) {
      setError(`Reject failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const rampFaultCount = vehicles.filter((v) => v.ramp_status === "fault").length;
  const fullCount = vehicles.filter((v) => v.capacity_status === "full").length;
  const accessiblePct = vehicles.length
    ? Math.round((vehicles.filter((v) => v.is_accessible).length / vehicles.length) * 100)
    : 0;
  const spacePct = vehicles.length
    ? Math.round((vehicles.filter((v) => v.wheelchair_space_available).length / vehicles.length) * 100)
    : 0;

  const activeObstacles = obstacles.filter((o) => o.status === "active");

  // Real alerts derived from actual data — not mock. Each source maps to a
  // genuine condition an operator would want surfaced immediately.
  const dispatchAlerts: DispatchAlert[] = [
    ...vehicles
      .filter((v) => v.ramp_status === "fault")
      .map((v): DispatchAlert => ({
        alert_id: `ramp-fault-${v.vehicle_id}`,
        severity: "critical",
        headline: `${v.vehicle_id} has no working ramp`,
        detail: `Reported ramp fault on route ${v.route_id}. Wheelchair users cannot board this bus.`,
        stop_id: v.next_stop_id,
        route_id: v.route_id,
        eta_seconds: v.eta_seconds,
        confidence: null,
        affects: ["wheelchair_ramp"],
      })),
    ...reports.map((r): DispatchAlert => ({
      alert_id: `pending-report-${r.id}`,
      severity: "warning",
      headline: `${r.vehicle_id} report awaiting approval`,
      detail: `${r.label} — reported by ${r.reported_by ?? "anonymous"}.`,
      stop_id: getRoute(r.route_id)?.name ?? r.route_id,
      route_id: r.route_id,
      eta_seconds: null,
      confidence: null,
      affects: [],
    })),
    ...activeObstacles.slice(0, 5).map((o): DispatchAlert => ({
      alert_id: `obstacle-${o.id}`,
      severity: o.trust_score >= 70 ? "critical" : "warning",
      headline: o.obstacle_type.replace(/_/g, " "),
      detail: o.description,
      stop_id: `${o.location.lat.toFixed(4)}, ${o.location.lng.toFixed(4)}`,
      route_id: null,
      eta_seconds: null,
      confidence: o.trust_score / 100,
      affects: o.affects,
    })),
  ].filter((a) => !dismissedAlertIds.has(a.alert_id));

  const dismissAlert = (id: string) => setDismissedAlertIds((prev) => new Set(prev).add(id));

  return (
    <div className="monfate-cockpit px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/"
              className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
            >
              <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
              Back to live map
            </Link>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <ShieldCheck aria-hidden className="h-6 w-6 text-accent" />
              MonFate Cockpit
            </h1>
            <p className="text-sm text-slate-400">Operations &amp; accessibility oversight</p>
          </div>
          <StatusPill tone={isFirebaseConfigured ? "ok" : "down"} pulse={isFirebaseConfigured}>
            {isFirebaseConfigured ? "Live — Firestore connected" : "Offline — Firebase not configured"}
          </StatusPill>
        </header>

        {!isFirebaseConfigured && (
          <Card>
            <p className="text-sm text-slate-300">
              This page needs Firebase to show real reports. Add your config to{" "}
              <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">frontend/.env.local</code> and
              restart <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">npm run dev</code>.
            </p>
          </Card>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-down/30 bg-down/15 px-4 py-3 text-sm text-down">
            <AlertTriangle aria-hidden className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <DispatchAlertBanner alerts={dispatchAlerts} onDismiss={dismissAlert} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card title="Fleet size" icon={<Bus className="h-4 w-4" />}>
            <p className="text-3xl font-bold tabular">{vehicles.length}</p>
            <p className="mt-1 text-xs text-slate-400">buses across all routes</p>
          </Card>
          <Card title="Ramp faults" icon={<AlertTriangle className="h-4 w-4" />}>
            <p className="text-3xl font-bold tabular text-down">{rampFaultCount}</p>
            <p className="mt-1 text-xs text-slate-400">buses reporting no working ramp</p>
          </Card>
          <Card title="At capacity" icon={<Bus className="h-4 w-4" />}>
            <p className="text-3xl font-bold tabular text-warn">{fullCount}</p>
            <p className="mt-1 text-xs text-slate-400">buses that can&apos;t board more riders</p>
          </Card>
          <Card title="Active obstacles" icon={<MapPin className="h-4 w-4" />}>
            <p className="text-3xl font-bold tabular text-down">{activeObstacles.length}</p>
            <p className="mt-1 text-xs text-slate-400">unresolved accessibility reports</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card title="Fleet accessibility" icon={<ShieldCheck className="h-4 w-4" />}>
            <div className="flex items-center gap-4">
              <Gauge value={accessiblePct} label="Accessible" />
              <p className="text-sm text-slate-400">
                <span className="tabular font-semibold text-slate-100">{accessiblePct}%</span> of the fleet has a
                working ramp right now.
              </p>
            </div>
          </Card>
          <Card title="Wheelchair space" icon={<ShieldCheck className="h-4 w-4" />}>
            <div className="flex items-center gap-4">
              <Gauge value={spacePct} label="Space free" />
              <p className="text-sm text-slate-400">
                <span className="tabular font-semibold text-slate-100">{spacePct}%</span> of the fleet currently has
                a free wheelchair space.
              </p>
            </div>
          </Card>
        </div>

        <Card
          title="Pending bus reports"
          icon={<RefreshCw className="h-4 w-4" />}
          right={<StatusPill tone={reports.length > 0 ? "warn" : "idle"}>{reports.length} pending</StatusPill>}
        >
          {!reportsLoaded && isFirebaseConfigured && (
            <p className="text-sm text-slate-400">Loading…</p>
          )}
          {reportsLoaded && reports.length === 0 && (
            <p className="text-sm text-slate-400">No pending reports right now — nice and clear.</p>
          )}
          <div className="space-y-2">
            {reports.map((report) => {
              const route = getRoute(report.route_id);
              return (
                <div
                  key={report.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {report.vehicle_id}{" "}
                      <span className="font-normal text-slate-400">
                        · {route?.route_id ?? report.route_id} {route?.name ? `· ${route.name}` : ""}
                      </span>
                    </p>
                    <p className="text-sm text-slate-300">{report.label}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Reported by {report.reported_by ?? "anonymous"} · {new Date(report.reported_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy === report.id}
                      onClick={() => handleApprove(report)}
                      className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      <Check aria-hidden className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy === report.id}
                      onClick={() => handleReject(report)}
                      className="flex items-center gap-1 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
                    >
                      <X aria-hidden className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card
          title="Accessibility issues"
          icon={<MapPin className="h-4 w-4" />}
          right={<StatusPill tone={activeObstacles.length > 0 ? "down" : "ok"}>{activeObstacles.length} active</StatusPill>}
        >
          {obstacles.length === 0 && <p className="text-sm text-slate-400">No obstacle reports yet.</p>}
          <div className="space-y-2">
            {obstacles.slice(0, 10).map((obstacle) => (
              <div
                key={obstacle.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold capitalize">{obstacle.obstacle_type.replace(/_/g, " ")}</p>
                  <p className="text-sm text-slate-300">{obstacle.description}</p>
                </div>
                <StatusPill
                  tone={obstacle.status === "active" ? "down" : obstacle.status === "disputed" ? "warn" : "ok"}
                  pulse={obstacle.status === "active"}
                >
                  {obstacle.status}
                </StatusPill>
              </div>
            ))}
          </div>
        </Card>
        <Card
          title="Passenger accessibility requests"
          icon={<ShieldCheck className="h-4 w-4" />}
          right={<StatusPill tone={tripRequests.length > 0 ? "accent" : "idle"}>{tripRequests.length} total</StatusPill>}
        >
          {tripRequests.length === 0 && (
            <p className="text-sm text-slate-400">No trip requests from the citizen app yet.</p>
          )}
          <div className="space-y-2">
            {tripRequests.slice(0, 10).map((req) => {
              const fromStop = ALL_STOPS.find((s) => s.id === req.from_stop_id);
              const toStop = ALL_STOPS.find((s) => s.id === req.to_stop_id);
              return (
                <div
                  key={req.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {fromStop?.name ?? req.from_stop_id} → {toStop?.name ?? req.to_stop_id}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(req.requested_at).toLocaleString()}
                      {req.estimated_duration_seconds !== null &&
                        ` · Est. ${Math.round(req.estimated_duration_seconds / 60)} min`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {req.needs.length === 0 ? (
                      <span className="text-xs text-slate-500">No specific needs declared</span>
                    ) : (
                      req.needs.map((need) => (
                        <span
                          key={need}
                          className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent"
                        >
                          {NEED_LABELS[need]}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Demand intelligence" icon={<RefreshCw className="h-4 w-4" />}>
          {tripRequests.length === 0 ? (
            <p className="text-sm text-slate-400">
              Not enough trip requests yet to show demand patterns. This fills in as citizens plan trips.
            </p>
          ) : (
            (() => {
              const counts = new Map<string, number>();
              for (const req of tripRequests) {
                counts.set(req.to_stop_id, (counts.get(req.to_stop_id) ?? 0) + 1);
              }
              const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
              const maxCount = ranked[0]?.[1] ?? 1;
              return (
                <div className="space-y-2">
                  <p className="mb-2 text-xs text-slate-400">
                    Most-requested destination stops, based on real citizen trip requests (not a forecast model —
                    a live count of actual demand signals).
                  </p>
                  {ranked.map(([stopId, count]) => {
                    const stop = ALL_STOPS.find((s) => s.id === stopId);
                    return (
                      <div key={stopId} className="flex items-center gap-3">
                        <span className="w-32 flex-shrink-0 truncate text-sm">{stop?.name ?? stopId}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${(count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="w-6 flex-shrink-0 text-right text-xs tabular text-slate-400">{count}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </Card>

<<<<<<< HEAD
        <Card title="Live network map" icon={<MapPin className="h-4 w-4" />}>
          <div style={{ height: 420, borderRadius: 12, overflow: "hidden", isolation: "isolate" }}>
            <CyberjayaMap
              vehicles={vehicles}
              obstacles={obstacles}
              activeFilters={new Set()}
              selectedRouteId="all"
              selectedObstacleId={null}
              onSelectObstacle={() => {}}
              trafficRoutes={trafficRoutes}
              incidents={incidents}
            />
          </div>
        </Card>

=======
>>>>>>> 9e66937e642b429933a10f99a5aefeadea03f6d9
        <Card title="Ops tools — simulate accident" icon={<AlertTriangle className="h-4 w-4" />}>
          <AccidentSimulatorPanel incidents={incidents} onTrigger={handleTriggerAccident} onClear={clearAccident} />
        </Card>
      </div>
    </div>
  );
}
