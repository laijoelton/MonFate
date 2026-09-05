"use client";

import "./citizen-theme.css";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bus,
  Clock,
  MapPin,
  MessageCircle,
  Route as RouteIcon,
  ShieldCheck,
} from "lucide-react";
import { CitizenNav, type CitizenPage } from "@/components/citizen/CitizenNav";
import { BottomSheet } from "@/components/citizen/BottomSheet";
import { BackgroundTransitDecor } from "@/components/citizen/BackgroundTransitDecor";
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
import { NEED_LABELS, useUserProfile } from "@/lib/user-profile";
import { MOCK_NOW, MOCK_OBSTACLES } from "@/lib/mock-data";
import type { NeedType, ObstacleReport, TransitVehicle } from "@/types/monfate";

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

export interface JourneySlot {
  id: string;
  time: string;
  shortLabel: string;
  crowdLevel: "Low" | "Moderate" | "Busy" | "Very Full";
  crowdColor: "green" | "yellow" | "red";
  expectedBusCrowd: string;
  seatPossibility: string;
  seatAvailability: string;
  standingRoom: string;
  chartHeight: number;
  durationMinutes: number;
}

function generateJourneySlots(durationSeconds: number): JourneySlot[] {
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const slots: JourneySlot[] = [];

  // 6:00 AM (360 min) to 11:30 PM (1410 min) in 15-minute increments
  for (let m = 360, idx = 0; m <= 1410; m += 15, idx++) {
    const hour = Math.floor(m / 60);
    const minute = m % 60;
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    const displayMinute = minute < 10 ? `0${minute}` : `${minute}`;
    const time = `${displayHour}:${displayMinute} ${period}`;
    const shortLabel = `${displayHour}:${displayMinute}`;

    let crowdLevel: "Low" | "Moderate" | "Busy" | "Very Full" = "Low";
    let crowdColor: "green" | "yellow" | "red" = "green";
    let expectedBusCrowd = "Quiet departure";
    let seatPossibility = "High possibility";
    let seatAvailability = "Seats likely available";
    let standingRoom = "Ample standing room";
    let chartHeight = 28;

    // Preserved historic values for 11:15 AM - 12:30 PM
    if (m === 675) {
      // 11:15 AM
      crowdLevel = "Low";
      crowdColor = "green";
      expectedBusCrowd = "Low crowd expected";
      seatPossibility = "High possibility";
      seatAvailability = "Seats likely available";
      standingRoom = "Ample standing room";
      chartHeight = 32;
    } else if (m === 690) {
      // 11:30 AM
      crowdLevel = "Moderate";
      crowdColor = "yellow";
      expectedBusCrowd = "Moderate crowd expected";
      seatPossibility = "Moderate possibility";
      seatAvailability = "Limited seating available";
      standingRoom = "Standing room likely";
      chartHeight = 58;
    } else if (m === 705) {
      // 11:45 AM
      crowdLevel = "Busy";
      crowdColor = "red";
      expectedBusCrowd = "High crowd expected";
      seatPossibility = "Low possibility";
      seatAvailability = "Seats unlikely / full";
      standingRoom = "Tight standing room";
      chartHeight = 84;
    } else if (m === 720) {
      // 12:00 PM
      crowdLevel = "Low";
      crowdColor = "green";
      expectedBusCrowd = "Quiet departure";
      seatPossibility = "High possibility";
      seatAvailability = "Seats likely available";
      standingRoom = "Plentiful standing space";
      chartHeight = 30;
    } else if (m === 735) {
      // 12:15 PM
      crowdLevel = "Moderate";
      crowdColor = "yellow";
      expectedBusCrowd = "Moderate commuter flow";
      seatPossibility = "Moderate possibility";
      seatAvailability = "Limited seating available";
      standingRoom = "Standing room available";
      chartHeight = 62;
    } else if (m === 750) {
      // 12:30 PM
      crowdLevel = "Very Full";
      crowdColor = "red";
      expectedBusCrowd = "Peak corridor congestion";
      seatPossibility = "Seat unlikely";
      seatAvailability = "Seats full";
      standingRoom = "Standing room only";
      chartHeight = 96;
    } else if (m >= 465 && m <= 525) {
      // 7:45 AM - 8:45 AM (Morning peak rush)
      crowdLevel = "Very Full";
      crowdColor = "red";
      expectedBusCrowd = "Peak morning rush";
      seatPossibility = "Seat unlikely";
      seatAvailability = "Seats full";
      standingRoom = "Standing room only";
      chartHeight = 94;
    } else if (m === 450 || m === 540) {
      // 7:30 AM, 9:00 AM (Morning busy shoulders)
      crowdLevel = "Busy";
      crowdColor = "red";
      expectedBusCrowd = "High commuter flow";
      seatPossibility = "Low possibility";
      seatAvailability = "Seats unlikely / full";
      standingRoom = "Tight standing room";
      chartHeight = 82;
    } else if ((m >= 420 && m < 450) || m === 555) {
      // 7:00 AM - 7:15 AM, 9:15 AM (Morning moderate flow)
      crowdLevel = "Moderate";
      crowdColor = "yellow";
      expectedBusCrowd = "Moderate commuter flow";
      seatPossibility = "Moderate possibility";
      seatAvailability = "Limited seating available";
      standingRoom = "Standing room likely";
      chartHeight = 58;
    } else if (m === 765) {
      // 12:45 PM (Post lunch rush)
      crowdLevel = "Busy";
      crowdColor = "red";
      expectedBusCrowd = "High lunch crowd";
      seatPossibility = "Low possibility";
      seatAvailability = "Seats unlikely / full";
      standingRoom = "Tight standing room";
      chartHeight = 82;
    } else if (m >= 780 && m <= 810) {
      // 1:00 PM - 1:30 PM
      crowdLevel = "Moderate";
      crowdColor = "yellow";
      expectedBusCrowd = "Moderate commuter flow";
      seatPossibility = "Moderate possibility";
      seatAvailability = "Limited seating available";
      standingRoom = "Standing room available";
      chartHeight = 60;
    } else if (m >= 990 && m <= 1035) {
      // 4:30 PM - 5:15 PM (Evening buildup)
      crowdLevel = "Moderate";
      crowdColor = "yellow";
      expectedBusCrowd = "Moderate commuter flow";
      seatPossibility = "Moderate possibility";
      seatAvailability = "Limited seating available";
      standingRoom = "Standing room likely";
      chartHeight = 60;
    } else if (m >= 1050 && m <= 1125) {
      // 5:30 PM - 6:45 PM (Evening peak rush)
      crowdLevel = "Very Full";
      crowdColor = "red";
      expectedBusCrowd = "Peak evening rush";
      seatPossibility = "Seat unlikely";
      seatAvailability = "Seats full";
      standingRoom = "Standing room only";
      chartHeight = 94;
    } else if (m === 1140) {
      // 7:00 PM
      crowdLevel = "Busy";
      crowdColor = "red";
      expectedBusCrowd = "High commuter flow";
      seatPossibility = "Low possibility";
      seatAvailability = "Seats unlikely / full";
      standingRoom = "Tight standing room";
      chartHeight = 80;
    } else if (m >= 1155 && m <= 1200) {
      // 7:15 PM - 8:00 PM
      crowdLevel = "Moderate";
      crowdColor = "yellow";
      expectedBusCrowd = "Moderate commuter flow";
      seatPossibility = "Moderate possibility";
      seatAvailability = "Limited seating available";
      standingRoom = "Standing room available";
      chartHeight = 58;
    }

    slots.push({
      id: `slot-${idx}`,
      time,
      shortLabel,
      crowdLevel,
      crowdColor,
      expectedBusCrowd,
      seatPossibility,
      seatAvailability,
      standingRoom,
      chartHeight,
      durationMinutes,
    });
  }

  return slots;
}

export default function CitizenApp() {
  const [page, setPage] = useState<CitizenPage>("home");
  const [obstacles, setObstacles] = useState<ObstacleReport[]>(MOCK_OBSTACLES);
  const [vehicleAttributes, setVehicleAttributes] = useState<Record<string, VehicleAttributes>>({});

  const trafficRoutes = useTrafficAwareRoutes(CYBERJAYA_ROUTES);
  const routeDurationsSeconds = useMemo(
    () => Object.fromEntries(Object.entries(trafficRoutes).map(([id, r]) => [id, r.durationSeconds])),
    [trafficRoutes],
  );
  const { vehicles: simulatedVehicles, reportVehicleIssue } = useSimulatedFleet(1200, routeDurationsSeconds);
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
  const [needsAssistance, setNeedsAssistance] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("slot-0");
  const [tripConfirmed, setTripConfirmed] = useState<{
    seconds: number;
    fromStopId: string;
    toStopId: string;
    time?: string;
    needsAssistance?: boolean;
  } | null>(null);
  const [showNeedsStep, setShowNeedsStep] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);

  const { seconds: estimatedTripSec } = useMemo(
    () => estimateTripSeconds(fromStopId, toStopId, routeDurationsSeconds),
    [fromStopId, toStopId, routeDurationsSeconds],
  );

  const journeySlots = useMemo(
    () => generateJourneySlots(estimatedTripSec),
    [estimatedTripSec],
  );

  const activeSlot = useMemo(
    () => journeySlots.find((s) => s.id === selectedSlotId) ?? journeySlots[0],
    [journeySlots, selectedSlotId],
  );

  useEffect(() => {
    setTripNeeds(new Set(profileNeeds));
  }, [profileNeeds]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsubObstacles = subscribeToObstacles(setObstacles);
    const unsubVehicles = subscribeToVehicleAttributes(setVehicleAttributes);
    return () => {
      unsubObstacles?.();
      unsubVehicles?.();
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
  const selectedBus = busSheetId && busSheetId !== "__help__" ? vehicles.find((v) => v.vehicle_id === busSheetId) : null;

  const confirmTripPlan = async () => {
    const { seconds } = estimateTripSeconds(fromStopId, toStopId, routeDurationsSeconds);
    try {
      await submitTripRequest(fromStopId, toStopId, Array.from(tripNeeds), seconds || null);
    } catch (error) {
      console.error("[MonFate] Failed to submit trip request:", error);
    }
    setTripConfirmed({
      seconds,
      fromStopId,
      toStopId,
      time: activeSlot?.time,
      needsAssistance,
    });
    setShowNeedsStep(false);
    setPlanModalOpen(false);
  };

  const activeObstacles = obstacles.filter((o) => o.status === "active");
  const rampFaultBuses = vehicles.filter((v) => v.ramp_status === "fault");

  const pageTitle: Record<CitizenPage, string> = {
    home: "Live Cyberjaya Transit",
    nearby: "Nearby Bus Stops",
    plan: "Crowd & Forecast",
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
      <BackgroundTransitDecor />
      <div className="app-shell" style={{ position: "relative", zIndex: 1 }}>
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
                {/* 1. COMPACT PLAN A TRIP SEARCH BAR AT TOP */}
                <div
                  className="compact-journey-search-bar"
                  onClick={() => setPlanModalOpen(true)}
                  role="button"
                  tabIndex={0}
                  aria-label="Open Plan a Trip"
                >
                  <div className="search-bar-left">
                    <div className="search-bar-icon-wrap">
                      <RouteIcon size={18} />
                    </div>
                    <div className="search-bar-text">
                      <span className="search-bar-title">Plan a Trip</span>
                      <span className="search-bar-subtitle">
                        {ALL_STOPS.find((s) => s.id === fromStopId)?.name} → {ALL_STOPS.find((s) => s.id === toStopId)?.name} · Tap to choose departure times, crowd &amp; seating
                      </span>
                    </div>
                  </div>
                  <div className="search-bar-right">
                    <span className="search-action-chip">
                      <Clock size={14} /> Plan Journey →
                    </span>
                  </div>
                </div>

                {/* CONFIRMED ESTIMATED TRIP CARD (if journey confirmed) */}
                {tripConfirmed && (
                  <div className="dashboard-card active-journey-panel" style={{ marginBottom: 16 }}>
                    <div className="active-journey-content">
                      <div className="active-journey-badge"><RouteIcon size={22} /></div>
                      <div className="active-journey-info">
                        <div className="card-eyebrow">ESTIMATED TRIP</div>
                        <h3>
                          {ALL_STOPS.find((s) => s.id === tripConfirmed.fromStopId)?.name} →{" "}
                          {ALL_STOPS.find((s) => s.id === tripConfirmed.toStopId)?.name}
                        </h3>
                        <div className="active-journey-meta">
                          <span>⏱ <strong>{Math.max(1, Math.round(tripConfirmed.seconds / 60))} min</strong> estimated</span>
                          {tripConfirmed.time && <span>🕒 <strong>{tripConfirmed.time}</strong> departure</span>}
                          {Array.from(tripNeeds).map((n) => (
                            <span key={n} className="kpi-badge kpi-good" style={{ padding: "2px 8px" }}>
                              ✓ {NEED_LABELS[n]}
                            </span>
                          ))}
                          {tripConfirmed.needsAssistance && (
                            <span className="kpi-badge kpi-info" style={{ padding: "2px 8px", background: "#dbeafe", color: "#1d4ed8" }}>
                              ✓ Boarding Assistance Requested
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. LARGE MAP TAKING UP MOST OF THE DASHBOARD */}
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
                            incidents={{}}
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

                {/* 3. THREE MAIN KPI BOXES / CARDS (Placed below map so map covers most of screen) */}
                <section className="kpi-grid kpi-grid-3" aria-label="Network overview" style={{ marginTop: 20 }}>
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
                <div className="dashboard-card side-panel-card" style={{ marginBottom: 16 }}>
                  <div className="side-card-header">
                    <div className="card-eyebrow">PREDICTIVE CROWD &amp; OCCUPANCY</div>
                    <h3>Cyberjaya Bus Corridor Forecast</h3>
                    <p className="small muted">
                      Select origin and destination to view predicted crowd levels, seat availability, and standing room:
                    </p>
                  </div>
                  <div className="side-planner-form">
                    <div className="planner-field">
                      <label>FROM</label>
                      <select
                        className="text-input"
                        value={fromStopId}
                        onChange={(e) => setFromStopId(e.target.value)}
                      >
                        {ALL_STOPS.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="planner-field">
                      <label>TO</label>
                      <select
                        className="text-input"
                        value={toStopId}
                        onChange={(e) => setToStopId(e.target.value)}
                      >
                        {ALL_STOPS.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Dynamic Histogram Bars & Visual Indicators */}
                <section className="dashboard-card" style={{ marginBottom: 16 }}>
                  <div className="section-title-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div className="card-eyebrow">BUS OCCUPANCY TIMELINE</div>
                      <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0 }}>
                        Predicted Crowd &amp; Seat Availability · {ALL_STOPS.find((s) => s.id === fromStopId)?.name} → {ALL_STOPS.find((s) => s.id === toStopId)?.name}
                      </h2>
                    </div>

                    <div className="legend" style={{ display: "flex", gap: 12, fontSize: "0.8rem", flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
                        Low (Seat Likely)
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
                        Medium (Standing Possible)
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
                        High (Seat Unlikely)
                      </span>
                    </div>
                  </div>

                  {/* Visual bars */}
                  <div className="forecast-bars desktop-chart-bars" aria-label="Crowd forecast chart">
                    {journeySlots.map((slot) => {
                      const isSelected = selectedSlotId === slot.id;
                      return (
                        <button
                          key={slot.id}
                          className={isSelected ? "bar-selected" : ""}
                          onClick={() => setSelectedSlotId(slot.id)}
                          title={`${slot.time}: Crowd ${slot.crowdLevel}, ${slot.seatAvailability}`}
                          aria-pressed={isSelected}
                        >
                          <span
                            className={`forecast-bar ${
                              slot.crowdColor === "green"
                                ? "level-low"
                                : slot.crowdColor === "yellow"
                                ? "level-medium"
                                : "level-very-high"
                            }`}
                            style={{ height: `${slot.chartHeight}%` }}
                          />
                          <small style={{ fontWeight: isSelected ? 800 : 500 }}>{slot.shortLabel}</small>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* 2-COLUMN SPLIT GRID FOR TIME SELECTION & TELEMETRY */}
                <div className="plan-details-grid">
                  <div className="dashboard-card">
                    <div className="card-eyebrow">FAST TIME SELECTION</div>
                    <h3>15-Minute Departure Intervals</h3>
                    <p className="small muted">
                      Select an interval to inspect expected corridor congestion and seating (6:00 AM – 11:30 PM):
                    </p>
                    <div
                      className="fast-time-selection-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                        gap: 10,
                        marginTop: 12,
                      }}
                    >
                      {journeySlots.map((slot) => {
                        const isSelected = selectedSlotId === slot.id;
                        return (
                          <button
                            key={slot.id}
                            className={`stop-option ${isSelected ? "selected-stop-card" : ""}`}
                            onClick={() => setSelectedSlotId(slot.id)}
                            style={{
                              borderLeft: isSelected ? "4px solid var(--brand-blue)" : "4px solid transparent",
                              background: isSelected ? "#f0f7ff" : undefined,
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              textAlign: "left",
                              padding: "10px 12px",
                              width: "100%",
                            }}
                          >
                            <span className="stop-icon"><Clock size={20} /></span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <strong style={{ display: "block", fontSize: "0.88rem" }}>{slot.time} Departure</strong>
                              <small style={{ display: "block", color: "var(--muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                {slot.seatAvailability} · {slot.expectedBusCrowd}
                              </small>
                            </span>
                            <span className={`status-indicator-badge tone-${slot.crowdColor}`}>
                              ● {slot.crowdLevel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="dashboard-card" style={{ position: "sticky", top: 20, alignSelf: "start" }}>
                    <div className="section-title-row">
                      <div>
                        <div className="card-eyebrow">INTERVAL CROWD &amp; SEATING TELEMETRY</div>
                        <h3 style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
                          <Bus size={20} className="text-primary" />
                          <span>{activeSlot.time} Departure</span>
                        </h3>
                      </div>
                      <span className={`status-indicator-badge tone-${activeSlot.crowdColor}`}>
                        ● {activeSlot.crowdLevel} Crowd
                      </span>
                    </div>

                    <div className="visual-occupancy-bar" style={{ height: 8, margin: "14px 0 10px" }}>
                      <div className={`visual-occupancy-fill fill-${activeSlot.crowdColor}`} />
                    </div>

                    <div className="info-grid boxed" style={{ marginTop: 12 }}>
                      <span>Crowd level</span>
                      <strong className={`tone-${activeSlot.crowdColor}-text`}>● {activeSlot.crowdLevel}</strong>

                      <span>Expected crowd</span>
                      <strong>{activeSlot.expectedBusCrowd}</strong>

                      <span>Possibility of getting a seat</span>
                      <strong className={`tone-${activeSlot.crowdColor}-text`}>{activeSlot.seatPossibility}</strong>

                      <span>Seat availability</span>
                      <strong className={`tone-${activeSlot.crowdColor}-text`}>{activeSlot.seatAvailability}</strong>

                      <span>Standing room likelihood</span>
                      <strong>{activeSlot.standingRoom}</strong>

                      <span>Corridor trip duration</span>
                      <strong style={{ color: "var(--brand-blue)", fontSize: "1.05rem" }}>
                        {activeSlot.durationMinutes} min
                      </strong>

                      <span>Wheelchair &amp; ramp readiness</span>
                      <strong style={{ color: "#059669" }}>✓ Operational</strong>
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
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        className="map-nearby-btn"
        style={{ position: "fixed", right: 24, bottom: 90, zIndex: 40 }}
        onClick={() => setBusSheetId("__help__")}
        aria-label="Help"
      >
        <MessageCircle size={18} /> Help
      </button>

      {busSheetId === "__help__" && (
        <BottomSheet title="Chat with support" onClose={() => setBusSheetId(null)}>
          <p className="sheet-intro">
            This is a placeholder for the real chatbot — wire your teammate&apos;s bot into this panel when it&apos;s ready.
          </p>
          <div className="stack-list" style={{ marginBottom: 16 }}>
            <div className="stop-option" style={{ cursor: "default" }}>
              <span>
                <strong>MonFate Assistant</strong>
                <small>Hi! How can I help with your trip today?</small>
              </span>
            </div>
          </div>
          <input className="text-input" placeholder="Type a message… (not yet connected)" disabled />
        </BottomSheet>
      )}

      {selectedStop && (
        <BottomSheet title={selectedStop.name} onClose={() => setStopSheetId(null)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p className="sheet-intro" style={{ margin: 0 }}>Buses Serving This Transit Stop:</p>
            <span className="status-indicator-badge tone-green">● Verified Stop</span>
          </div>
          <div className="stack-list" style={{ gap: 10 }}>
            {busesForStop(selectedStop.id).map((bus) => {
              const etaMin = Math.round(bus.eta_seconds / 60);
              const isNow = bus.eta_seconds <= 0;
              const capacityTone =
                bus.capacity_status === "seats_available" || bus.capacity_status === "empty"
                  ? "green"
                  : bus.capacity_status === "standing_room"
                  ? "yellow"
                  : "red";
              const capacityLabel =
                bus.capacity_status === "seats_available"
                  ? "Seats Available"
                  : bus.capacity_status === "standing_room"
                  ? "Standing Room / Limited Seats"
                  : bus.capacity_status === "full"
                  ? "No Seats Available / Very Crowded"
                  : "Seats Available";

              return (
                <button
                  key={bus.vehicle_id}
                  className="nearby-bus-enhanced-card"
                  onClick={() => {
                    setStopSheetId(null);
                    setBusSheetId(bus.vehicle_id);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div className="stop-icon" style={{ background: "var(--light-blue)", color: "var(--brand-blue)" }}>
                      <Bus size={22} />
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: "0.98rem", color: "var(--ink-heading)" }}>{bus.vehicle_id}</strong>
                        <span className="card-eyebrow" style={{ fontSize: "0.72rem", margin: 0 }}>
                          {getRoute(bus.route_id)?.name ?? bus.route_id}
                        </span>
                      </div>

                      {/* Status Badges with GREEN / YELLOW / RED status colours */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        <span className={`status-indicator-badge tone-${capacityTone}`}>
                          ● {capacityLabel}
                        </span>
                        <span className={`status-indicator-badge ${bus.ramp_status === "fault" ? "tone-red" : "tone-green"}`}>
                          {bus.ramp_status === "fault" ? "✕ Ramp Fault" : "✓ Ramp Working"}
                        </span>
                        {bus.wheelchair_space_available && (
                          <span className="status-indicator-badge tone-green">
                            ♿ Space Available
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <span className={`bus-badge-eta ${isNow ? "arriving-now" : ""}`}>
                      {isNow ? "Arriving now" : `${etaMin} min away`}
                    </span>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>
                      Tap for details →
                    </div>
                  </div>
                </button>
              );
            })}
            {busesForStop(selectedStop.id).length === 0 && (
              <p className="small muted">No buses currently serve this stop.</p>
            )}
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
            <span>Ramp Status</span>
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
            <span>Crowd &amp; Seating</span>
            <strong
              style={{
                color:
                  selectedBus.capacity_status === "seats_available" || selectedBus.capacity_status === "empty"
                    ? "#059669"
                    : selectedBus.capacity_status === "standing_room"
                    ? "#b54708"
                    : "#dc2626",
                textTransform: "capitalize",
              }}
            >
              ● {selectedBus.capacity_status.replace("_", " ")}
            </strong>
          </div>
        </BottomSheet>
      )}

      {planModalOpen && (
        <BottomSheet title="Plan Accessible Trip" onClose={() => setPlanModalOpen(false)} wide>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* From and To stop selectors */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="planner-field">
                <label style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" }}>
                  FROM
                </label>
                <select
                  className="text-input"
                  value={fromStopId}
                  onChange={(e) => setFromStopId(e.target.value)}
                >
                  {ALL_STOPS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="planner-field">
                <label style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" }}>
                  TO
                </label>
                <select
                  className="text-input"
                  value={toStopId}
                  onChange={(e) => setToStopId(e.target.value)}
                >
                  {ALL_STOPS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Trip time recommendations in 15-minute intervals (scrollable horizontally) */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong style={{ fontSize: "0.92rem", color: "var(--ink-heading)" }}>
                  Trip Time Recommendations
                </strong>
                <span className="small muted">Scroll horizontally (6:00 AM – 11:30 PM) →</span>
              </div>
              <div
                className="plan-slots-horizontal-scroll"
                style={{
                  display: "flex",
                  gap: 8,
                  overflowX: "auto",
                  padding: "4px 2px 12px",
                  scrollbarWidth: "thin",
                }}
              >
                {journeySlots.map((slot) => {
                  const isSelected = selectedSlotId === slot.id;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className={`stop-option ${isSelected ? "selected-stop-card" : ""}`}
                      onClick={() => setSelectedSlotId(slot.id)}
                      style={{
                        flex: "0 0 152px",
                        minWidth: 152,
                        padding: "10px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 4,
                        border: isSelected ? "2px solid var(--brand-blue)" : "1px solid var(--line)",
                        background: isSelected ? "#eff6ff" : "#ffffff",
                        borderRadius: 12,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                        <strong style={{ fontSize: "0.88rem", color: isSelected ? "var(--brand-blue)" : "var(--ink-heading)" }}>
                          {slot.time}
                        </strong>
                        <span className={`status-indicator-badge tone-${slot.crowdColor}`} style={{ fontSize: "0.68rem", padding: "1px 6px" }}>
                          ● {slot.crowdLevel}
                        </span>
                      </div>
                      <small style={{ color: "var(--muted)", fontSize: "0.74rem" }}>
                        {slot.seatAvailability}
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Interval Telemetry: Crowd levels, Seat availability, Standing room & Visual Occupancy Bar */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--line-light)", borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Bus size={18} style={{ color: "var(--brand-blue)" }} />
                  <strong style={{ fontSize: "0.9rem", color: "var(--ink-heading)" }}>
                    {activeSlot.time} Departure Telemetry
                  </strong>
                </div>
                <span className={`status-indicator-badge tone-${activeSlot.crowdColor}`}>
                  ● {activeSlot.crowdLevel} Crowd
                </span>
              </div>

              {/* Visual Occupancy Bar (green/yellow/red) */}
              <div className="visual-occupancy-bar" style={{ height: 8, margin: "10px 0 8px" }}>
                <div className={`visual-occupancy-fill fill-${activeSlot.crowdColor}`} />
              </div>

              <div className="info-grid boxed" style={{ gridTemplateColumns: "1.2fr 1fr", gap: "6px 12px", marginTop: 8, fontSize: "0.82rem" }}>
                <span>Crowd level</span>
                <strong className={`tone-${activeSlot.crowdColor}-text`}>● {activeSlot.crowdLevel} ({activeSlot.expectedBusCrowd})</strong>

                <span>Seat availability</span>
                <strong className={`tone-${activeSlot.crowdColor}-text`}>{activeSlot.seatAvailability}</strong>

                <span>Standing room</span>
                <strong>{activeSlot.standingRoom}</strong>

                <span>Corridor trip duration</span>
                <strong style={{ color: "var(--brand-blue)" }}>{activeSlot.durationMinutes} min</strong>

                <span>Wheelchair &amp; ramp readiness</span>
                <strong style={{ color: "#059669" }}>✓ Operational</strong>
              </div>
            </div>

            {/* Accessibility needs checkboxes */}
            <div>
              <strong style={{ fontSize: "0.92rem", color: "var(--ink-heading)", display: "block", marginBottom: 8 }}>
                Accessibility Needs
              </strong>
              <div className="checkbox-list" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
                {(Object.keys(NEED_LABELS) as NeedType[]).map((need) => (
                  <label key={need} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.86rem", cursor: "pointer" }}>
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
            </div>

            {/* Checkbox asking: "Do you need assistance for this trip?" */}
            <div style={{ paddingTop: 12, borderTop: "1px solid var(--line-light)" }}>
              <strong style={{ fontSize: "0.92rem", color: "var(--ink-heading)", display: "block", marginBottom: 8 }}>
                Do you need assistance for this trip?
              </strong>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.88rem" }}>
                <input
                  type="checkbox"
                  checked={needsAssistance}
                  onChange={(e) => setNeedsAssistance(e.target.checked)}
                />
                <span>Yes, request driver / station marshal boarding assistance</span>
              </label>
            </div>

            {/* Confirm Journey button */}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                type="button"
                className="primary-button large"
                style={{ flex: 1 }}
                onClick={confirmTripPlan}
                disabled={fromStopId === toStopId}
              >
                {fromStopId === toStopId ? "Select Different Stops" : "Confirm Journey"}
              </button>
              <button
                type="button"
                className="text-button"
                style={{ padding: "0 16px" }}
                onClick={() => setPlanModalOpen(false)}
              >
                Cancel
              </button>
            </div>
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
            <strong style={{ fontSize: "0.92rem", color: "var(--ink-heading)", display: "block", marginBottom: 8 }}>
              Do you need assistance for this trip?
            </strong>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.92rem" }}>
              <input
                type="checkbox"
                checked={needsAssistance}
                onChange={(e) => setNeedsAssistance(e.target.checked)}
              />
              <span>Yes, request driver / station marshal boarding assistance</span>
            </label>
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
