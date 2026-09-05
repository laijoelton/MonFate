"use client";

import { AlertTriangle, Bus } from "lucide-react";
import type {
  AccessibilityFeature,
  ObstacleReport,
  TransitVehicle,
} from "@/types/monfate";

const GRID_SIZE = 100;
const GRID_LINES = 10;

const STATUS_COLOR: Record<ObstacleReport["status"], string> = {
  active: "#dc2626",
  disputed: "#d97706",
  resolved: "#16a34a",
};

interface MapViewProps {
  obstacles: ObstacleReport[];
  vehicles: TransitVehicle[];
  activeFilters: Set<AccessibilityFeature>;
  selectedObstacleId: string | null;
  onSelectObstacle: (obstacle: ObstacleReport) => void;
}

export function MapView({
  obstacles,
  vehicles,
  activeFilters,
  selectedObstacleId,
  onSelectObstacle,
}: MapViewProps) {
  const visibleObstacles =
    activeFilters.size === 0
      ? obstacles
      : obstacles.filter((o) => o.affects.some((f) => activeFilters.has(f)));

  const gridStep = GRID_SIZE / GRID_LINES;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <svg
        viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`}
        role="img"
        aria-label="Accessible transit map showing reported obstacles and live vehicle positions"
        className="h-full w-full"
      >
        <rect width={GRID_SIZE} height={GRID_SIZE} className="fill-white dark:fill-zinc-950" />

        {Array.from({ length: GRID_LINES + 1 }, (_, i) => i * gridStep).map((pos) => (
          <g key={`grid-${pos}`}>
            <line
              x1={pos}
              y1={0}
              x2={pos}
              y2={GRID_SIZE}
              className="stroke-zinc-200 dark:stroke-zinc-800"
              strokeWidth={0.3}
            />
            <line
              x1={0}
              y1={pos}
              x2={GRID_SIZE}
              y2={pos}
              className="stroke-zinc-200 dark:stroke-zinc-800"
              strokeWidth={0.3}
            />
          </g>
        ))}

        {vehicles.map((vehicle) => (
          <g
            key={vehicle.vehicle_id}
            transform={`translate(${vehicle.location.lng}, ${vehicle.location.lat})`}
          >
            <circle
              r={3.2}
              className={
                vehicle.is_accessible
                  ? "fill-sky-600"
                  : "fill-zinc-400 dark:fill-zinc-600"
              }
            />
            <title>{`${vehicle.route_id} - ${vehicle.vehicle_id}`}</title>
          </g>
        ))}

        {visibleObstacles.map((obstacle) => {
          const isSelected = obstacle.id === selectedObstacleId;
          return (
            <g
              key={obstacle.id}
              transform={`translate(${obstacle.location.lng}, ${obstacle.location.lat})`}
              onClick={() => onSelectObstacle(obstacle)}
              className="cursor-pointer"
              tabIndex={0}
              role="button"
              aria-label={`${obstacle.obstacle_type.replace(/_/g, " ")}, trust score ${Math.round(obstacle.trust_score)} percent`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectObstacle(obstacle);
                }
              }}
            >
              <circle
                r={isSelected ? 4.5 : 3.5}
                fill={STATUS_COLOR[obstacle.status]}
                stroke={isSelected ? "#111827" : "white"}
                strokeWidth={isSelected ? 0.8 : 0.5}
              />
            </g>
          );
        })}
      </svg>

      <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white/95 p-2.5 text-xs text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-300">
        <span className="flex items-center gap-1.5">
          <AlertTriangle aria-hidden className="h-3.5 w-3.5 text-red-600" /> Active obstacle
        </span>
        <span className="flex items-center gap-1.5">
          <Bus aria-hidden className="h-3.5 w-3.5 text-sky-600" /> Accessible vehicle
        </span>
      </div>
    </div>
  );
}
