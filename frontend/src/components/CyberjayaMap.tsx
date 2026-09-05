"use client";

import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { ALL_STOPS, CYBERJAYA_CENTER, CYBERJAYA_DEFAULT_ZOOM, CYBERJAYA_ROUTES, getRoute } from "@/lib/cyberjaya-routes";
import type { TrafficAwareRoute } from "@/lib/google-routes";
import type { ActiveIncident } from "@/lib/accident-simulation";
import type { AccessibilityFeature, ObstacleReport, TransitVehicle } from "@/types/monfate";

const OBSTACLE_COLOR: Record<ObstacleReport["status"], string> = {
  active: "#dc2626",
  disputed: "#d97706",
  resolved: "#16a34a",
};

function createBusIcon(vehicle: TransitVehicle, color: string) {
  const label = vehicle.vehicle_id.replace(/^BUS-/, "");
  const hasIssue = vehicle.ramp_status === "fault" || vehicle.capacity_status === "full";
  const borderColor = hasIssue ? "#dc2626" : "white";
  const badge = hasIssue
    ? `<span style="
        position:absolute; top:-6px; right:-6px; width:16px; height:16px;
        border-radius:50%; background:#dc2626; color:white; font-size:10px;
        font-weight:800; display:flex; align-items:center; justify-content:center;
        border:2px solid white;
      ">!</span>`
    : "";
  return L.divIcon({
    className: "monfate-bus-icon",
    html: `
      <div style="position:relative;">
        <div style="
          display:flex; align-items:center; justify-content:center; gap:3px;
          width:52px; height:30px; border:3px solid ${borderColor}; border-radius:9px;
          color:white; background:${color}; box-shadow:0 3px 9px rgba(15,23,42,0.35);
          font-size:9px; font-family:inherit; font-weight:700;
        ">
          <span>BUS</span><strong style="font-size:11px;">${label}</strong>
        </div>
        ${badge}
      </div>
    `,
    iconSize: [52, 30],
    iconAnchor: [26, 15],
  });
}

interface CyberjayaMapProps {
  vehicles: TransitVehicle[];
  obstacles: ObstacleReport[];
  activeFilters: Set<AccessibilityFeature>;
  selectedRouteId: string | "all";
  selectedObstacleId: string | null;
  onSelectObstacle: (obstacle: ObstacleReport) => void;
  /** Real, traffic-aware driving routes keyed by route_id — see
   * lib/traffic-routes.ts. Missing entries fall back to a straight line. */
  trafficRoutes: Record<string, TrafficAwareRoute>;
  /** Active simulated accidents keyed by route_id — see
   * lib/accident-simulation.ts. When present, overrides the route's line
   * and bus positions with the computed detour. */
  incidents: Record<string, ActiveIncident>;
}

export function CyberjayaMap({
  vehicles,
  obstacles,
  activeFilters,
  selectedRouteId,
  selectedObstacleId,
  onSelectObstacle,
  trafficRoutes,
  incidents,
}: CyberjayaMapProps) {
  const visibleObstacles =
    activeFilters.size === 0
      ? obstacles
      : obstacles.filter((o) => o.affects.some((f) => activeFilters.has(f)));

  return (
    <MapContainer
      center={CYBERJAYA_CENTER}
      zoom={CYBERJAYA_DEFAULT_ZOOM}
      className="h-full w-full rounded-2xl"
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {CYBERJAYA_ROUTES.map((route) => {
        const straightLine = route.stops.map((stop): [number, number] => [stop.location.lat, stop.location.lng]);
        const activeIncident = incidents[route.route_id];
        const detourPath = activeIncident?.detour?.path;
        const trafficPath = trafficRoutes[route.route_id]?.path;
        const routed = detourPath ?? trafficPath;
        const positions = routed && routed.length > 0 ? routed.map((c): [number, number] => [c.lat, c.lng]) : straightLine;
        const isDetouring = Boolean(detourPath);
        return (
          <Polyline
            key={route.route_id}
            positions={positions}
            pathOptions={{
              color: isDetouring ? "#dc2626" : route.color,
              weight: selectedRouteId === "all" || selectedRouteId === route.route_id ? 6 : 3,
              opacity: selectedRouteId === "all" || selectedRouteId === route.route_id ? 0.9 : 0.2,
              dashArray: isDetouring ? "6 8" : undefined,
            }}
          />
        );
      })}

      {Object.values(incidents).map(({ incident }) => (
        <Marker
          key={incident.id}
          position={[incident.location.lat, incident.location.lng]}
          icon={L.divIcon({
            className: "monfate-incident-icon",
            html: `
              <div style="
                display:flex; align-items:center; justify-content:center;
                width:28px; height:28px; border-radius:50%; background:#dc2626;
                border:3px solid white; box-shadow:0 3px 9px rgba(15,23,42,0.4);
                color:white; font-size:15px; font-weight:800;
              ">!</div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          })}
        >
          <Popup>
            <strong>Accident reported</strong>
            <p className="mt-1 text-xs">{incident.description}</p>
          </Popup>
        </Marker>
      ))}

      {ALL_STOPS.map((stop) => (
        <CircleMarker
          key={stop.id}
          center={[stop.location.lat, stop.location.lng]}
          radius={7}
          pathOptions={{
            color: stop.accessible ? "#ffffff" : "#dc2626",
            weight: 3,
            fillColor: stop.accessible ? "#0f766e" : "#ef4444",
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top">{stop.name}</Tooltip>
          <Popup>
            <strong>{stop.name}</strong>
            <p className="mt-1 text-xs">
              {stop.accessible ? "Wheelchair-accessible stop" : "Accessibility issue reported"}
            </p>
          </Popup>
        </CircleMarker>
      ))}

      {visibleObstacles.map((obstacle) => (
        <CircleMarker
          key={obstacle.id}
          center={[obstacle.location.lat, obstacle.location.lng]}
          radius={obstacle.id === selectedObstacleId ? 9 : 7}
          eventHandlers={{ click: () => onSelectObstacle(obstacle) }}
          pathOptions={{
            color: obstacle.id === selectedObstacleId ? "#111827" : "white",
            weight: obstacle.id === selectedObstacleId ? 3 : 1.5,
            fillColor: OBSTACLE_COLOR[obstacle.status],
            fillOpacity: 0.95,
          }}
        >
          <Tooltip direction="top">{obstacle.description}</Tooltip>
        </CircleMarker>
      ))}

      {vehicles
        .filter((v) => selectedRouteId === "all" || v.route_id === selectedRouteId)
        .map((vehicle) => {
          const route = getRoute(vehicle.route_id);
          if (!route) return null;
          return (
            <Marker
              key={vehicle.vehicle_id}
              position={[vehicle.location.lat, vehicle.location.lng]}
              icon={createBusIcon(vehicle, route.color)}
            >
              <Popup>
                <strong>{vehicle.vehicle_id}</strong>
                <p className="mt-1 text-xs">{route.name}</p>
                <hr className="my-1" />
                <p className="text-xs">
                  Next stop: <b>{vehicle.next_stop_id}</b>
                </p>
                <p className="text-xs">
                  Ramp: <b>{vehicle.ramp_status.replace("_", " ")}</b>
                </p>
                <p className="text-xs">
                  Capacity: <b>{vehicle.capacity_status.replace("_", " ")}</b>
                </p>
              </Popup>
            </Marker>
          );
        })}
    </MapContainer>
  );
}
