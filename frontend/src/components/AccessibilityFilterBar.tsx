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
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              isActive
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-emerald-500"
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
