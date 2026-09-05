"use client";

import { useMemo } from "react";
import { Bus, TriangleAlert } from "lucide-react";
import type {
  AccessibilityFeature,
  Coordinates,
  ObstacleReport,
  TransitStop,
  TransitVehicle,
} from "@/types/monfate";

const PAD = 8; // viewBox padding in projected units
const VIEW = 100;

const STATUS_COLOR: Record<ObstacleReport["status"], string> = {
  active: "var(--color-down)",
  disputed: "var(--color-warn)",
  resolved: "var(--color-ok)",
};

interface MapHudProps {
  obstacles: ObstacleReport[];
  vehicles: TransitVehicle[];
  stops: TransitStop[];
  activeFilters: Set<AccessibilityFeature>;
  selectedObstacleId: string | null;
  onSelectObstacle: (obstacle: ObstacleReport) => void;
}

/**
 * Map HUD viewport. Projects WGS84 coordinates onto a square viewBox with an
 * equirectangular fit over whatever data is present, so it works for any city
 * without a tile provider or API key.
 */
export function MapHud({
  obstacles,
  vehicles,
  stops,
  activeFilters,
  selectedObstacleId,
  onSelectObstacle,
}: MapHudProps) {
  const visibleObstacles = useMemo(
    () =>
      activeFilters.size === 0
        ? obstacles
        : obstacles.filter((o) => o.affects.some((f) => activeFilters.has(f))),
    [obstacles, activeFilters],
  );

  const bounds = useMemo(() => {
    const pts: Coordinates[] = [
      ...stops.map((s) => s.location),
      ...vehicles.map((v) => v.location),
      ...obstacles.map((o) => o.location),
    ];
    if (pts.length === 0) return null;
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const minLng = Math.min(...lngs);
    // Guard the degenerate single-point case: a zero-width span would divide by
    // zero and collapse every marker onto one pixel.
    const span = Math.max(
      Math.max(...lats) - minLat,
      Math.max(...lngs) - minLng,
      1e-4,
    );
    return { minLat, minLng, span };
  }, [stops, vehicles, obstacles]);

  const project = (c: Coordinates) => {
    if (!bounds) return { x: c.lng, y: c.lat };
    const usable = VIEW - PAD * 2;
    return {
      x: PAD + ((c.lng - bounds.minLng) / bounds.span) * usable,
      // SVG y grows downward; latitude grows north, so invert.
      y: PAD + usable - ((c.lat - bounds.minLat) / bounds.span) * usable,
    };
  };

  const routePath =
    stops.length < 2
      ? ""
      : stops
          .map((s, i) => {
            const { x, y } = project(s.location);
            return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
          })
          .join(" ");

  return (
    <div className="glass relative h-full overflow-hidden rounded-2xl">
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        role="img"
        aria-label={`Accessible transit map: ${visibleObstacles.length} obstacles, ${vehicles.length} vehicles, ${stops.length} stops`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {Array.from({ length: 11 }, (_, i) => i * (VIEW / 10)).map((pos) => (
          <g key={`grid-${pos}`}>
            <line x1={pos} y1={0} x2={pos} y2={VIEW} stroke="oklch(0.4 0.02 260 / 0.15)" strokeWidth={0.25} />
            <line x1={0} y1={pos} x2={VIEW} y2={pos} stroke="oklch(0.4 0.02 260 / 0.15)" strokeWidth={0.25} />
          </g>
        ))}

        {routePath && (
          <path
            d={routePath}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={0.8}
            strokeOpacity={0.45}
            strokeDasharray="2 1.5"
            strokeLinecap="round"
          />
        )}

        {stops.map((s) => {
          const { x, y } = project(s.location);
          return (
            <g key={s.stop_id} transform={`translate(${x} ${y})`}>
              <circle r={1.8} fill="oklch(0.16 0.015 260)" stroke="var(--color-accent)" strokeWidth={0.5} />
              <text
                x={0}
                y={-3}
                textAnchor="middle"
                fill="oklch(0.75 0.02 260)"
                style={{ fontSize: 2.4 }}
              >
                {s.name}
              </text>
            </g>
          );
        })}

        {vehicles.map((v) => {
          const { x, y } = project(v.location);
          return (
            <g key={v.vehicle_id} transform={`translate(${x} ${y}) rotate(${v.heading_degrees})`}>
              <title>{`${v.route_id} — ${v.vehicle_id}${v.is_accessible ? " (accessible)" : ""}`}</title>
              <path
                d="M 0 -2.6 L 1.9 2.2 L 0 1.1 L -1.9 2.2 Z"
                fill={v.is_accessible ? "var(--color-accent)" : "var(--color-idle)"}
                stroke="oklch(0.16 0.015 260)"
                strokeWidth={0.3}
              />
            </g>
          );
        })}

        {visibleObstacles.map((o) => {
          const { x, y } = project(o.location);
          const isSelected = o.id === selectedObstacleId;
          return (
            <g
              key={o.id}
              transform={`translate(${x} ${y})`}
              onClick={() => onSelectObstacle(o)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectObstacle(o);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`${o.obstacle_type.replace(/_/g, " ")} at trust score ${Math.round(o.trust_score)} percent`}
              className="cursor-pointer focus:outline-none"
            >
              {isSelected && (
                <circle r={4.2} fill="none" stroke="oklch(0.95 0 0)" strokeWidth={0.5} />
              )}
              <circle
                r={2.4}
                fill={STATUS_COLOR[o.status]}
                fillOpacity={Math.max(0.35, o.trust_score / 100)}
                stroke="oklch(0.16 0.015 260)"
                strokeWidth={0.4}
              />
            </g>
          );
        })}
      </svg>

      <div className="glass absolute right-3 top-3 flex flex-col gap-1.5 rounded-lg px-3 py-2 text-xs text-slate-300">
        <span className="flex items-center gap-1.5">
          <TriangleAlert aria-hidden className="h-3.5 w-3.5 text-down" /> Obstacle
        </span>
        <span className="flex items-center gap-1.5">
          <Bus aria-hidden className="h-3.5 w-3.5 text-accent" /> Accessible vehicle
        </span>
        <span className="text-[10px] text-slate-500">Opacity = trust score</span>
      </div>
    </div>
  );
}
