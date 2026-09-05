"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { MapPinPlus } from "lucide-react";
import { AccessibilityFilterBar } from "@/components/AccessibilityFilterBar";
import {
  ObstacleReportModal,
  type ObstacleDraft,
} from "@/components/ObstacleReportModal";
import { ReportChoiceModal } from "@/components/ReportChoiceModal";
import { BusReportModal, type BusIssueOption } from "@/components/BusReportModal";
import { TransitTrackerCard } from "@/components/TransitTrackerCard";
import { ACCESSIBILITY_FILTERS, MOCK_NOW, MOCK_OBSTACLES } from "@/lib/mock-data";
import { CYBERJAYA_ROUTES } from "@/lib/cyberjaya-routes";
import { useSimulatedFleet } from "@/lib/fleet-simulation";
import { isFirebaseConfigured } from "@/lib/firebase";
import { addObstacleReport, subscribeToObstacles } from "@/lib/firestore-obstacles";
import type { AccessibilityFeature, ObstacleReport } from "@/types/monfate";

// Leaflet reaches into `window` at import time, so this must never render
// on the server — ssr: false keeps it out of Next.js's server render pass.
const CyberjayaMap = dynamic(
  () => import("@/components/CyberjayaMap").then((mod) => mod.CyberjayaMap),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" /> },
);

export default function Home() {
  const [obstacles, setObstacles] = useState<ObstacleReport[]>(MOCK_OBSTACLES);
  const [activeFilters, setActiveFilters] = useState<Set<AccessibilityFeature>>(
    new Set(),
  );
  const [selectedObstacle, setSelectedObstacle] = useState<ObstacleReport | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | "all">("all");
  const { vehicles, reportVehicleIssue } = useSimulatedFleet();
  const [reportChoiceOpen, setReportChoiceOpen] = useState(false);
  const [busModalOpen, setBusModalOpen] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return; // stay on mock data
    const unsubscribe = subscribeToObstacles(setObstacles);
    return () => unsubscribe?.();
  }, []);

  const toggleFilter = (feature: AccessibilityFeature) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(feature)) next.delete(feature);
      else next.add(feature);
      return next;
    });
  };

  const openObstacleDetail = (obstacle: ObstacleReport) => {
    setSelectedObstacle(obstacle);
    setModalOpen(true);
  };

  const openReportForm = () => {
    setSelectedObstacle(null);
    setReportChoiceOpen(true);
  };

  const chooseObstacleReport = () => {
    setReportChoiceOpen(false);
    setSelectedObstacle(null);
    setModalOpen(true);
  };

  const chooseBusReport = () => {
    setReportChoiceOpen(false);
    setBusModalOpen(true);
  };

  const handleBusIssueSubmit = (vehicleId: string, updates: BusIssueOption["updates"]) => {
    reportVehicleIssue(vehicleId, updates);
  };

  const handleSubmitReport = async (draft: ObstacleDraft) => {
    if (isFirebaseConfigured) {
      try {
        await addObstacleReport(draft, draft.location);
        return; // the onSnapshot subscription above will update `obstacles`
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

  return (
    <div className="flex flex-1 flex-col bg-zinc-100 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              MonFate
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Dynamic, accessible transit &amp; routing
            </p>
          </div>
          <button
            type="button"
            onClick={openReportForm}
            className="flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <MapPinPlus aria-hidden className="h-4 w-4" />
            Report
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        <div className="mb-4">
          <AccessibilityFilterBar
            features={ACCESSIBILITY_FILTERS}
            active={activeFilters}
            onToggle={toggleFilter}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[180px_2fr_1fr]">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Routes
            </h2>
            <button
              type="button"
              onClick={() => setSelectedRouteId("all")}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                selectedRouteId === "all"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              All routes
            </button>
            {CYBERJAYA_ROUTES.map((route) => (
              <button
                key={route.route_id}
                type="button"
                onClick={() => setSelectedRouteId(route.route_id)}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                  selectedRouteId === route.route_id
                    ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800"
                    : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <span
                  className="h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: route.color }}
                  aria-hidden
                />
                <span className="text-zinc-700 dark:text-zinc-300">
                  {route.route_id} · {route.name}
                </span>
              </button>
            ))}
          </div>

          <div className="relative z-0 isolate aspect-square lg:aspect-auto lg:h-[600px]">
            <CyberjayaMap
              vehicles={vehicles}
              obstacles={obstacles}
              activeFilters={activeFilters}
              selectedRouteId={selectedRouteId}
              selectedObstacleId={selectedObstacle?.id ?? null}
              onSelectObstacle={openObstacleDetail}
            />
          </div>

          <div className="space-y-4 lg:h-[600px] lg:overflow-y-auto">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Approaching vehicles
            </h2>
            {vehicles
              .filter((v) => selectedRouteId === "all" || v.route_id === selectedRouteId)
              .map((vehicle) => (
                <TransitTrackerCard key={vehicle.vehicle_id} vehicle={vehicle} />
              ))}
          </div>
        </div>
      </main>

      {reportChoiceOpen && (
        <ReportChoiceModal
          onClose={() => setReportChoiceOpen(false)}
          onChooseBus={chooseBusReport}
          onChooseObstacle={chooseObstacleReport}
        />
      )}

      {busModalOpen && (
        <BusReportModal
          vehicles={vehicles}
          onClose={() => setBusModalOpen(false)}
          onSubmit={handleBusIssueSubmit}
        />
      )}

      {modalOpen && (
        <ObstacleReportModal
          onClose={() => setModalOpen(false)}
          selectedObstacle={selectedObstacle}
          nowIso={MOCK_NOW}
          onSubmitReport={handleSubmitReport}
        />
      )}
    </div>
  );
}
