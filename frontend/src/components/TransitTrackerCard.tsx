import { Armchair, Bus, DoorOpen, Users } from "lucide-react";
import type { CapacityStatus, RampStatus, TransitVehicle } from "@/types/monfate";
import { formatEta } from "@/lib/format";

const RAMP_LABEL: Record<RampStatus, string> = {
  deployed: "Ramp deployed",
  stowed: "Ramp ready",
  fault: "Ramp fault reported",
  not_equipped: "No ramp",
};

const RAMP_COLOR: Record<RampStatus, string> = {
  deployed: "text-emerald-700 dark:text-emerald-400",
  stowed: "text-sky-700 dark:text-sky-400",
  fault: "text-red-700 dark:text-red-400",
  not_equipped: "text-zinc-500 dark:text-zinc-400",
};

const CAPACITY_LABEL: Record<CapacityStatus, string> = {
  empty: "Empty",
  seats_available: "Seats available",
  standing_room: "Standing room",
  full: "Full",
};

interface TransitTrackerCardProps {
  vehicle: TransitVehicle;
}

export function TransitTrackerCard({ vehicle }: TransitTrackerCardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
            <Bus aria-hidden className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {vehicle.route_id}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {vehicle.vehicle_id}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          {formatEta(vehicle.eta_seconds)}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <DoorOpen aria-hidden className={`h-3.5 w-3.5 ${RAMP_COLOR[vehicle.ramp_status]}`} />
          <span className={RAMP_COLOR[vehicle.ramp_status]}>
            {RAMP_LABEL[vehicle.ramp_status]}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
          <Users aria-hidden className="h-3.5 w-3.5" />
          {CAPACITY_LABEL[vehicle.capacity_status]}
        </div>
        {vehicle.is_accessible && (
          <div className="col-span-2 flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <Armchair aria-hidden className="h-3.5 w-3.5" />
            Wheelchair accessible vehicle
          </div>
        )}
      </dl>
    </div>
  );
}
