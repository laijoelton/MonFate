"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type {
  AccessibilityFeature,
  Coordinates,
  ObstacleReport,
  ObstacleType,
} from "@/types/monfate";
import {
  ACCESSIBILITY_FEATURE_LABELS,
  OBSTACLE_TYPE_LABELS,
} from "@/types/monfate";
import { ALL_STOPS } from "@/lib/cyberjaya-routes";
import { TrustBadge } from "@/components/TrustBadge";

export interface ObstacleDraft {
  obstacle_type: ObstacleType;
  description: string;
  affects: AccessibilityFeature[];
  location: Coordinates;
}

interface ObstacleReportModalProps {
  onClose: () => void;
  /** The obstacle to show trust signals for, if the modal was opened from a map marker. */
  selectedObstacle: ObstacleReport | null;
  nowIso: string;
  onSubmitReport: (draft: ObstacleDraft) => void;
}

const OBSTACLE_TYPES = Object.keys(OBSTACLE_TYPE_LABELS) as ObstacleType[];
const ALL_FEATURES = Object.keys(
  ACCESSIBILITY_FEATURE_LABELS,
) as AccessibilityFeature[];

export function ObstacleReportModal({
  onClose,
  selectedObstacle,
  nowIso,
  onSubmitReport,
}: ObstacleReportModalProps) {
  const [mode, setMode] = useState<"view" | "report">(
    selectedObstacle ? "view" : "report",
  );
  const [obstacleType, setObstacleType] = useState<ObstacleType>("blocked_ramp");
  const [description, setDescription] = useState("");
  const [affects, setAffects] = useState<Set<AccessibilityFeature>>(new Set());
  const [locationStopId, setLocationStopId] = useState(ALL_STOPS[0]?.id ?? "");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const toggleFeature = (feature: AccessibilityFeature) => {
    setAffects((prev) => {
      const next = new Set(prev);
      if (next.has(feature)) next.delete(feature);
      else next.add(feature);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const stop = ALL_STOPS.find((s) => s.id === locationStopId);
    onSubmitReport({
      obstacle_type: obstacleType,
      description,
      affects: Array.from(affects),
      location: stop?.location ?? ALL_STOPS[0].location,
    });
    setDescription("");
    setAffects(new Set());
    onClose();
  };

  const showView = mode === "view" && selectedObstacle;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="obstacle-modal-title"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2
            id="obstacle-modal-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            {showView ? "Obstacle Report" : "Report an Obstacle"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {showView ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {OBSTACLE_TYPE_LABELS[selectedObstacle.obstacle_type]}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {selectedObstacle.description}
              </p>
            </div>

            <TrustBadge
              trustScore={selectedObstacle.trust_score}
              lastVerifiedAt={selectedObstacle.last_verified_at}
              nowIso={nowIso}
            />

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Corroborated by {selectedObstacle.verification_count}{" "}
              {selectedObstacle.verification_count === 1 ? "signal" : "signals"}
              {" • "}status: {selectedObstacle.status}
            </p>

            <div className="flex flex-wrap gap-1.5">
              {selectedObstacle.affects.map((feature) => (
                <span
                  key={feature}
                  className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {ACCESSIBILITY_FEATURE_LABELS[feature]}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setMode("report")}
              className="w-full rounded-lg border border-emerald-600 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            >
              Report a different obstacle
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="obstacle-location"
                className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Location
              </label>
              <select
                id="obstacle-location"
                value={locationStopId}
                onChange={(e) => setLocationStopId(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {ALL_STOPS.map((stop) => (
                  <option key={stop.id} value={stop.id}>
                    {stop.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="obstacle-type"
                className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Obstacle type
              </label>
              <select
                id="obstacle-type"
                value={obstacleType}
                onChange={(e) => setObstacleType(e.target.value as ObstacleType)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {OBSTACLE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {OBSTACLE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="obstacle-description"
                className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Description
              </label>
              <textarea
                id="obstacle-description"
                required
                maxLength={500}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What did you encounter, and where?"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <fieldset>
              <legend className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Affects
              </legend>
              <div className="flex flex-wrap gap-2">
                {ALL_FEATURES.map((feature) => (
                  <label
                    key={feature}
                    className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50 has-[:checked]:text-emerald-800 dark:border-zinc-700 dark:text-zinc-300 dark:has-[:checked]:bg-emerald-900/20"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={affects.has(feature)}
                      onChange={() => toggleFeature(feature)}
                    />
                    {ACCESSIBILITY_FEATURE_LABELS[feature]}
                  </label>
                ))}
              </div>
            </fieldset>

            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              Submit report
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
