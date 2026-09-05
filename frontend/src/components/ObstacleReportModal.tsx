"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type {
  AccessibilityFeature,
  ObstacleReport,
  ObstacleType,
} from "@/types/monfate";
import {
  ACCESSIBILITY_FEATURE_LABELS,
  OBSTACLE_TYPE_LABELS,
} from "@/types/monfate";
import { TrustBadge } from "@/components/TrustBadge";

export interface ObstacleDraft {
  obstacle_type: ObstacleType;
  description: string;
  affects: AccessibilityFeature[];
}

interface ObstacleReportModalProps {
  onClose: () => void;
  /** The obstacle to show trust signals for, if opened from a map marker. */
  selectedObstacle: ObstacleReport | null;
  nowIso: string;
  onSubmitReport: (draft: ObstacleDraft) => void;
  submitting?: boolean;
  error?: string | null;
}

const OBSTACLE_TYPES = Object.keys(OBSTACLE_TYPE_LABELS) as ObstacleType[];
const ALL_FEATURES = Object.keys(ACCESSIBILITY_FEATURE_LABELS) as AccessibilityFeature[];

const FIELD =
  "w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export function ObstacleReportModal({
  onClose,
  selectedObstacle,
  nowIso,
  onSubmitReport,
  submitting = false,
  error = null,
}: ObstacleReportModalProps) {
  const [mode, setMode] = useState<"view" | "report">(selectedObstacle ? "view" : "report");
  const [obstacleType, setObstacleType] = useState<ObstacleType>("blocked_ramp");
  const [description, setDescription] = useState("");
  const [affects, setAffects] = useState<Set<AccessibilityFeature>>(new Set());

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
    onSubmitReport({
      obstacle_type: obstacleType,
      description,
      affects: Array.from(affects),
    });
  };

  const showView = mode === "view" && selectedObstacle;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="obstacle-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 id="obstacle-modal-title" className="text-lg font-semibold text-slate-100">
            {showView ? "Obstacle Report" : "Report an Obstacle"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {showView ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-100">
                {OBSTACLE_TYPE_LABELS[selectedObstacle.obstacle_type]}
              </p>
              <p className="mt-1 text-sm text-slate-400">{selectedObstacle.description}</p>
            </div>

            <TrustBadge
              trustScore={selectedObstacle.trust_score}
              lastVerifiedAt={selectedObstacle.last_verified_at}
              nowIso={nowIso}
            />

            <p className="text-xs text-slate-500">
              Corroborated by {selectedObstacle.verification_count}{" "}
              {selectedObstacle.verification_count === 1 ? "signal" : "signals"}
              {" • "}status: {selectedObstacle.status}
            </p>

            <div className="flex flex-wrap gap-1.5">
              {selectedObstacle.affects.map((feature) => (
                <span
                  key={feature}
                  className="rounded-full bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300"
                >
                  {ACCESSIBILITY_FEATURE_LABELS[feature]}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setMode("report")}
              className="w-full rounded-lg border border-accent/60 py-2 text-sm font-medium text-accent hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Report a different obstacle
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="obstacle-type" className="mb-1 block text-sm font-medium text-slate-300">
                Obstacle type
              </label>
              <select
                id="obstacle-type"
                value={obstacleType}
                onChange={(e) => setObstacleType(e.target.value as ObstacleType)}
                className={FIELD}
              >
                {OBSTACLE_TYPES.map((type) => (
                  <option key={type} value={type} className="bg-slate-800">
                    {OBSTACLE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="obstacle-description"
                className="mb-1 block text-sm font-medium text-slate-300"
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
                className={FIELD}
              />
            </div>

            <fieldset>
              <legend className="mb-1 block text-sm font-medium text-slate-300">Affects</legend>
              <div className="flex flex-wrap gap-2">
                {ALL_FEATURES.map((feature) => (
                  <label
                    key={feature}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 has-[:checked]:border-accent has-[:checked]:bg-accent/15 has-[:checked]:text-accent"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                      checked={affects.has(feature)}
                      onChange={() => toggleFeature(feature)}
                    />
                    {ACCESSIBILITY_FEATURE_LABELS[feature]}
                  </label>
                ))}
              </div>
            </fieldset>

            {error && (
              <p role="alert" className="rounded-lg bg-down/15 px-3 py-2 text-xs text-down">
                {error}
              </p>
            )}

            <button
              type="submit"
              data-voice-manual
              disabled={submitting}
              className="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-slate-950 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit report"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
