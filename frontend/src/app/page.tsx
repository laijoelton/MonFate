"use client";

import { useState } from "react";
import { MapPinPlus } from "lucide-react";
import { AccessibilityFilterBar } from "@/components/AccessibilityFilterBar";
import { MapView } from "@/components/MapView";
import {
  ObstacleReportModal,
  type ObstacleDraft,
} from "@/components/ObstacleReportModal";
import { TransitTrackerCard } from "@/components/TransitTrackerCard";
import {
  ACCESSIBILITY_FILTERS,
  MOCK_NOW,
  MOCK_OBSTACLES,
  MOCK_VEHICLES,
} from "@/lib/mock-data";
import type { AccessibilityFeature, ObstacleReport } from "@/types/monfate";

export default function Home() {
  const [obstacles, setObstacles] = useState<ObstacleReport[]>(MOCK_OBSTACLES);
  const [activeFilters, setActiveFilters] = useState<Set<AccessibilityFeature>>(
    new Set(),
  );
  const [selectedObstacle, setSelectedObstacle] = useState<ObstacleReport | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);

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
    setModalOpen(true);
  };

  const handleSubmitReport = (draft: ObstacleDraft) => {
    const newObstacle: ObstacleReport = {
      id: `obs-${Date.now()}`,
      obstacle_type: draft.obstacle_type,
      location: { lat: 50, lng: 50 },
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
        <div className="mx-auto flex max-w-6xl items-center justify-between">
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
            Report Obstacle
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <div className="mb-4">
          <AccessibilityFilterBar
            features={ACCESSIBILITY_FILTERS}
            active={activeFilters}
            onToggle={toggleFilter}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="aspect-square lg:aspect-auto lg:h-[600px]">
            <MapView
              obstacles={obstacles}
              vehicles={MOCK_VEHICLES}
              activeFilters={activeFilters}
              selectedObstacleId={selectedObstacle?.id ?? null}
              onSelectObstacle={openObstacleDetail}
            />
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Approaching vehicles
            </h2>
            {MOCK_VEHICLES.map((vehicle) => (
              <TransitTrackerCard key={vehicle.vehicle_id} vehicle={vehicle} />
            ))}
          </div>
        </div>
      </main>

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
