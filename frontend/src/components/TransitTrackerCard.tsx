import { Armchair, Bus, DoorOpen, Users } from "lucide-react";
import type { CapacityStatus, RampStatus, TransitVehicle } from "@/types/monfate";
import { formatEta } from "@/lib/format";

const RAMP_LABEL: Record<RampStatus, string> = {
  deployed: "Ramp deployed",
  stowed: "Ramp ready",
  fault: "Ramp fault reported",
  not_equipped: "No ramp fitted",
};

const RAMP_COLOR: Record<RampStatus, string> = {
  deployed: "text-ok",
  stowed: "text-accent",
  fault: "text-down",
  not_equipped: "text-slate-500",
};

const CAPACITY_LABEL: Record<CapacityStatus, string> = {
  empty: "Empty",
  seats_available: "Seats available",
  standing_room: "Standing room",
  full: "Full",
};

export function TransitTrackerCard({ vehicle }: { vehicle: TransitVehicle }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Bus aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{vehicle.route_id}</p>
            <p className="text-xs text-slate-500">
              {vehicle.vehicle_id} &rarr; {vehicle.next_stop_id || "--"}
            </p>
          </div>
        </div>
        <span className="tabular shrink-0 rounded-full bg-ok/15 px-2.5 py-1 text-xs font-medium text-ok ring-1 ring-inset ring-ok/30">
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
        <div className="flex items-center gap-1.5 text-slate-400">
          <Users aria-hidden className="h-3.5 w-3.5" />
          {CAPACITY_LABEL[vehicle.capacity_status]}
        </div>
        <div className="col-span-2 flex items-center gap-1.5 text-slate-400">
          <Armchair aria-hidden className="h-3.5 w-3.5" />
          {vehicle.is_accessible
            ? "Wheelchair accessible vehicle"
            : "Not wheelchair accessible"}
        </div>
      </dl>
    </div>
  );
}
