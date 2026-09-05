# MonFate

**Dynamic accessible transit & routing — SDG 11: Sustainable Cities & Communities**

Riders with mobility needs can't trust static accessibility data. A ramp marked
"accessible" may be blocked by a delivery truck; an elevator may be out with no
notice. MonFate closes that gap with three signals working together: **station
CCTV edge vision** that sees a wheelchair user waiting and warns the approaching
bus *before* it arrives, **crowd-sourced obstacle reports** scored by a trust
consensus that decays with age, and **live vehicle telemetry** that knows which
vehicles actually have a working ramp.

```bash
# terminal 1 — backend (self-contained transit simulation, no hardware)
cd backend_api && SYS_MOCK_DATA=true python -m uvicorn app.main:app --port 8000

# terminal 2 — cockpit
cd frontend && cp .env.example .env.local && npm install && npm run dev
# http://localhost:3000
```

---

## Current System Architecture & Implemented Features

```
┌──────────────────────┐  image-free events   ┌──────────────────────┐   WebSocket    ┌──────────────────┐
│   edge_vision/        │  (label, bbox, T0/T1) │   backend_api/       │  (vehicles,    │   frontend/      │
│   station CCTV node   │ ───────────────────▶  │   FastAPI hub        │   detections,  │   Next.js        │
│   ONNX / PyTorch /    │                       │   + trust consensus  │   alerts)      │   cockpit        │
│   TFLite / TensorRT   │                       │   + dispatch engine  │ ─────────────▶ │   Map HUD        │
│   + confirmation gate │                       │   + forecasting      │                │   + CCTV dock    │
└──────────────────────┘                       └──────────┬───────────┘                └──────────────────┘
                                                            │
   riders ──── POST /api/v1/obstacles ────────────────────▶ │
   vehicles ── POST /api/v1/telemetry ────────────────────▶ │
```

### 1. Frontend cockpit — `frontend/`

Next.js 16 + React 19 + Tailwind v4, OKLCH design tokens on a glassmorphism
surface. Live over one WebSocket with exponential reconnect backoff.

| Feature | Where |
|---|---|
| **Map HUD viewport** — WGS84 auto-fit projection, route corridor, heading-aware vehicle markers, obstacle opacity scaled by trust score | `components/MapHud.tsx` |
| **CCTV Edge Vision dock** — latest detection, confidence, inference time, p50 latency, rolling log | `components/CctvEdgeDock.tsx` |
| **Telemetry strips** — link state + ping, accessible-fleet ratio, active obstacles above trust threshold, stops monitored | `components/TelemetryStrip.tsx` |
| **Pre-emptive dispatch alerts** — severity-coded, `aria-live` announced, dismissible | `components/DispatchAlertBanner.tsx` |
| **Accessibility profile toggles** — wheelchair ramp, tactile paving, working elevators, stroller friendly | `components/AccessibilityFilterBar.tsx` |
| **Obstacle reporting + trust display** — "Verified 4m ago • 94% Trust Score" | `components/ObstacleReportModal.tsx`, `TrustBadge.tsx` |
| Live state, reconnect, staleness detection | `lib/useCockpit.ts` |

No map tile provider or API key required — the HUD projects coordinates itself.

### 2. Edge vision — `edge_vision/`

Backend-agnostic detection pipeline: **source → inference → confirmation gate →
image-free emitter**.

- **Four interchangeable backends** (`inference/`): PyTorch, ONNX Runtime,
  TFLite, TensorRT, plus a dependency-free `mock`. An automatic fallback chain
  walks TensorRT → ONNX → PyTorch and GPU → CPU, so a missing GPU never aborts a run.
- **`ConsecutiveDetectionGate`** — emits only after N consecutive frames agree
  on the same accepted class with exactly one object in view. Set to 5 frames
  here: a false dispatch wastes a bus, and a waiting passenger is a persistent
  signal, not a transient one.
- **Image-free `EventEmitter`** — ships a validated, schema-versioned metadata
  record per accepted detection over stdout / HTTP / MQTT. **No frames ever
  leave the device.** This is load-bearing, not incidental: the subjects are
  disabled passengers at public transit stops.
- **Detection targets** (`classes.yaml`): `wheelchair`, `stroller`,
  `mobility_aid`, `ambulant`, `other`. Only the first three are dispatchable —
  an unassisted passenger is not a boarding request.

```bash
python -m edge_vision.run --mock                          # offline, no camera, no model
python -m edge_vision.run --source 0 --preview            # real camera
python -m edge_vision.run --emit http://localhost:8000 --api-key "$SYS_API_KEY"
```

### 3. Backend telemetry engine — `backend_api/`

FastAPI + SQLAlchemy + Pydantic v2.

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/vision/events` | Station CCTV detection ingest (idempotent on `event_id`) |
| `POST /api/v1/telemetry` | Vehicle position / ramp / capacity update |
| `POST /api/v1/obstacles` | Rider obstacle report (trust scored server-side) |
| `POST /api/v1/obstacles/{id}/confirm` | Corroborate a report, raising its trust |
| `GET /api/v1/obstacles` · `/vehicles` · `/stops` | Query |
| `GET /api/v1/stops/{id}/forecast` | Arrival + dwell forecast |
| `WS /api/v1/stream` | Live fan-out: `vehicle`, `obstacle`, `vision`, `alert`, `lag`, `pong` |

- **Bounded WebSocket fan-out** (`stream.py`) — per-client `deque` with
  drop-oldest and a `lag` frame, so one slow cockpit can't grow memory
  unboundedly or silently show stale positions.
- **Device auth** — `X-API-Key` constant-time compared, optional HMAC-SHA256
  body signature behind `SYS_REQUIRE_HMAC`.
- **Idempotent ingest** — a retried POST after a flaky link does not
  double-count a passenger.
- **Standalone simulation** (`SYS_MOCK_DATA=true`) — drives a fleet along a
  four-stop corridor and fires synthetic detections through the *same* code
  path a real node takes, so there is no second path to drift.

### 4. ML & predictive services — `backend_api/app/services/`

| Module | What it does |
|---|---|
| `trust.py` | Trust consensus: weighted signal sources, saturating corroboration curve, exponential recency decay. 1 report → 48, 3 → 72, 7 → 95; the same 7 decay to 56 after three hours. Approaches certainty asymptotically and never reaches it, so "94%" means something. |
| `spatial.py` | Haversine distance, initial bearing, ETA from speed with a congestion floor, and point-to-corridor proximity for approach-path checks. |
| `forecast.py` | Arrival + dwell prediction with **fail-closed structured statuses** (`ok` / `cold_start` / `stale` / `unavailable`) — the caller never gets a bare exception, because a blank ETA can't tell a rider whether the bus is late or the service is broken. |
| `dispatch.py` | The alert engine. Matches a detection to the nearest **accessible** inbound vehicle within the ETA window; a bus with no working ramp is never alerted, since that would report a "handled" boarding that cannot happen. |

---

## Known gaps

**The detection head is not trained for these classes yet.** The shipped weights
(`edge_vision/models/`) were pre-trained for a different task, so the pipeline
currently runs through `MockDetector` with synthetic detections cycling the
accessibility class list. Everything downstream — gate, emitter, ingest, trust,
dispatch, cockpit — is real and running. `finetune.py` exists to attach a new
K-class head; it needs a labelled mobility-aid dataset.

**Routing is not implemented.** The `AccessibilityRoute` contract and the
spatial primitives it needs are in place, but no path-scoring endpoint exists.

---

## System Status & Changelog

Status legend: ✅ done · 🟡 in progress · ⬜ not started

| # | Milestone | Layer | Owner | Status |
|---|---|---|---|---|
| 1 | Repo scaffolding, dual-agent guardrails, contracts | Docs | Claude | ✅ |
| 2 | Frontend HUD: map, filters, obstacle modal, transit card | UI | Claude | ✅ |
| 3 | Edge vision pipeline ported + retargeted to accessibility classes | Edge | Claude | ✅ |
| 4 | Backend telemetry: ingest, WebSocket stream, transit simulation | Backend | Claude | ✅ |
| 5 | Trust consensus, spatial, forecasting, dispatch services | ML | Claude | ✅ |
| 6 | Cockpit wired to live backend (map HUD, CCTV dock, alerts, strips) | UI | Claude | ✅ |
| 7 | Fine-tuned detection head on real mobility-aid data | Edge | Codex | ⬜ |
| 8 | Route scoring endpoint + rendered accessible routes | Backend + UI | Both | ⬜ |
| 9 | Firmware / RTOS station node beyond the simulator | Edge | Codex | ⬜ |
| 10 | End-to-end demo polish + WCAG audit | All | Both | ⬜ |

### Changelog

**2026-09-05 — Full-stack migration**
- Ported the edge vision pipeline into `edge_vision/`; retargeted detection
  classes to `wheelchair` / `stroller` / `mobility_aid` / `ambulant`, raised the
  confirmation gate to 5 frames, `ambulant` excluded from dispatch.
- Built the backend telemetry engine: idempotent vision/telemetry/obstacle
  ingest, bounded WebSocket fan-out, four-stop corridor simulation.
- Added the predictive services layer: trust consensus with recency decay,
  spatial primitives, fail-closed arrival/dwell forecasting, dispatch engine.
- Rebuilt the frontend as a live cockpit: Map HUD, CCTV Edge Vision dock,
  telemetry strips, pre-emptive dispatch alerts, accessibility profile toggles.
- Verified end to end: detections raise alerts routed only to accessible
  inbound vehicles; obstacle reports score and persist.

**2026-09-05 — Foundation**
- Repo scaffolding, `AGENTS.md` dual-agent guardrails, `CLAUDE.md`, contracts
  in `backend_api/app/schemas/`, initial Next.js accessibility HUD.

---

## Repository layout

```
MonFate/
├── AGENTS.md              dual-agent rules of engagement (Claude / Codex)
├── CLAUDE.md              commands, code style, PR review checklist
├── docs/PROJECT_STATE.md  architecture, contracts, milestone tracker
├── edge_vision/           station CCTV pipeline (inference, gate, emitter)
├── backend_api/           FastAPI hub, contracts, predictive services
│   └── app/
│       ├── schemas/       Pydantic contracts — the source of truth
│       └── services/      trust, spatial, forecast, dispatch
└── frontend/              Next.js cockpit
```

Shared data shapes are defined in `backend_api/app/schemas/` and mirrored in
`frontend/src/types/monfate.ts`. Changing one without the other breaks ingest —
see [AGENTS.md](AGENTS.md) guardrail #4.
