"use client";

import { Accessibility, Baby, Footprints, MoveVertical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AccessibilityFeature } from "@/types/monfate";
import { ACCESSIBILITY_FEATURE_LABELS } from "@/types/monfate";

const FEATURE_ICONS: Record<AccessibilityFeature, LucideIcon> = {
  wheelchair_ramp: Accessibility,
  tactile_paving: Footprints,
  working_elevator: MoveVertical,
  stroller_friendly: Baby,
};

interface AccessibilityFilterBarProps {
  features: AccessibilityFeature[];
  active: Set<AccessibilityFeature>;
  onToggle: (feature: AccessibilityFeature) => void;
}

/**
 * Rider accessibility profile. Selecting needs filters the map to obstacles
 * that actually block them — an empty selection shows everything rather than
 * nothing, so a first-time rider is never met with a blank map.
 */
export function AccessibilityFilterBar({
  features,
  active,
  onToggle,
}: AccessibilityFilterBarProps) {
  return (
    <div
      role="group"
      aria-label="Filter map by accessibility need"
      className="flex flex-wrap gap-2"
    >
      {features.map((feature) => {
        const Icon = FEATURE_ICONS[feature];
        const isActive = active.has(feature);
        return (
          <button
            key={feature}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(feature)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              isActive
                ? "border-accent bg-accent/20 text-accent"
                : "border-slate-700/70 bg-slate-800/40 text-slate-300 hover:border-accent/50 hover:text-slate-100"
            }`}
          >
            <Icon aria-hidden className="h-4 w-4" />
            {ACCESSIBILITY_FEATURE_LABELS[feature]}
          </button>
        );
      })}
    </div>
  );
}
