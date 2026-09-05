"use client";

import { Bus, MapPinPlus, X } from "lucide-react";

interface ReportChoiceModalProps {
  onClose: () => void;
  onChooseBus: () => void;
  onChooseObstacle: () => void;
}

export function ReportChoiceModal({ onClose, onChooseBus, onChooseObstacle }: ReportChoiceModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-choice-title"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 id="report-choice-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            What would you like to report?
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

        <div className="space-y-3">
          <button
            type="button"
            onClick={onChooseBus}
            className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-4 text-left transition hover:border-emerald-500 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:hover:bg-emerald-900/20"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
              <Bus aria-hidden className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                A bus issue
              </span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                No ramp, crowded, breakdown, etc.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={onChooseObstacle}
            className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 p-4 text-left transition hover:border-emerald-500 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:hover:bg-emerald-900/20"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <MapPinPlus aria-hidden className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                A location or obstacle
              </span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                Broken lift, blocked ramp, missing paving, etc.
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
