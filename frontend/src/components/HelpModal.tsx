"use client";

import { X } from "lucide-react";

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 id="help-modal-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            How MonFate works
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

        <div className="space-y-4 text-sm text-zinc-700 dark:text-zinc-300">
          <div>
            <p className="mb-1 font-semibold text-zinc-900 dark:text-zinc-100">Map legend</p>
            <ul className="space-y-1">
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border-2 border-white bg-teal-700" /> Accessible stop
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border-2 border-red-600 bg-red-500" /> Stop with reported issue
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-4 w-6 items-center justify-center rounded border-2 border-red-600 bg-sky-600 text-[8px] font-bold text-white">
                  !
                </span>
                Bus with a reported problem (no ramp / full)
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-1 font-semibold text-zinc-900 dark:text-zinc-100">Reporting</p>
            <p>
              Tap <b>Report</b> to flag either a bus issue (ramp, crowding, seating) or a location
              problem (broken lift, blocked ramp). Bus reports go into a review queue — an admin
              approves or rejects them before the map updates, so one bad report can&apos;t wrongly mark a
              bus as inaccessible.
            </p>
          </div>

          <div>
            <p className="mb-1 font-semibold text-zinc-900 dark:text-zinc-100">Filtering</p>
            <p>
              Use the accessibility filters to show only obstacles that affect you, or the bus needs
              filter to highlight buses that currently have a ramp, wheelchair space, or priority
              seating available.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
