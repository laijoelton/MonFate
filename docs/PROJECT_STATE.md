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

## Milestone tracker

| # | Milestone | Owner | Status |
|---|-----------|-------|--------|
| 1 | Repo scaffolding, dual-agent guardrails, contracts drafted | Claude | ✅ Done |
| 2 | Frontend HUD: map, filter bar, obstacle modal, transit card | Claude | ✅ Done |
| 3 | Edge vision pipeline ported to `edge_vision/`, retargeted classes | Claude | ✅ Done |
| 4 | Backend API: ingest, WebSocket stream, transit simulation | Claude | ✅ Done |
| 5 | Trust consensus, spatial, forecasting, dispatch services | Claude | ✅ Done |
| 6 | Frontend wired to live backend (cockpit) | Claude | ✅ Done |
| 7 | Fine-tuned detection head on real mobility-aid data | Codex | In progress — validated runtime ready; real-data training pending |
| 8 | Route scoring endpoint + frontend route rendering | Both | ⬜ Not started |
| 9 | Firmware / RTOS station node beyond the simulator | Codex | ⬜ Not started |
| 10 | End-to-end demo polish, WCAG audit | Both | ⬜ Not started |

### Milestone 7 — validated mobility runtime (2026-09-05)

- `edge_vision/detector.py` selects validated YOLO/PyTorch or ONNX inference,
  fingerprints real weights, and uses explicitly simulated mock detections
  only when weights are absent or simulation is requested. Invalid existing
  checkpoints fail closed; CPU fallback stays on the same artifact.
- `inference/validation.py` checks ordered class maps; PyTorch and ONNX loaders
  reject incompatible metadata and head sizes. Legacy weights are not mobility
  weights. Unvalidated TensorRT/TFLite backends cannot dispatch via the runner.
- The runner enforces exactly five frames and the three dispatch classes;
  `gate.py` also defaults to five. The metadata-only emitter now posts to
  `/api/v1/vision/events`. Shared wire contracts are unchanged.
- Tests cover class mismatch, real YOLOv8 checkpoint loading and ONNX export,
  ONNX inference, interrupted/ambiguous/low-confidence sequences, simulation,
  and image-free JSON transport: **36 runtime tests passed** in the local
  Python 3.12 environment, including a real untrained YOLOv8 export round trip.
  No mobility accuracy claim is made by these synthetic runtime checks.

### Milestone 7 — training support (2026-09-05)

- `edge_vision/finetune.py` supports pretrained Ultralytics YOLOv8n transfer
  learning, configurable layer freezing, local YOLO dataset validation, best
  checkpoint evaluation, and static ONNX export with a validated CPU warmup.
  Validation checks readable images, annotations, class IDs, normalized box
  bounds, all dispatch classes in each split, and duplicate images across splits.
- `metrics.json` records precision, recall, mAP50, mAP50–95, and per-class mAP
  (null for classes absent from evaluation). Training assets stay local and
  ignored by Git. Setup, dataset format, and commands are documented in
  `edge_vision/models/README.md`.
- **47 tests passed** across all `edge_vision/tests/` tests on Windows/Python
  3.12, using the project `.venv`: pytest 9.1.1, NumPy 2.5.2, Ultralytics
  8.4.140, PyTorch 2.14.0, ONNX 1.22.0, and ONNX Runtime 1.29.0.
  The real untrained YOLOv8 export test reports three upstream export warnings.
  Training orchestration/metrics tests use a stub; no real-data training run
  or production accuracy evaluation has been performed.
- Milestone 7 remains **in progress** until labelled station data is supplied,
  a head is trained, and held-out real-world accuracy is evaluated.

### Milestone 7 — first synthetic training run (2026-09-05)

- Completed five epochs of real YOLOv8n transfer learning on 120 synthetic
  training images and 24 synthetic validation images. Exported `best.pt` and
  `best.onnx` under `edge_vision/runs/mobility_smoke/train/weights/` (local,
  ignored artifacts). The model has not been trained/evaluated on real footage.
- Synthetic validation: precision 0.9051, recall 0.9444, mAP50 0.9642,
  mAP50–95 0.9393. These are smoke-test metrics from very few synthetic designs.
- Both artifacts load without mock fallback. The actual runner emitted
  five-frame-confirmed wheelchair/mobility_aid metadata events to stdout.
  Stroller confidence stayed below the 0.70 dispatch threshold.
- Dataset provenance, artifact paths, verification, and the exact live command
  are in [MOBILITY_SMOKE_RUN.md](MOBILITY_SMOKE_RUN.md). Real-world evaluation
  remains required before Milestone 7 can be marked complete.

### Edge preview improvements (2026-09-05)

- `tracking.py` adds class-aware one-to-one IoU association and EMA boxes for
  the display. New boxes need two observations; held boxes expire after two
  missed frames. Only fresh detections reach the five-frame gate and emitter.
- Runner confidence now defaults to 0.60, with a `--confidence` override;
  invalid/nonfinite detections are filtered independently of backend behavior.
- `age_preview.py` adds an opt-in local age-bracket overlay under
  `--preview --demographics`. Gender inference is not implemented. Face and
  age networks are never initialized without the flag, and estimates/face
  data never enter shared contracts or outbound events.
- `download_age_models.py` explicitly acquires SHA-256-verified face and
  age-only models. `.venv` uses OpenCV 4.14.0 (4.x retains Caffe support).
  Both real models loaded and ran inference. No extra facial-analysis package
  was needed. Model artifacts remain local and ignored.
- A real webcam run using `--source 0 --preview --demographics --max-frames 30`
  completed with exit code 0. The local default `models/mobility.onnx` points
  to a copy of the previously trained synthetic smoke model, not mock inference.
- **57 tests passed**, with three existing upstream ONNX-export warnings.
  Coverage includes EMA jitter, one-to-one association, distant spikes,
  missed-frame expiry, confidence filtering, age refresh/cache lifetime, and
  preview/gate/event separation. `pip check` reports no broken requirements.

The full layer-by-layer feature breakdown and changelog live in
[README.md](../README.md#current-system-architecture--implemented-features).

## Open questions

### Citizen transit assistant (September 2026)

- Added `POST /api/v1/citizen/chat` with validated message/session contracts in
  `backend_api/app/schemas/chat.py`, router in `api/citizen_chat.py`, and fresh
  context collection in `core/chat/context_builder.py`.
- Reads persisted, edge-debounced vision events from the existing vision ingest
  pipeline, fresh accessible vehicle ETAs/ramp state, decaying active obstacles,
  and dynamic `RouteOptimizer` dwell plans for Cyberjaya stations. Incompatible
  stop registries are not geographically guessed; only named Shaftsbury is mapped.
- No measured OKU/elderly readiness scores, traffic-delay feed, or published
  timetable baseline exists. Those values remain unknown; existing demographic
  fixtures are explicitly mock. The offline 15–30 minute headway is a static
  **demo estimate**, not an operator timetable or guaranteed accessible arrival.
- Optional OpenAI Responses call uses `OPENAI_API_KEY` and `OPENAI_MODEL`
  (default `gpt-4.1-mini`), an 8-second timeout, no retries, and `store=False`.
  Missing keys, provider failures, and telemetry failures return concise templates.
  Session IDs are accepted but no server conversation history is retained; include
  the stop name in each question. No keys are exposed to the browser.
- Embedded `CitizenChatWidget.jsx` in the Next.js dashboard with quick questions,
  optimistic bubbles, loading state, bounded requests, keyboard focus/Escape,
  live announcements, reduced motion, and dark/light CSS theme support.
- Codex implements this explicitly requested backend/frontend feature; normal
  Claude or human review remains required before merge.
- Verification: all 52 tests in `tests/` passed (six new chat tests); frontend
  lint, TypeScript check, and production build passed. Tests isolate the DB and
  mock OpenAI. Browser visual verification was blocked by the in-app webview
  attachment timeout; no live paid OpenAI request was made.
- From the repository root run `python -m uvicorn app.main:app --app-dir backend_api`;
  alternatively the existing `cd backend_api` launch continues to work.


- Real map provider (Leaflet/Mapbox) vs. continued SVG-grid mock for demo
  day — depends on whether we get an API key and network access at the
  venue.
- Transport for live updates: WebSocket vs. polling — decide once Codex's
  backend milestone 3 lands.
