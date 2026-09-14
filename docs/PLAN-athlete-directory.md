# Coach-Filtered Athlete Directory Plan

Status: planned (not started)
Owner: plan approved 2026-09-14 — waiting for go

Companion plans: `PLAN-nav-ia.md`, `PLAN-batch-transfers.md`,
`PLAN-activity-metrics-progress.md`.

## Goal

Let coaches (and admins) **browse and search athletes by coach**, without
dropdowns. Type/search a coach name (e.g. "Coach A") and only that coach's
athletes show — a readable directory instead of guessing from dropdowns.

## Current state (facts from code)

- Coach `/athletes` (`next-app/pages/athletes.js`) shows only the coach's own
  roster (`athletes` = `where coachId = own`) plus uncoached athletes in the
  transfer/claim panels. There is no directory of who is under which coach.
- Data already embeddable: athletes carry `coachId` + `coach` relation
  (schema.prisma:302-315); `allAthletes` (`OR: [{coachId: null},
  {coachId: {not: own}}]`, athletes.js:58) already exists server-side for
  coaches — so cross-coach visibility is structurally permitted.

## Approved design

- **Directory view on `/athletes`** for coaches and admins.
  - **Coach filter**: a search box over coach names. As you type, matching
    coaches appear as a **suggestion row list (no `<select>`/dropdown)**; pick
    one -> the list refreshes to show ONLY that coach's athletes.
    Example: search "Coach A" -> only Coach A's athletes show.
  - Clear the filter -> back to all athletes.
  - Each row: athlete name, code, sport, coach name, status. Sortable by name /
    code / sport. Nudo team lists who they belong to.
- **API**: extend `GET /api/athletes` with a `coach=` query (search/filter by
  coach name or id). Coach role gets read-only directory access to other
  coaches' athletes; editing stays restricted to own-roster/admin paths.
- No permission change to existing actions — viewing others' athletes is
  read-only (same as the transfer "claim" flow already exposes).
- Synergy: the same coach-filtered list can prefill the transfer compose
  checklist later (per `PLAN-batch-transfers.md`).

## Verification

- ESLint on changed files (0 errors), `npm run build`.
- Smoke: coach searches a coach name -> only that roster shows; clear restores
  all; no dropdowns anywhere; admin sees same directory.

## Files to touch

- `next-app/pages/athletes.js` — directory view + coach filter UI (no dropdowns)
- `next-app/pages/api/athletes/index.js` — `coach=` query support (filter/sort)
- `next-app/styles/Dashboard.module.css` — directory/filter styles