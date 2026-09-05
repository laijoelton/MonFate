"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPinPlus } from "lucide-react";
import { AccessibilityFilterBar } from "@/components/AccessibilityFilterBar";
import { CctvEdgeDock } from "@/components/CctvEdgeDock";
import { DispatchAlertBanner } from "@/components/DispatchAlertBanner";
import { MapHud } from "@/components/MapHud";
import {
  ObstacleReportModal,
  type ObstacleDraft,
} from "@/components/ObstacleReportModal";
import { TelemetryStrip } from "@/components/TelemetryStrip";
import { TransitTrackerCard } from "@/components/TransitTrackerCard";
import { Card } from "@/components/ui/Card";
import { postObstacle } from "@/lib/api";
import { useCockpit } from "@/lib/useCockpit";
import { ACCESSIBILITY_FILTERS } from "@/lib/mock-data";
import type { AccessibilityFeature, ObstacleReport } from "@/types/monfate";

/** Fallback report location when the browser gives us no geolocation fix. */
const FALLBACK_LOCATION = { lat: 2.9095, lng: 101.6625 }; // Tamarind Square

export default function Cockpit() {
  const cockpit = useCockpit();
  const [activeFilters, setActiveFilters] = useState<Set<AccessibilityFeature>>(new Set());
  const [selectedObstacle, setSelectedObstacle] = useState<ObstacleReport | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Relative timestamps are rendered against a clock that ticks, but the first
  // paint must match the server's, so it starts null and fills in after mount.
  const [nowIso, setNowIso] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNowIso(new Date().toISOString());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  const toggleFilter = (feature: AccessibilityFeature) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(feature)) next.delete(feature);
      else next.add(feature);
      return next;
    });
  };

  const openReportForm = () => {
    setSelectedObstacle(null);
    setSubmitError(null);
    setModalOpen(true);
  };

  const handleSubmitReport = async (draft: ObstacleDraft) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { obstacle } = await postObstacle({
        obstacle_type: draft.obstacle_type,
        location: FALLBACK_LOCATION,
        description: draft.description,
        affects: draft.affects,
      });
      cockpit.pushObstacle(obstacle);
      setModalOpen(false);
    } catch {
      setSubmitError("Could not reach the backend. Your report was not saved.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderNow = nowIso ?? new Date(0).toISOString();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-800/60 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-50">MonFate</h1>
            <p className="text-sm text-slate-400">
              Accessible transit cockpit &mdash; SDG 11
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/admin"
              className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-accent/50 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Operator dashboard
            </Link>
            <button
              type="button"
              onClick={openReportForm}
              className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-slate-950 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <MapPinPlus aria-hidden className="h-4 w-4" />
              Report Obstacle
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-6 py-5">
        <TelemetryStrip
          conn={cockpit.conn}
          pingMs={cockpit.pingMs}
          vehicles={cockpit.vehicleList}
          obstacles={cockpit.obstacleList}
        />

        <DispatchAlertBanner alerts={cockpit.alerts} onDismiss={cockpit.dismissAlert} />

        <AccessibilityFilterBar
          features={ACCESSIBILITY_FILTERS}
          active={activeFilters}
          onToggle={toggleFilter}
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
          <div className="h-[420px] lg:h-[560px]">
            <MapHud
              obstacles={cockpit.obstacleList}
              vehicles={cockpit.vehicleList}
              stops={cockpit.stops}
              activeFilters={activeFilters}
              selectedObstacleId={selectedObstacle?.id ?? null}
              onSelectObstacle={(o) => {
                setSelectedObstacle(o);
                setModalOpen(true);
              }}
            />
          </div>

          <div className="space-y-4">
            <CctvEdgeDock
              events={cockpit.events}
              conn={cockpit.conn}
              inferP50={cockpit.inferP50}
              nowIso={renderNow}
            />

            <Card title="Approaching vehicles">
              {cockpit.vehicleList.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-700/60 px-3 py-6 text-center text-xs text-slate-500">
                  No vehicles reporting. Start the backend to see live telemetry.
                </p>
              ) : (
                <div className="space-y-3">
                  {[...cockpit.vehicleList]
                    .sort((a, b) => a.eta_seconds - b.eta_seconds)
                    .map((vehicle) => (
                      <TransitTrackerCard key={vehicle.vehicle_id} vehicle={vehicle} />
                    ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>

      {modalOpen && (
        <ObstacleReportModal
          onClose={() => setModalOpen(false)}
          selectedObstacle={selectedObstacle}
          nowIso={renderNow}
          onSubmitReport={handleSubmitReport}
          submitting={submitting}
          error={submitError}
        />
      )}
    </div>
  );
}
