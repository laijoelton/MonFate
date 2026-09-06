"use client";

import "./citizen-theme.css";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bus,
  Check,
  Clock,
  MapPin,
  Route as RouteIcon,
  ShieldCheck,
} from "lucide-react";
import { BackgroundTransitAnimation } from "@/components/BackgroundTransitAnimation";
import { CitizenChatDrawer } from "@/components/CitizenChatDrawer";
import { CitizenNav, type CitizenPage } from "@/components/citizen/CitizenNav";
import { BlindAssistanceDemo } from "@/components/citizen/BlindAssistanceDemo";
import { BottomSheet } from "@/components/citizen/BottomSheet";
import { ReportChoiceModal } from "@/components/ReportChoiceModal";
import { BusReportModal, type BusIssueOption } from "@/components/BusReportModal";
import { ObstacleReportModal, type ObstacleDraft } from "@/components/ObstacleReportModal";
import { ALL_STOPS, CYBERJAYA_ROUTES, getRoute } from "@/lib/cyberjaya-routes";
import { useSimulatedFleet } from "@/lib/fleet-simulation";
import { useTrafficAwareRoutes } from "@/lib/traffic-routes";
import { isFirebaseConfigured } from "@/lib/firebase";
import { addObstacleReport, subscribeToObstacles } from "@/lib/firestore-obstacles";
import { subscribeToVehicleAttributes, type VehicleAttributes } from "@/lib/firestore-vehicles";
import { submitVehicleReport } from "@/lib/firestore-vehicle-reports";
import { submitTripRequest } from "@/lib/firestore-trip-requests";
import { subscribeToIncidents } from "@/lib/firestore-incidents";
import { NEED_LABELS, useUserProfile } from "@/lib/user-profile";
import { MOCK_NOW, MOCK_OBSTACLES } from "@/lib/mock-data";
import type { ActiveIncident, NeedType, ObstacleReport, TransitVehicle } from "@/types/monfate";

export interface DepartureSlot {
  id: string;
  time: string;
  shortTime: string;
  crowdLevel: "Low" | "Medium" | "Crowded" | "Very Crowded";
  crowdedDescription: string;
  seatPossibility: "High" | "Moderate" | "Low" | "Very Low";
  seatAvailability: "Seats Available" | "Limited Seating" | "Seats Unlikely" | "No Seats / Full";
  standingLikelihood: "Unlikely" | "Possible" | "Likely" | "High";
  statusColor: "green" | "yellow" | "red";
  barHeight: number;
  busLine: string;
  waitMin: number;
}

export interface ConfirmedTripInfo {
  seconds: number;
  fromName: string;
  toName: string;
  departureTime: string;
  busLine: string;
  needs: NeedType[];
  assistanceRequested: boolean;
}

function buildDailyDepartureSlots(
  fromStopId: string = "terminal",
  toStopId: string = "dpulze",
  busLine: string = "C1",
): DepartureSlot[] {
  const slots: DepartureSlot[] = [];
  let hour = 6;
  let minute = 0;

  // Derive stable, logical route profile characteristics
  const hashStr = `${fromStopId}->${toStopId}:${busLine}`;
  let hash = 0;
  for (let i = 0; i < hashStr.length; i++) {
    hash = (hash << 5) - hash + hashStr.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);

  const involvesUni = fromStopId === "mmu" || toStopId === "mmu" || fromStopId === "cyberia" || toStopId === "cyberia";
  const involvesMall = fromStopId === "dpulze" || toStopId === "dpulze" || fromStopId === "tamarind" || toStopId === "tamarind";
  const involvesOffice = fromStopId === "mdec" || toStopId === "mdec" || fromStopId === "terminal" || toStopId === "terminal";
  const involvesHospital = fromStopId === "hospital" || toStopId === "hospital";

  // Route-specific baseline occupancy shift (-10% to +10%)
  const routeBaseOffset = (seed % 21) - 10;

  while (hour < 23 || (hour === 23 && minute <= 30)) {
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const minuteStr = String(minute).padStart(2, "0");
    const time = `${displayHour}:${minuteStr} ${period}`;
    const shortTime = `${displayHour}:${minuteStr}`;
    const id = `slot-${hour}-${minute}`;

    const totalMinutes = hour * 60 + minute;
    const slotIdx = Math.floor(totalMinutes / 15);

    // Peak distance calculations
    const morningPeakDist = Math.abs(totalMinutes - (8 * 60 + 15));
    const morningIntensity = morningPeakDist <= 60 ? Math.max(0, 1 - morningPeakDist / 60) : 0;

    const lunchPeakDist = Math.abs(totalMinutes - (12 * 60 + 45));
    const lunchIntensity = lunchPeakDist <= 50 ? Math.max(0, 1 - lunchPeakDist / 50) : 0;

    const eveningPeakDist = Math.abs(totalMinutes - (18 * 60));
    const eveningIntensity = eveningPeakDist <= 60 ? Math.max(0, 1 - eveningPeakDist / 60) : 0;

    const isLateNight = totalMinutes >= 22 * 60;

    // Base off-peak load (typical Cyberjaya mid-day transit load: 30-40%)
    let baseLoad = 34 + routeBaseOffset;
    if (involvesHospital) baseLoad += 4;

    // Add peak additions based on route venue relevance
    let peakAddition = 0;
    if (morningIntensity > 0) {
      const peakStrength = involvesOffice ? 55 : involvesUni ? 52 : 44;
      peakAddition = Math.max(peakAddition, morningIntensity * peakStrength);
    }
    if (lunchIntensity > 0) {
      const lunchStrength = involvesMall ? 42 : involvesOffice ? 36 : 28;
      peakAddition = Math.max(peakAddition, lunchIntensity * lunchStrength);
    }
    if (eveningIntensity > 0) {
      const eveStrength = involvesMall ? 52 : involvesOffice ? 50 : 44;
      peakAddition = Math.max(peakAddition, eveningIntensity * eveStrength);
    }

    // Natural 15-minute gentle fluctuation ripple
    const ripple = Math.sin((totalMinutes / 15) * 1.25 + (seed % 9)) * 3.5;
    let barHeight = Math.round(baseLoad + peakAddition + ripple);

    if (isLateNight) {
      barHeight = Math.max(12, Math.round(barHeight * 0.38));
    }

    // Clamp barHeight between 15% and 95%
    barHeight = Math.max(15, Math.min(95, barHeight));

    let crowdLevel: "Low" | "Medium" | "Crowded" | "Very Crowded";
    let crowdedDescription: string;
    let seatPossibility: "High" | "Moderate" | "Low" | "Very Low";
    let seatAvailability: "Seats Available" | "Limited Seating" | "Seats Unlikely" | "No Seats / Full";
    let standingLikelihood: "Unlikely" | "Possible" | "Likely" | "High";
    let statusColor: "green" | "yellow" | "red";

    if (barHeight >= 86) {
      crowdLevel = "Very Crowded";
      crowdedDescription = `Heavy crowd expected (~${barHeight}% capacity)`;
      seatPossibility = "Very Low";
      seatAvailability = "No Seats / Full";
      standingLikelihood = "High";
      statusColor = "red";
    } else if (barHeight >= 68) {
      crowdLevel = "Crowded";
      crowdedDescription = `Likely crowded (~${barHeight}% capacity)`;
      seatPossibility = "Low";
      seatAvailability = "Seats Unlikely";
      standingLikelihood = "Likely";
      statusColor = "red";
    } else if (barHeight >= 42) {
      crowdLevel = "Medium";
      crowdedDescription = `Moderate crowd expected (~${barHeight}% capacity)`;
      seatPossibility = "Moderate";
      seatAvailability = "Limited Seating";
      standingLikelihood = "Possible";
      statusColor = "yellow";
    } else {
      crowdLevel = "Low";
      crowdedDescription = `Low crowd expected (~${barHeight}% capacity)`;
      seatPossibility = "High";
      seatAvailability = "Seats Available";
      standingLikelihood = "Unlikely";
      statusColor = "green";
    }

    // Realistic arrival wait times (e.g. 3, 6, 11, 18 min):
    let waitMin: number;
    if (isLateNight) {
      waitMin = 11 + ((seed + slotIdx) % 8); // 11 to 18 min
    } else if (barHeight >= 68) {
      waitMin = 3 + ((seed + slotIdx) % 4); // 3 to 6 min (frequent rush-hour headway)
    } else if (barHeight >= 42) {
      waitMin = 5 + ((seed + slotIdx) % 6); // 5 to 10 min
    } else {
      waitMin = 3 + ((seed + slotIdx) % 6); // 3 to 8 min
    }

    slots.push({
      id,
      time,
      shortTime,
      crowdLevel,
      crowdedDescription,
      seatPossibility,
      seatAvailability,
      standingLikelihood,
      statusColor,
      barHeight,
      busLine,
      waitMin,
    });

    minute += 15;
    if (minute === 60) {
      minute = 0;
      hour += 1;
    }
  }

  return slots;
}

function getBusEtaMinutesForStop(bus: TransitVehicle, stopId: string): number {
  const route = getRoute(bus.route_id);
  if (!route || route.stops.length < 2) {
    return Math.max(1, Math.round(bus.eta_seconds / 60));
  }

  const stopIndex = route.stops.findIndex((s) => s.id === stopId);
  if (stopIndex === -1) {
    return Math.max(1, Math.round(bus.eta_seconds / 60));
  }

  const stopProgress = stopIndex / (route.stops.length - 1);
  const busProgress = bus.progress ?? 0;

  let diff = stopProgress - busProgress;
  if (diff <= 0.005) {
    diff += 1;
  }

  const loopMinutes = 32;
  const rawMinutes = Math.round(diff * loopMinutes);
  return Math.max(1, rawMinutes);
}

const CyberjayaMap = dynamic(
  () => import("@/components/CyberjayaMap").then((mod) => mod.CyberjayaMap),
  { ssr: false, loading: () => <div className="map-shell" style={{ display: "grid", placeItems: "center" }}>Loading map…</div> },
);

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough trip duration estimate between two stops — uses a shared route's
 * real traffic-aware duration when one exists, otherwise a straight-line
 * distance estimate (which likely means a transfer isn't modeled here). */
function estimateTripSeconds(
  fromStopId: string,
  toStopId: string,
  routeDurationsSeconds: Record<string, number>,
): { seconds: number; sharedRoute: boolean } {
  for (const route of CYBERJAYA_ROUTES) {
    const fromIndex = route.stops.findIndex((s) => s.id === fromStopId);
    const toIndex = route.stops.findIndex((s) => s.id === toStopId);
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      const fullDuration = routeDurationsSeconds[route.route_id];
      const fraction = Math.abs(toIndex - fromIndex) / (route.stops.length - 1);
      if (fullDuration) return { seconds: Math.round(fullDuration * fraction), sharedRoute: true };
      return { seconds: Math.abs(toIndex - fromIndex) * 300, sharedRoute: true };
    }
  }
  const fromStop = ALL_STOPS.find((s) => s.id === fromStopId);
  const toStop = ALL_STOPS.find((s) => s.id === toStopId);
  if (!fromStop || !toStop) return { seconds: 0, sharedRoute: false };
  const meters = haversineMeters(fromStop.location, toStop.location);
  return { seconds: Math.round((meters / 1000 / 20) * 3600), sharedRoute: false };
}

export default function CitizenApp() {
  const [page, setPage] = useState<CitizenPage>("home");
  const [obstacles, setObstacles] = useState<ObstacleReport[]>(MOCK_OBSTACLES);
  const [vehicleAttributes, setVehicleAttributes] = useState<Record<string, VehicleAttributes>>({});
  const [incidents, setIncidents] = useState<Record<string, ActiveIncident>>({});

  const trafficRoutes = useTrafficAwareRoutes(CYBERJAYA_ROUTES);
  const routeDurationsSeconds = useMemo(
    () => Object.fromEntries(Object.entries(trafficRoutes).map(([id, r]) => [id, r.durationSeconds])),
    [trafficRoutes],
  );
  const routeDetours = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(incidents)
          .filter(([, active]) => active.detour)
          .map(([routeId, active]) => [routeId, active.detour!]),
      ),
    [incidents],
  );
  const { vehicles: simulatedVehicles, reportVehicleIssue } = useSimulatedFleet(1200, routeDurationsSeconds, routeDetours);
  const vehicles: TransitVehicle[] = simulatedVehicles.map((v) => ({
    ...v,
    ...(vehicleAttributes[v.vehicle_id] ?? {}),
  }));

  const { needs: profileNeeds, toggleNeed: toggleProfileNeed } = useUserProfile();

  const [stopSheetId, setStopSheetId] = useState<string | null>(null);
  const [busSheetId, setBusSheetId] = useState<string | null>(null);

  const [reportChoiceOpen, setReportChoiceOpen] = useState(false);
  const [busModalOpen, setBusModalOpen] = useState(false);
  const [obstacleModalOpen, setObstacleModalOpen] = useState(false);

  const [fromStopId, setFromStopId] = useState(ALL_STOPS[0].id);
  const [toStopId, setToStopId] = useState(ALL_STOPS[1].id);
  const [tripNeeds, setTripNeeds] = useState<Set<NeedType>>(new Set(profileNeeds));
  const [needAssistance, setNeedAssistance] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("slot-6-0");
  const [tripConfirmed, setTripConfirmed] = useState<ConfirmedTripInfo | null>(null);
  const [showNeedsStep, setShowNeedsStep] = useState(false);
  const [tripPlannerModalOpen, setTripPlannerModalOpen] = useState(false);

  const fromStop = useMemo(
    () => ALL_STOPS.find((s) => s.id === fromStopId) ?? ALL_STOPS[0],
    [fromStopId],
  );
  const toStop = useMemo(
    () => ALL_STOPS.find((s) => s.id === toStopId) ?? ALL_STOPS[1],
    [toStopId],
  );

  const activeBusLine = useMemo(() => {
    const connectingRoute = CYBERJAYA_ROUTES.find(
      (r) => r.stops.some((s) => s.id === fromStopId) && r.stops.some((s) => s.id === toStopId),
    );
    return connectingRoute?.route_id ?? "T504";
  }, [fromStopId, toStopId]);

  const departureSlots: DepartureSlot[] = useMemo(
    () => buildDailyDepartureSlots(fromStopId, toStopId, activeBusLine),
    [fromStopId, toStopId, activeBusLine],
  );

  const activeSlot = useMemo(
    () => departureSlots.find((s) => s.id === selectedSlotId) ?? departureSlots[0],
    [departureSlots, selectedSlotId],
  );

  useEffect(() => {
    // Deferred: setState in an effect body triggers a cascading render.
    const id = window.setTimeout(() => setTripNeeds(new Set(profileNeeds)), 0);
    return () => window.clearTimeout(id);
  }, [profileNeeds]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsubObstacles = subscribeToObstacles(setObstacles);
    const unsubVehicles = subscribeToVehicleAttributes(setVehicleAttributes);
    const unsubIncidents = subscribeToIncidents(setIncidents);
    return () => {
      unsubObstacles?.();
      unsubVehicles?.();
      unsubIncidents?.();
    };
  }, []);

  const handleBusIssueSubmit = async (vehicleId: string, routeId: string, option: BusIssueOption) => {
    if (isFirebaseConfigured) {
      try {
        await submitVehicleReport(vehicleId, routeId, option.label, option.updates);
        return;
      } catch (error) {
        console.error("[MonFate] Failed to submit vehicle report, applying locally instead:", error);
      }
    }
    reportVehicleIssue(vehicleId, option.updates);
  };

  const handleSubmitObstacleReport = async (draft: ObstacleDraft) => {
    if (isFirebaseConfigured) {
      try {
        await addObstacleReport(draft, draft.location);
        return;
      } catch (error) {
        console.error("[MonFate] Failed to submit report to Firestore, falling back to local state:", error);
      }
    }
    const newObstacle: ObstacleReport = {
      id: `obs-${Date.now()}`,
      obstacle_type: draft.obstacle_type,
      location: draft.location,
      description: draft.description,
      affects: draft.affects,
      status: "active",
      trust_score: 40,
      verification_count: 1,
      reported_at: MOCK_NOW,
      last_verified_at: MOCK_NOW,
      reported_by: "you",
    };
    setObstacles((prev) => [newObstacle, ...prev]);
  };

  const busesForStop = (stopId: string) =>
    vehicles.filter((v) => getRoute(v.route_id)?.stops.some((s) => s.id === stopId));

  const selectedStop = stopSheetId ? ALL_STOPS.find((s) => s.id === stopSheetId) : null;
  const busesForSelectedStop = useMemo(() => {
    if (!selectedStop) return [];
    return vehicles
      .filter((v) => getRoute(v.route_id)?.stops.some((s) => s.id === selectedStop.id))
      .map((bus) => ({
        ...bus,
        stopEtaMin: getBusEtaMinutesForStop(bus, selectedStop.id),
      }))
      .sort((a, b) => a.stopEtaMin - b.stopEtaMin);
  }, [selectedStop, vehicles]);
  const selectedBus = busSheetId && busSheetId !== "__help__" ? vehicles.find((v) => v.vehicle_id === busSheetId) : null;

  const confirmTripPlan = async () => {
    const { seconds } = estimateTripSeconds(fromStopId, toStopId, routeDurationsSeconds);
    if (isFirebaseConfigured) {
      try {
        await submitTripRequest(fromStopId, toStopId, Array.from(tripNeeds), seconds || null);
      } catch (error) {
        console.error("[MonFate] Failed to submit trip request to Firestore:", error);
      }
    }
    const fromName = ALL_STOPS.find((s) => s.id === fromStopId)?.name ?? "Origin";
    const toName = ALL_STOPS.find((s) => s.id === toStopId)?.name ?? "Destination";
    setTripConfirmed({
      seconds,
      fromName,
      toName,
      departureTime: activeSlot.time,
      busLine: activeBusLine,
      needs: Array.from(tripNeeds),
      assistanceRequested: needAssistance,
    });
    setShowNeedsStep(false);
    setTripPlannerModalOpen(false);
    setPage("home");
  };

  const activeObstacles = obstacles.filter((o) => o.status === "active");
  const rampFaultBuses = vehicles.filter((v) => v.ramp_status === "fault");

  const pageTitle: Record<CitizenPage, string> = {
    home: "Live Cyberjaya Transit",
    nearby: "Nearby Bus Stops",
    plan: "Plan Your Trip",
    alerts: "Live Transit Advisories",
    report: "Report a Problem",
    profile: "Passenger Accessibility Profile",
  };

  const handleNavigate = (next: CitizenPage) => {
    if (next === "report") {
      setReportChoiceOpen(true);
      return;
    }
    setPage(next);
  };

  return (
    <div className="citizen-shell">
      <BackgroundTransitAnimation />
      <div className="app-shell">
        <CitizenNav activePage={page} onNavigate={handleNavigate} busCount={vehicles.length} />

        <div className="app-main">
          <header className="desktop-topbar">
            <div className="topbar-left">
              <div className="topbar-title-group">
                <span className="topbar-badge">
                  <span className="live-indicator-dot" /> LIVE CYBERJAYA NETWORK
                </span>
                <h1 className="topbar-title">{pageTitle[page]}</h1>
              </div>
            </div>
            <div className="topbar-right">
              <button className="topbar-icon-btn" onClick={() => setPage("alerts")} aria-label="View alerts" title="Alerts">
                <AlertTriangle size={20} />
                {activeObstacles.length + rampFaultBuses.length > 0 && (
                  <span className="topbar-alert-badge">{activeObstacles.length + rampFaultBuses.length}</span>
                )}
              </button>
              <Link href="/admin" className="topbar-icon-btn" aria-label="Admin dashboard" title="Admin dashboard">
                <ShieldCheck size={20} />
              </Link>
            </div>
          </header>

          <div className="app-content-container">
            {page === "home" && (
              <div className="dashboard-view">
                {tripConfirmed && (
                  <div className="dashboard-card active-journey-panel" style={{ marginBottom: 20 }}>
                    <div className="active-journey-content">
                      <div className="active-journey-badge"><RouteIcon size={20} /></div>
                      <div className="active-journey-info">
                        <div className="card-eyebrow">ESTIMATED TRIP</div>
                        <h3>{tripConfirmed.fromName} → {tripConfirmed.toName}</h3>
                        <div className="active-journey-meta" style={{ flexWrap: "wrap", gap: 8 }}>
                          <span>⏱ <strong>{Math.max(1, Math.round(tripConfirmed.seconds / 60))} min</strong> estimated</span>
                          <span>🕒 Departure: <strong>{tripConfirmed.departureTime}</strong> ({tripConfirmed.busLine})</span>
                          {tripConfirmed.needs.map((n) => (
                            <span key={n} className="kpi-badge kpi-good" style={{ padding: "2px 8px" }}>
                              ✓ {NEED_LABELS[n]}
                            </span>
                          ))}
                          {tripConfirmed.assistanceRequested && (
                            <span className="kpi-badge kpi-info" style={{ padding: "2px 8px", background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                              ✓ Assistance Requested
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Top Compact Transport-Style Search Bar */}
                <div
                  className="compact-trip-search-bar"
                  onClick={() => setTripPlannerModalOpen(true)}
                  role="button"
                  tabIndex={0}
                  aria-label="Open trip planner"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setTripPlannerModalOpen(true);
                    }
                  }}
                >
                  <div className="compact-search-content">
                    <div className="compact-search-field">
                      <span className="compact-search-tag">FROM</span>
                      <strong>{fromStop.name}</strong>
                    </div>

                    <div className="compact-search-arrow" aria-hidden="true">
                      <ArrowRight size={16} />
                    </div>

                    <div className="compact-search-field">
                      <span className="compact-search-tag">TO</span>
                      <strong>{toStop.name}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="compact-plan-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTripPlannerModalOpen(true);
                    }}
                  >
                    <Clock size={16} />
                    <span>Plan a Trip</span>
                  </button>
                </div>

                {/* 3 Main KPI Boxes */}
                <section className="kpi-grid" aria-label="Network overview">
                  <div className="kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">LIVE FLEET</span>
                      <div className="kpi-icon-wrap"><Bus size={18} /></div>
                    </div>
                    <div className="kpi-value-row">
                      <span className="kpi-value">{vehicles.length} buses</span>
                      <span className="kpi-badge kpi-good">Moving now</span>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">RAMP FAULTS</span>
                      <div className="kpi-icon-wrap"><AlertTriangle size={18} /></div>
                    </div>
                    <div className="kpi-value-row">
                      <span className="kpi-value">{rampFaultBuses.length}</span>
                      <span className={rampFaultBuses.length > 0 ? "kpi-badge kpi-danger" : "kpi-badge kpi-good"}>
                        {rampFaultBuses.length > 0 ? "Check alerts" : "All clear"}
                      </span>
                    </div>
                  </div>
                  <div className="kpi-card" onClick={() => setPage("nearby")} style={{ cursor: "pointer" }}>
                    <div className="kpi-header">
                      <span className="kpi-title">NEARBY STOPS</span>
                      <div className="kpi-icon-wrap"><MapPin size={18} /></div>
                    </div>
                    <div className="kpi-value-row">
                      <span className="kpi-value">{ALL_STOPS.length} stops</span>
                      <span className="kpi-badge kpi-good">Tap to browse</span>
                    </div>
                  </div>
                </section>

                <div className="dashboard-stage-grid">
                  <section className="stage-main-column">
                    <div className="dashboard-card map-stage-card">
                      <div className="map-card-header">
                        <div className="map-card-title-group">
                          <span className="card-eyebrow">LIVE NETWORK TELEMETRY</span>
                          <h2 className="map-card-title">Cyberjaya Bus Corridor</h2>
                        </div>
                      </div>
                      <div className="map-wrapper-desktop">
                        <section className="map-shell" style={{ isolation: "isolate" }}>
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
                        </section>
                      </div>
                    </div>
                  </section>

                  <aside className="stage-side-column">
                    <div className="dashboard-card side-panel-card">
                      <div className="side-card-header">
                        <div className="card-eyebrow">AROUND YOU</div>
                        <h3>Nearby Transport</h3>
                      </div>
                      <div className="side-stops-list" style={{ marginTop: 12 }}>
                        {ALL_STOPS.slice(0, 4).map((stop) => (
                          <div key={stop.id} className="side-stop-item" onClick={() => setStopSheetId(stop.id)}>
                            <div className="side-stop-icon"><MapPin size={20} /></div>
                            <div className="side-stop-info">
                              <strong>{stop.name}</strong>
                              <div className="side-stop-meta">
                                <span>{busesForStop(stop.id).length} buses serve this stop</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button className="text-button small" onClick={() => setPage("nearby")} style={{ marginTop: 10 }}>
                        View all stops →
                      </button>
                    </div>

                    <div className="dashboard-card side-panel-card access-highlight-card">
                      <div className="access-highlight-header">
                        <div className="access-icon-circle"><ShieldCheck size={22} /></div>
                        <div>
                          <strong>Accessible Transit Commitment</strong>
                          <p className="small muted">
                            MonFate tracks real bus ramps and wheelchair space so you always know before you board.
                          </p>
                        </div>
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            )}

            {page === "nearby" && (
              <div className="dashboard-view">
                <div className="dashboard-card side-panel-card">
                  <h3>All Bus Stops</h3>
                  <div className="stack-list" style={{ marginTop: 12 }}>
                    {ALL_STOPS.map((stop) => (
                      <button key={stop.id} className="stop-option" onClick={() => setStopSheetId(stop.id)}>
                        <span className="stop-icon"><MapPin size={22} /></span>
                        <span>
                          <strong>{stop.name}</strong>
                          <small>{busesForStop(stop.id).length} buses serve this stop</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {page === "plan" && (
              <div className="dashboard-view">
                <div className="dashboard-card side-panel-card">
                  <div className="side-card-header">
                    <div className="card-eyebrow">CROWD & PREDICTIVE FORECAST</div>
                    <h3>Cyberjaya Bus Corridor Forecast</h3>
                  </div>

                  {/* From -> To Selectors */}
                  <div className="trip-search-bar" style={{ marginTop: 14 }}>
                    <div className="trip-search-field">
                      <span className="trip-search-label">FROM</span>
                      <select
                        className="trip-search-select"
                        value={fromStopId}
                        onChange={(e) => {
                          setFromStopId(e.target.value);
                          setTripConfirmed(null);
                        }}
                      >
                        {ALL_STOPS.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="trip-search-arrow" aria-hidden="true">
                      <ArrowRight size={18} />
                    </div>

                    <div className="trip-search-field">
                      <span className="trip-search-label">TO</span>
                      <select
                        className="trip-search-select"
                        value={toStopId}
                        onChange={(e) => {
                          setToStopId(e.target.value);
                          setTripConfirmed(null);
                        }}
                      >
                        {ALL_STOPS.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Fast Time Selection Multi-Row Wrapped Layout */}
                  <div style={{ marginTop: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 750, color: "var(--ink-heading)" }}>
                        Fast Time Selection (6:00 AM – 11:30 PM) · Line {activeBusLine}
                      </span>
                      <span className="small muted">71 departure intervals (15-min)</span>
                    </div>
                    <div className="time-selector-wrap-grid" aria-label="Departure time selector">
                      {departureSlots.map((slot) => {
                        const isSelected = selectedSlotId === slot.id;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            className={`time-chip-card ${isSelected ? "selected" : ""}`}
                            onClick={() => setSelectedSlotId(slot.id)}
                            title={`${slot.time}: ${slot.crowdLevel} crowd, ${slot.seatPossibility} seat possibility`}
                          >
                            <span className={`chip-status-dot dot-${slot.statusColor}`} />
                            <span>{slot.shortTime}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Histogram Chart Section */}
                  <div style={{ marginTop: 22 }}>
                    <div className="section-title-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <div className="card-eyebrow">15-MINUTE DEPARTURE INTERVALS · LINE {activeBusLine}</div>
                        <h4 style={{ margin: "2px 0 0", fontSize: "1.05rem" }}>Predicted Bus Occupancy & Seat Availability</h4>
                      </div>

                      <div className="legend" style={{ display: "flex", gap: 14, fontSize: "0.8rem", flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
                          Green = Low crowd / seat likely
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
                          Yellow = Moderate / standing possible
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
                          Red = High crowd / seat unlikely
                        </span>
                      </div>
                    </div>

                    {/* Interactive Visual Histogram Bars */}
                    <div className="desktop-chart-bars" aria-label="Crowd forecast chart" style={{ marginTop: 8 }}>
                      {departureSlots.map((slot) => {
                        const isSelected = selectedSlotId === slot.id;
                        const barLevelClass =
                          slot.crowdLevel === "Low"
                            ? "level-low"
                            : slot.crowdLevel === "Medium"
                            ? "level-medium"
                            : slot.crowdLevel === "Crowded"
                            ? "level-high"
                            : "level-very-high";
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            className={isSelected ? "bar-selected" : ""}
                            onClick={() => setSelectedSlotId(slot.id)}
                            title={`${slot.time}: ${slot.crowdLevel}, Seat Possibility: ${slot.seatPossibility}`}
                            aria-pressed={isSelected}
                          >
                            <span
                              className={`forecast-bar ${barLevelClass}`}
                              style={{ height: `${slot.barHeight}%` }}
                            />
                            <small style={{ fontWeight: isSelected ? 800 : 600, color: isSelected ? "var(--brand-blue)" : "var(--muted)" }}>
                              {slot.shortTime}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Detailed Visual Indicators */}
                  <div style={{ marginTop: 18 }}>
                    <div className="card-eyebrow">ACTIVE SLOT TELEMETRY: {activeSlot.time} (LINE {activeBusLine})</div>
                    <div className="forecast-indicators-grid">
                      {/* 1. Crowd Level */}
                      <div className={`forecast-indicator-card status-${activeSlot.statusColor}`}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>
                            Crowd Level
                          </span>
                          <span className={`trip-badge badge-${activeSlot.statusColor}`}>
                            ● {activeSlot.crowdLevel}
                          </span>
                        </div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--ink-heading)" }}>
                          {activeSlot.crowdLevel === "Low" ? "Low (Quiet)" : activeSlot.crowdLevel === "Medium" ? "Moderate Crowd" : "High Congestion"}
                        </div>
                        <div className="indicator-meter-bar">
                          <div
                            className={`indicator-meter-fill fill-${activeSlot.statusColor}`}
                            style={{ width: `${activeSlot.barHeight}%` }}
                          />
                        </div>
                      </div>

                      {/* 2. How crowded the bus is expected to be */}
                      <div className={`forecast-indicator-card status-${activeSlot.statusColor}`}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>
                          Expected Bus Crowding
                        </span>
                        <div style={{ fontSize: "0.96rem", fontWeight: 800, color: "var(--ink-heading)" }}>
                          {activeSlot.crowdedDescription}
                        </div>
                        <div className="indicator-meter-bar">
                          <div
                            className={`indicator-meter-fill fill-${activeSlot.statusColor}`}
                            style={{ width: `${activeSlot.barHeight}%` }}
                          />
                        </div>
                      </div>

                      {/* 3. Possibility of getting a seat */}
                      <div className={`forecast-indicator-card status-${activeSlot.statusColor}`}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>
                            Seat Possibility
                          </span>
                          <span className={`trip-badge badge-${activeSlot.statusColor}`}>
                            {activeSlot.seatPossibility} Chance
                          </span>
                        </div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--ink-heading)" }}>
                          {activeSlot.seatPossibility === "High" ? "Seat Very Likely" : activeSlot.seatPossibility === "Moderate" ? "Moderate Chance" : "Seat Unlikely"}
                        </div>
                        <div className="indicator-meter-bar">
                          <div
                            className={`indicator-meter-fill fill-${activeSlot.statusColor}`}
                            style={{ width: activeSlot.seatPossibility === "High" ? "85%" : activeSlot.seatPossibility === "Moderate" ? "50%" : "20%" }}
                          />
                        </div>
                      </div>

                      {/* 4. Seat Availability */}
                      <div className={`forecast-indicator-card status-${activeSlot.statusColor}`}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>
                            Seat Availability
                          </span>
                          <span className={`trip-badge badge-${activeSlot.statusColor}`}>
                            {activeSlot.statusColor === "green" ? "Available" : activeSlot.statusColor === "yellow" ? "Limited" : "Unavailable"}
                          </span>
                        </div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--ink-heading)" }}>
                          {activeSlot.seatAvailability}
                        </div>
                        <div className="indicator-meter-bar">
                          <div
                            className={`indicator-meter-fill fill-${activeSlot.statusColor}`}
                            style={{ width: activeSlot.statusColor === "green" ? "80%" : activeSlot.statusColor === "yellow" ? "40%" : "10%" }}
                          />
                        </div>
                      </div>

                      {/* 5. Approx. Bus Arrival Time */}
                      <div className={`forecast-indicator-card status-${activeSlot.statusColor}`}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>
                            Approx. Bus Arrival Time
                          </span>
                          <span className={`trip-badge badge-${activeSlot.statusColor}`}>
                            ● In {activeSlot.waitMin} min
                          </span>
                        </div>
                        <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--ink-heading)" }}>
                          {activeSlot.waitMin} min
                        </div>
                        <div className="indicator-meter-bar">
                          <div
                            className={`indicator-meter-fill fill-${activeSlot.statusColor}`}
                            style={{ width: `${Math.min(100, Math.max(15, activeSlot.waitMin * 5))}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
                      <span className="small muted">
                        Selected departure: <strong>{activeSlot.time}</strong> (approx. {activeSlot.waitMin} min wait)
                      </span>
                      <button
                        type="button"
                        className="primary-button large"
                        onClick={() => setShowNeedsStep(true)}
                        disabled={fromStopId === toStopId}
                      >
                        Plan Accessible Trip for {activeSlot.time} →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {page === "alerts" && (
              <div className="dashboard-view">
                <div className="dashboard-card side-panel-card">
                  <h3>Live Advisories</h3>
                  <div className="stack-list" style={{ marginTop: 12 }}>
                    {rampFaultBuses.length === 0 && activeObstacles.length === 0 && (
                      <p className="small muted">No active advisories right now.</p>
                    )}
                    {rampFaultBuses.map((bus) => (
                      <div key={bus.vehicle_id} className="stop-option" style={{ cursor: "default" }}>
                        <span className="stop-icon" style={{ background: "#fef2f2", color: "#dc2626" }}>
                          <AlertTriangle size={20} />
                        </span>
                        <span>
                          <strong>{bus.vehicle_id} has no working ramp</strong>
                          <small>Route {bus.route_id} · wheelchair users cannot board this bus right now</small>
                        </span>
                      </div>
                    ))}
                    {activeObstacles.map((obstacle) => (
                      <div key={obstacle.id} className="stop-option" style={{ cursor: "default" }}>
                        <span className="stop-icon" style={{ background: "#fff7ed", color: "#c2410c" }}>
                          <MapPin size={20} />
                        </span>
                        <span>
                          <strong style={{ textTransform: "capitalize" }}>{obstacle.obstacle_type.replace(/_/g, " ")}</strong>
                          <small>{obstacle.description}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {page === "profile" && (
              <div className="dashboard-view">
                <div className="dashboard-card side-panel-card">
                  <div className="side-card-header">
                    <div className="card-eyebrow">YOUR NEEDS</div>
                    <h3>Accessibility Preferences</h3>
                  </div>
                  <p className="small muted" style={{ margin: "8px 0 16px" }}>
                    Saved on this device. These are suggested automatically whenever you plan a trip.
                  </p>
                  <div className="checkbox-list">
                    {(Object.keys(NEED_LABELS) as NeedType[]).map((need) => (
                      <label key={need}>
                        <input
                          type="checkbox"
                          checked={profileNeeds.includes(need)}
                          onChange={() => toggleProfileNeed(need)}
                        />
                        <span>{NEED_LABELS[need]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <BlindAssistanceDemo />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The real Gemini-backed assistant, replacing the placeholder panel.
          It renders its own launcher and dialog, so no Help button is needed
          here. `stops` is remapped because the citizen UI models a stop as
          RouteStop (`id`) while the chat contract uses TransitStop
          (`stop_id`) — the shape the backend actually sends. */}
      <CitizenChatDrawer
        stops={ALL_STOPS.map((s) => ({
          stop_id: s.id,
          name: s.name,
          location: s.location,
        }))}
        onObstacleCreated={() => {}}
      />

      {selectedStop && (
        <BottomSheet title={selectedStop.name} onClose={() => setStopSheetId(null)}>
          <p className="sheet-intro">Buses serving this stop:</p>
          <div className="stack-list" style={{ gap: 12 }}>
            {busesForSelectedStop.map((bus) => {
              const route = getRoute(bus.route_id);
              const isSeatsAvailable = bus.capacity_status === "seats_available" || bus.capacity_status === "empty";
              const isStandingRoom = bus.capacity_status === "standing_room";

              const badgeColorClass = isSeatsAvailable
                ? "badge-green"
                : isStandingRoom
                ? "badge-yellow"
                : "badge-red";

              const seatStatusLabel = isSeatsAvailable
                ? "● Seats Available"
                : isStandingRoom
                ? "● Standing Room / Limited Seating"
                : "● No Seats Available / Very Crowded";

              return (
                <button
                  key={bus.vehicle_id}
                  className="enhanced-bus-card"
                  onClick={() => {
                    setStopSheetId(null);
                    setBusSheetId(bus.vehicle_id);
                  }}
                >
                  <div className="enhanced-bus-header">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="bus-line-pill">
                        <Bus size={15} />
                        {bus.route_id}
                      </span>
                      <strong style={{ fontSize: "0.95rem", color: "var(--ink-heading)" }}>
                        {bus.vehicle_id}
                      </strong>
                    </div>
                    <span className="bus-eta-pill">
                      {bus.stopEtaMin <= 1 ? "Arriving now" : `${bus.stopEtaMin} min away`}
                    </span>
                  </div>

                  <div style={{ fontSize: "0.86rem", color: "var(--muted)", fontWeight: 550 }}>
                    {route?.name ?? `Route ${bus.route_id}`}
                  </div>

                  <div className="bus-tags-row">
                    <span className={`trip-badge ${badgeColorClass}`}>
                      {seatStatusLabel}
                    </span>
                    <span
                      style={{
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: bus.ramp_status === "fault" ? "#fef2f2" : "#ecfdf3",
                        color: bus.ramp_status === "fault" ? "#dc2626" : "#027a48",
                        border: `1px solid ${bus.ramp_status === "fault" ? "#fecdca" : "#abefc6"}`,
                      }}
                    >
                      {bus.ramp_status === "fault" ? "✕ Ramp Fault" : "✓ Ramp Working"}
                    </span>
                    <span
                      style={{
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: bus.wheelchair_space_available ? "#ecfdf3" : "#f1f5f9",
                        color: bus.wheelchair_space_available ? "#027a48" : "#64748b",
                        border: `1px solid ${bus.wheelchair_space_available ? "#abefc6" : "#cbd5e1"}`,
                      }}
                    >
                      {bus.wheelchair_space_available ? "✓ Wheelchair Space" : "✕ Wheelchair Space Full"}
                    </span>
                  </div>
                </button>
              );
            })}
            {busesForSelectedStop.length === 0 && <p className="small muted">No buses currently serve this stop.</p>}
          </div>
        </BottomSheet>
      )}

      {selectedBus && (
        <BottomSheet title={`${selectedBus.vehicle_id} Details`} onClose={() => setBusSheetId(null)}>
          <div className="bus-hero">
            <div className="big-bus"><Bus size={32} /></div>
            <div>
              <strong>{selectedBus.eta_seconds <= 0 ? "Arriving now" : `Arriving in ${Math.round(selectedBus.eta_seconds / 60)} min`}</strong>
              <span>Route {selectedBus.route_id} · Next stop: {selectedBus.next_stop_id}</span>
            </div>
          </div>
          <div className="info-grid boxed" style={{ marginTop: 14 }}>
            <span>Ramp</span>
            <strong style={{ color: selectedBus.ramp_status === "fault" ? "#dc2626" : "#059669" }}>
              {selectedBus.ramp_status === "fault" ? "✕ Fault reported" : "✓ Working"}
            </strong>
            <span>Wheelchair space</span>
            <strong style={{ color: selectedBus.wheelchair_space_available ? "#059669" : "#dc2626" }}>
              {selectedBus.wheelchair_space_available ? "✓ Available" : "✕ Not available"}
            </strong>
            <span>Priority seating</span>
            <strong style={{ color: selectedBus.priority_seats_available ? "#059669" : "#dc2626" }}>
              {selectedBus.priority_seats_available ? "✓ Available" : "✕ Not available"}
            </strong>
            <span>Crowd level</span>
            <strong style={{ textTransform: "capitalize" }}>{selectedBus.capacity_status.replace("_", " ")}</strong>
          </div>
        </BottomSheet>
      )}

      {tripPlannerModalOpen && (
        <BottomSheet title="Plan Your Accessible Trip" wide onClose={() => setTripPlannerModalOpen(false)}>
          {/* Origin & Destination */}
          <div className="trip-search-bar" style={{ marginTop: 4 }}>
            <div className="trip-search-field">
              <span className="trip-search-label">FROM</span>
              <select
                className="trip-search-select"
                value={fromStopId}
                onChange={(e) => {
                  setFromStopId(e.target.value);
                  setTripConfirmed(null);
                }}
              >
                {ALL_STOPS.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="trip-search-arrow" aria-hidden="true">
              <ArrowRight size={18} />
            </div>

            <div className="trip-search-field">
              <span className="trip-search-label">TO</span>
              <select
                className="trip-search-select"
                value={toStopId}
                onChange={(e) => {
                  setToStopId(e.target.value);
                  setTripConfirmed(null);
                }}
              >
                {ALL_STOPS.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Fast Time Selection Multi-Row Layout */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 750, color: "var(--ink-heading)" }}>
                Select Departure Time (Line {activeBusLine})
              </span>
              <span className="small muted">6:00 AM – 11:30 PM · 15-min intervals</span>
            </div>

            <div className="time-selector-wrap-grid" aria-label="Departure time selector">
              {departureSlots.map((slot) => {
                const isSelected = selectedSlotId === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    className={`time-chip-card ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedSlotId(slot.id)}
                    title={`${slot.time}: ${slot.crowdLevel} crowd`}
                  >
                    <span className={`chip-status-dot dot-${slot.statusColor}`} />
                    <span>{slot.shortTime}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Slot Telemetry & Status */}
          <div style={{ marginTop: 16 }}>
            <div className="card-eyebrow" style={{ marginBottom: 6 }}>
              SELECTED DEPARTURE: {activeSlot.time} (LINE {activeBusLine})
            </div>
            <div className="forecast-indicators-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div className={`forecast-indicator-card status-${activeSlot.statusColor}`} style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>
                    Crowd Level
                  </span>
                  <span className={`trip-badge badge-${activeSlot.statusColor}`}>
                    ● {activeSlot.crowdLevel}
                  </span>
                </div>
                <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "var(--ink-heading)", marginTop: 4 }}>
                  {activeSlot.crowdedDescription}
                </div>
              </div>

              <div className={`forecast-indicator-card status-${activeSlot.statusColor}`} style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>
                    Seat Possibility
                  </span>
                  <span className={`trip-badge badge-${activeSlot.statusColor}`}>
                    {activeSlot.seatPossibility} Chance
                  </span>
                </div>
                <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "var(--ink-heading)", marginTop: 4 }}>
                  {activeSlot.seatAvailability}
                </div>
              </div>

              <div className={`forecast-indicator-card status-${activeSlot.statusColor}`} style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>
                    Approx. Bus Arrival Time
                  </span>
                  <span className={`trip-badge badge-${activeSlot.statusColor}`}>
                    ● In {activeSlot.waitMin} min
                  </span>
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--ink-heading)", marginTop: 4 }}>
                  {activeSlot.waitMin} min
                </div>
              </div>
            </div>
          </div>

          {/* Accessibility Needs & Assistance Request */}
          <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 750, color: "var(--ink-heading)", display: "block", marginBottom: 8 }}>
              Any accessibility needs for this trip?
            </span>
            <div className="checkbox-list">
              {(Object.keys(NEED_LABELS) as NeedType[]).map((need) => (
                <label key={need}>
                  <input
                    type="checkbox"
                    checked={tripNeeds.has(need)}
                    onChange={() =>
                      setTripNeeds((prev) => {
                        const next = new Set(prev);
                        if (next.has(need)) next.delete(need);
                        else next.add(need);
                        return next;
                      })
                    }
                  />
                  <span>{NEED_LABELS[need]}</span>
                </label>
              ))}
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 650, color: "var(--ink-heading)" }}>
                <input
                  type="checkbox"
                  checked={needAssistance}
                  onChange={(e) => setNeedAssistance(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: "var(--brand-blue)" }}
                />
                <span>Do you need assistance for this trip?</span>
              </label>
              <p className="small muted" style={{ margin: "4px 0 0 28px" }}>
                Station staff and driver will be notified to assist with boarding and alighting.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setTripPlannerModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-button large"
              onClick={confirmTripPlan}
              disabled={fromStopId === toStopId}
            >
              Confirm Trip ({activeSlot.time})
            </button>
          </div>
        </BottomSheet>
      )}

      {showNeedsStep && (
        <BottomSheet title="Any accessibility needs for this trip?" onClose={() => setShowNeedsStep(false)}>
          <p className="sheet-intro">Pre-filled from your profile — adjust for this trip only if needed.</p>
          <div className="checkbox-list">
            {(Object.keys(NEED_LABELS) as NeedType[]).map((need) => (
              <label key={need}>
                <input
                  type="checkbox"
                  checked={tripNeeds.has(need)}
                  onChange={() =>
                    setTripNeeds((prev) => {
                      const next = new Set(prev);
                      if (next.has(need)) next.delete(need);
                      else next.add(need);
                      return next;
                    })
                  }
                />
                <span>{NEED_LABELS[need]}</span>
              </label>
            ))}
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 650, color: "var(--ink-heading)" }}>
              <input
                type="checkbox"
                checked={needAssistance}
                onChange={(e) => setNeedAssistance(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "var(--brand-blue)" }}
              />
              <span>Do you need assistance for this trip?</span>
            </label>
            <p className="small muted" style={{ margin: "4px 0 0 28px" }}>
              Station staff and driver will be notified to assist with boarding and alighting.
            </p>
          </div>

          <button className="primary-button large" onClick={confirmTripPlan} style={{ marginTop: 16 }}>
            Confirm Trip
          </button>
        </BottomSheet>
      )}

      {reportChoiceOpen && (
        <ReportChoiceModal
          onClose={() => setReportChoiceOpen(false)}
          onChooseBus={() => { setReportChoiceOpen(false); setBusModalOpen(true); }}
          onChooseObstacle={() => { setReportChoiceOpen(false); setObstacleModalOpen(true); }}
        />
      )}
      {busModalOpen && (
        <BusReportModal vehicles={vehicles} onClose={() => setBusModalOpen(false)} onSubmit={handleBusIssueSubmit} />
      )}
      {obstacleModalOpen && (
        <ObstacleReportModal
          onClose={() => setObstacleModalOpen(false)}
          selectedObstacle={null}
          nowIso={MOCK_NOW}
          onSubmitReport={handleSubmitObstacleReport}
        />
      )}
    </div>
  );
}
