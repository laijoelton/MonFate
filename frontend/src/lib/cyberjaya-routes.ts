import type { RouteStop, TransitRoute } from "@/types/monfate";

/**
 * Real Cyberjaya routes/stops for the live map (see docs/PROJECT_STATE.md —
 * "real map provider" open question, resolved in favor of Leaflet/OSM).
 * Coordinates are real lat/lng, unlike the earlier 0-100 grid mock.
 */

export const CYBERJAYA_ROUTES: TransitRoute[] = [
  {
    route_id: "C1",
    name: "Cyber Central",
    color: "#2563eb",
    stops: [
      { id: "terminal", name: "Cyberjaya Transport Terminal", location: { lat: 2.9213, lng: 101.6559 }, accessible: true },
      { id: "dpulze", name: "D'Pulze Shopping Centre", location: { lat: 2.9219, lng: 101.6505 }, accessible: true },
      { id: "mmu", name: "Multimedia University", location: { lat: 2.9275, lng: 101.6418 }, accessible: true },
      { id: "cyberia", name: "Cyberia", location: { lat: 2.9252, lng: 101.6377 }, accessible: false },
      { id: "shaftsbury", name: "Shaftsbury Square", location: { lat: 2.9229, lng: 101.6602 }, accessible: true },
    ],
  },
  {
    route_id: "C2",
    name: "Tamarind Line",
    color: "#10b981",
    stops: [
      { id: "tamarind", name: "Tamarind Square", location: { lat: 2.9087, lng: 101.6644 }, accessible: true },
      { id: "shaftsbury", name: "Shaftsbury Square", location: { lat: 2.9229, lng: 101.6602 }, accessible: true },
      { id: "terminal", name: "Cyberjaya Transport Terminal", location: { lat: 2.9213, lng: 101.6559 }, accessible: true },
      { id: "dpulze", name: "D'Pulze Shopping Centre", location: { lat: 2.9219, lng: 101.6505 }, accessible: true },
    ],
  },
  {
    route_id: "C3",
    name: "University Line",
    color: "#f97316",
    stops: [
      { id: "mmu", name: "Multimedia University", location: { lat: 2.9275, lng: 101.6418 }, accessible: true },
      { id: "mdec", name: "MDEC Cyberjaya", location: { lat: 2.9197, lng: 101.6416 }, accessible: true },
      { id: "hospital", name: "Hospital Cyberjaya", location: { lat: 2.9026, lng: 101.6605 }, accessible: true },
      { id: "tamarind", name: "Tamarind Square", location: { lat: 2.9087, lng: 101.6644 }, accessible: true },
    ],
  },
];

/** Every unique stop across all routes, de-duplicated by id — for rendering stop markers once. */
export const ALL_STOPS: RouteStop[] = Array.from(
  new Map(
    CYBERJAYA_ROUTES.flatMap((route) => route.stops).map((stop) => [stop.id, stop]),
  ).values(),
);

export const getRoute = (routeId: string): TransitRoute | undefined =>
  CYBERJAYA_ROUTES.find((route) => route.route_id === routeId);

/** Rough map center for Cyberjaya, used to position the initial view. */
export const CYBERJAYA_CENTER: [number, number] = [2.918, 101.653];
export const CYBERJAYA_DEFAULT_ZOOM = 14;
