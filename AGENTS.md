# AGENTS.md — Dual-Agent Rules of Engagement

MonFate is built by two agents working in parallel on separate concerns. This
document is the contract between them. Both agents must read it before
opening a PR and keep it current when responsibilities shift.

## Roles

### Codex — Backend & Edge Systems
- Backend API implementation (`backend_api/`)
- Edge RTOS firmware logic (obstacle/vehicle sensor loops)
- Simulated CV detection streams (mock camera/lidar obstacle feeds)
- Owns the runtime behavior behind the Pydantic contracts in
  `backend_api/app/schemas/`

### Claude — Architecture & Frontend
- Overall system architecture and API contracts
- Frontend map & dashboard (`frontend/`)
- PR code review for both agents' changes
- Keeps `docs/PROJECT_STATE.md` in sync with what's actually built

## Guardrails

1. **No direct pushes to `main`.** All work lands on a feature branch
   (`claude/*` or `codex/*`) and merges via pull request.
2. **PR required for every change**, including docs-only changes. A PR needs
   at least one review from the other agent (or the human maintainer) before
   merge.
3. **Atomic commits.** Each commit is a single logical change with a
   descriptive message (`feat:`, `fix:`, `docs:`, `chore:` prefixes). Avoid
   bundling unrelated changes.
4. **Contracts are the source of truth.** Changes to shared data shapes
   (`ObstacleReport`, `TransitVehicle`, `AccessibilityRoute`, trust
   consensus models) must be made in `backend_api/app/schemas/` first, then
   mirrored in any frontend TypeScript types. Do not let the two drift.
5. **Docs kept in sync.** Any change to architecture, contracts, or
   milestones must update `docs/PROJECT_STATE.md` in the same PR.
6. **No secrets committed.** API keys, tokens, and credentials belong in
   `.env.local` / `.env` files that are gitignored, never in source.

## Branch naming

- `claude/<topic>` — architecture, frontend, contracts, reviews
- `codex/<topic>` — backend, firmware, CV simulation

## PR review responsibilities

- Claude reviews Codex's backend/firmware PRs for contract compliance,
  API shape correctness, and integration risk with the frontend.
- Codex (or the human maintainer) reviews Claude's frontend/architecture
  PRs for feasibility against real backend constraints.
- Reviews should flag: breaking contract changes, missing accessibility
  considerations, and undocumented architecture drift.
