# PROJECT_STATE.md — MonFate

**SDG 11: Sustainable Cities & Communities — Dynamic, Accessible Transit & Routing**

Living document. Update in the same PR as any architecture, contract, or
milestone change (see [AGENTS.md](../AGENTS.md)).

## Problem

Riders with mobility needs (wheelchair users, stroller parents, low-vision
riders) can't trust static accessibility data — a ramp marked "accessible"
on a map might be blocked, an elevator might be down. MonFate combines
crowd-sourced obstacle reports, live transit telemetry, and a trust-scoring
consensus system to route riders around real-time accessibility failures.

## System architecture

```
┌─────────────────┐        REST/WS        ┌──────────────────────┐
│   frontend/      │ <-------------------> │   backend_api/       │
│   Next.js App    │                        │   FastAPI service    │
│   - Map View      │                        │   - Obstacle ingest   │
│   - Filter Bar    │                        │   - Trust consensus   │
│   - Report Modal  │                        │   - Route scoring     │
│   - Transit Card  │                        └──────────┬───────────┘
└──────────────────┘                                    │
                                                          │ simulated feed
                                              ┌───────────▼───────────┐
                                              │  Edge RTOS + CV sim    │
                                              │  - Obstacle detection  │
                                              │  - Vehicle telemetry   │
                                              └────────────────────────┘
```

- **Frontend** (Claude): Next.js/React, Tailwind CSS, Lucide icons. Renders
  the accessible map, lets riders filter by accessibility need, report
  obstacles, and track approaching accessible vehicles.
- **Backend API** (Codex): FastAPI + Pydantic. Owns the contracts below,
  ingests obstacle reports and vehicle telemetry, computes trust consensus
  scores, and will eventually serve routed paths weighted by live
  accessibility state.
- **Edge / CV simulation** (Codex): simulates the sensor and RTOS logic
  that would run on physical transit-stop hardware — obstacle detection
  events and vehicle position/telemetry streams — so the API and frontend
  can be developed against realistic data before real hardware exists.

## Shared contracts

Canonical definitions live in `backend_api/app/schemas/`. Frontend
TypeScript types in `frontend/` must mirror these exactly — see
[AGENTS.md](../AGENTS.md) guardrail #4.

### `ObstacleReport`
A crowd-sourced or CV-detected obstacle affecting accessible routing
(blocked ramp, broken elevator, missing tactile paving, construction,
etc.), carrying a trust-consensus score derived from corroborating
reports and verification recency.

Key fields: `id`, `obstacle_type`, `location (lat/lng)`, `description`,
`reported_at`, `last_verified_at`, `trust_score (0-100)`, `verification_count`,
`status` (active/resolved/disputed), `affects` (list of accessibility
categories it blocks: ramp, elevator, tactile_paving, stroller).

### `TransitVehicle`
Live telemetry for a transit vehicle relevant to accessible routing.

Key fields: `vehicle_id`, `route_id`, `location (lat/lng)`, `heading`,
`speed`, `is_accessible` (has working ramp/lift), `ramp_status`
(deployed/stowed/fault), `capacity_status`, `eta_seconds` to next stop,
`last_updated_at`.

### `AccessibilityRoute`
A routed path between two points, scored and annotated by live
accessibility state rather than static map data alone.

Key fields: `route_id`, `origin`, `destination`, `waypoints`, `accessibility_score`,
`active_obstacles` (list of `ObstacleReport.id` affecting the route),
`required_features` (accessibility filters the rider requested),
`estimated_duration_seconds`, `computed_at`.

### Trust consensus model
Backs `ObstacleReport.trust_score`. Combines report count, reporter
diversity, recency decay, and (eventually) CV-detection corroboration
into a single 0–100 score shown to riders as e.g. *"Verified 12m ago •
94% Trust Score."*

## Milestone tracker

| # | Milestone | Owner | Status |
|---|-----------|-------|--------|
| 1 | Repo scaffolding, dual-agent guardrails, contracts drafted | Claude | ✅ Done |
| 2 | Frontend HUD: map, filter bar, obstacle modal, transit card (mock data) | Claude | ✅ Done |
| 3 | Backend API: FastAPI app serving mock contract data | Codex | ⬜ Not started |
| 4 | Obstacle ingest endpoint + trust consensus scoring | Codex | ⬜ Not started |
| 5 | Edge RTOS / CV simulation feeding live obstacle + vehicle events | Codex | ⬜ Not started |
| 6 | Frontend wired to live backend (replace mock data) | Claude | ⬜ Not started |
| 7 | Route scoring endpoint + frontend route rendering | Both | ⬜ Not started |
| 8 | End-to-end demo polish, accessibility audit | Both | ⬜ Not started |

## Open questions

- Real map provider (Leaflet/Mapbox) vs. continued SVG-grid mock for demo
  day — depends on whether we get an API key and network access at the
  venue.
- Transport for live updates: WebSocket vs. polling — decide once Codex's
  backend milestone 3 lands.
