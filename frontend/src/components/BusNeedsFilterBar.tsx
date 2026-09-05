"use client";

import { Accessibility, Armchair, DoorOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BusNeed } from "@/types/monfate";
import { BUS_NEED_LABELS } from "@/types/monfate";

const NEED_ICONS: Record<BusNeed, LucideIcon> = {
  ramp: DoorOpen,
  wheelchair_space: Accessibility,
  priority_seat: Armchair,
};

const ALL_NEEDS: BusNeed[] = ["ramp", "wheelchair_space", "priority_seat"];

interface BusNeedsFilterBarProps {
  active: Set<BusNeed>;
  onToggle: (need: BusNeed) => void;
}

export function BusNeedsFilterBar({ active, onToggle }: BusNeedsFilterBarProps) {
  return (
    <div role="group" aria-label="Filter buses by your needs" className="flex flex-wrap gap-2">
      {ALL_NEEDS.map((need) => {
        const Icon = NEED_ICONS[need];
        const isActive = active.has(need);
        return (
          <button
            key={need}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(need)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              isActive
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-emerald-500"
            }`}
          >
            <Icon aria-hidden className="h-3.5 w-3.5" />
            {BUS_NEED_LABELS[need]}
          </button>
        );
      })}
    </div>
  );
}
