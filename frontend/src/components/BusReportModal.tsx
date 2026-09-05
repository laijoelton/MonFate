"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { CapacityStatus, RampStatus, TransitVehicle } from "@/types/monfate";
import { getRoute } from "@/lib/cyberjaya-routes";

export interface BusIssueOption {
  id: string;
  label: string;
  description: string;
  updates: { ramp_status?: RampStatus; capacity_status?: CapacityStatus };
}

const BUS_ISSUE_OPTIONS: BusIssueOption[] = [
  {
    id: "no_ramp",
    label: "No ramp / ramp fault",
    description: "Ramp is broken, jammed, or missing.",
    updates: { ramp_status: "fault" },
  },
  {
    id: "ramp_fixed",
    label: "Ramp working again",
    description: "Confirming the ramp is back in service.",
    updates: { ramp_status: "deployed" },
  },
  {
    id: "crowded",
    label: "Crowded (standing room only)",
    description: "Still boardable, but tight.",
    updates: { capacity_status: "standing_room" },
  },
  {
    id: "full",
    label: "Full — can't board",
    description: "No more room for passengers.",
    updates: { capacity_status: "full" },
  },
  {
    id: "seats_available",
    label: "Seats available again",
    description: "Confirming there's space now.",
    updates: { capacity_status: "seats_available" },
  },
];

interface BusReportModalProps {
  vehicles: TransitVehicle[];
  onClose: () => void;
  onSubmit: (vehicleId: string, updates: BusIssueOption["updates"]) => void;
}

export function BusReportModal({ vehicles, onClose, onSubmit }: BusReportModalProps) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.vehicle_id ?? "");
  const [issueId, setIssueId] = useState<string>(BUS_ISSUE_OPTIONS[0].id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const issue = BUS_ISSUE_OPTIONS.find((o) => o.id === issueId);
    if (!vehicleId || !issue) return;
    onSubmit(vehicleId, issue.updates);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bus-report-title"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 id="bus-report-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Report a bus issue
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="bus-select" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Which bus?
            </label>
            <select
              id="bus-select"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {vehicles.map((v) => {
                const route = getRoute(v.route_id);
                return (
                  <option key={v.vehicle_id} value={v.vehicle_id}>
                    {v.vehicle_id} — {route?.route_id ?? v.route_id} · {route?.name ?? ""}
                  </option>
                );
              })}
            </select>
          </div>

          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              What's the issue?
            </legend>
            <div className="space-y-2">
              {BUS_ISSUE_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 p-3 text-sm has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50 dark:border-zinc-700 dark:has-[:checked]:bg-emerald-900/20"
                >
                  <input
                    type="radio"
                    name="bus-issue"
                    className="mt-0.5 h-3.5 w-3.5"
                    checked={issueId === option.id}
                    onChange={() => setIssueId(option.id)}
                  />
                  <span>
                    <span className="block font-medium text-zinc-900 dark:text-zinc-100">
                      {option.label}
                    </span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      {option.description}
                    </span>
                  </span>
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
      </div>
    </div>
  );
}
