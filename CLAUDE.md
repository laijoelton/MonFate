# CLAUDE.md — Quick Reference

Guidance for Claude sessions working in this repo. See [AGENTS.md](AGENTS.md)
for the full dual-agent contract; this file is the day-to-day cheat sheet.

## Project

MonFate — a dynamic, accessible transit & routing platform (SDG 11:
Sustainable Cities & Communities). Frontend gives riders a live accessible
map (obstacles, ramps, elevators, transit vehicles); backend ingests
obstacle reports, vehicle telemetry, and a trust-consensus score for
crowd-sourced accessibility data.

## Commands

### Frontend (`frontend/`)
```bash
cd frontend
npm install       # install deps
npm run dev       # dev server, http://localhost:3000
npm run build     # production build — must pass before every PR
npm run lint      # eslint
```

### Backend (`backend_api/`)
```bash
cd backend_api
python -m venv .venv && .venv/Scripts/activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload                    # once app/main.py exists
```

## Code style

- **TypeScript/React**: functional components, hooks only, no class
  components. Co-locate component-specific types next to the component.
  Tailwind for styling — no ad-hoc CSS files unless a Tailwind utility
  genuinely can't express it.
- **Icons**: Lucide React only, for consistency and accessibility (all
  icons ship with `aria-hidden` unless they're the only content of a
  control, in which case add an `aria-label`).
- **Accessibility is not optional**: every interactive element needs a
  visible focus state, sufficient color contrast, and keyboard support.
  This is the product's core value proposition — a11y regressions are
  treated as bugs, not polish.
- **Python**: Pydantic v2 models for all shared contracts, type-hinted
  throughout, `snake_case` for fields matching REST JSON (camelCase
  conversion happens at the frontend fetch boundary if needed).
- **Naming**: shared contract names (`ObstacleReport`, `TransitVehicle`,
  `AccessibilityRoute`) must match exactly between backend schema and
  frontend TypeScript types.

## PR review instructions

When reviewing a PR (Codex's or your own):

1. **Contract compliance** — does it match the shapes documented in
   `docs/PROJECT_STATE.md`? Flag silent shape drift.
2. **Build health** — `npm run build` (frontend) or the backend's test/
   import check must pass before approval.
3. **Accessibility** — any new UI must be keyboard-navigable and have
   correct ARIA roles/labels; any new data field that affects routing
   must consider wheelchair/tactile/elevator/stroller accessibility.
4. **Docs sync** — if architecture, contracts, or milestones changed,
   `docs/PROJECT_STATE.md` must be updated in the same PR.
5. **Guardrails** — no direct commits to `main`, no secrets, atomic
   commit history.

Leave review comments inline referencing `file:line`. Approve only once
build health and contract compliance are both verified.
