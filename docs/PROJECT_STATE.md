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
│   - SampAI Chat    │                                   │
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
- **Edge vision** (`edge_vision/`): the station-CCTV pipeline — source →
  inference → confirmation gate → image-free emitter, with four
  interchangeable backends and a dependency-free mock. Runs on
  transit-stop hardware; ships labels, never frames.

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
Backs `ObstacleReport.trust_score`. Implemented in
`backend_api/app/services/trust.py`. Combines weighted signal sources
(rider 1.0 / CV 1.6 / operator 2.4), a saturating corroboration curve, a
reporter-diversity multiplier that saturates at 5 reporters, and
exponential recency decay (3h half-life) into a single 0–100 score shown
to riders as e.g. *"Verified 12m ago • 94% Trust Score."*

Observed curve: 1 report → 48.4, 3 → 72.1, 7 → 95.2. Those same 7 signals
decay to 56.0 after three hours, dropping below the actionable threshold
(70) — a stale obstacle stops rerouting riders on its own.

### `DispatchAlert`
Output of `backend_api/app/services/dispatch.py`. Two kinds:
`assistive_boarding` (station CCTV saw a wheelchair / stroller /
mobility-aid passenger at an upcoming stop) and `approach_blocked` (a
trusted obstacle blocks the ramp landing zone). Only **accessible**
inbound vehicles within the ETA window are alerted — warning a bus with
no working ramp would report a "handled" boarding that cannot happen.

### Citizen assistance and SampAI chat

The citizen cockpit includes an ephemeral, English text assistant served by
`POST /api/v1/chat/stream`. The browser sends at most 20 messages and receives
SSE text deltas plus validated action proposals. `CHAT_PROVIDER=mock` provides
deterministic offline demonstrations; `CHAT_PROVIDER=deepseek` uses the
backend-only DeepSeek key. Chat history is not persisted.

The assistant can propose an `AssistanceRequest` or `ObstacleReport`, but it
cannot execute either. The citizen must press a visible Confirm button. New
assistance records are anonymous, idempotent, begin as `pending`, and broadcast
the existing `assistance_request` WebSocket event to the admin dashboard.

## Milestone tracker

| # | Milestone | Owner | Status |
|---|-----------|-------|--------|
| 1 | Repo scaffolding, dual-agent guardrails, contracts drafted | Claude | ✅ Done |
| 2 | Frontend HUD: map, filter bar, obstacle modal, transit card | Claude | ✅ Done |
| 3 | Edge vision pipeline ported to `edge_vision/`, retargeted classes | Claude | ✅ Done |
| 4 | Backend API: ingest, WebSocket stream, transit simulation | Claude | ✅ Done |
| 5 | Trust consensus, spatial, forecasting, dispatch services | Claude | ✅ Done |
| 6 | Frontend wired to live backend (cockpit) | Claude | ✅ Done |
| 7 | Fine-tuned detection head on real mobility-aid data | Codex | ⬜ Not started |
| 8 | Route scoring endpoint + frontend route rendering | Both | ⬜ Not started |
| 9 | Firmware / RTOS station node beyond the simulator | Codex | ⬜ Not started |
| 10 | End-to-end demo polish, WCAG audit | Both | ⬜ Not started |
| 11 | Citizen SampAI mock stream, confirmed assistance/obstacle actions | Both | ✅ Done |
| 12 | DeepSeek live-provider verification with deployment key | Codex | ⬜ Not started |

The full layer-by-layer feature breakdown and changelog live in
[README.md](../README.md#current-system-architecture--implemented-features).

## Open questions

- Real map provider (Leaflet/Mapbox) vs. continued SVG-grid mock for demo
  day — depends on whether we get an API key and network access at the
  venue.
- Transport for live updates: WebSocket vs. polling — decide once Codex's
  backend milestone 3 lands.
