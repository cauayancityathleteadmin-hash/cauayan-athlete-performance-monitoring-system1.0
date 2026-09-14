# Activity Metrics + Progress Monitoring Plan (revised 2026-09-14)

Status: planned (not started)
Owner: plan revision approved — waiting for go

Companion plans: `PLAN-nav-ia.md` (Training sub-menu — Progress overview link),
`PLAN-batch-transfers.md`, `PLAN-athlete-directory.md`.

## Goal

Every training activity gets a measurable result metric (including a **time**
recording for races like the 100m run so coaches see how *fast* an athlete is),
a **target to beat** ("time limit"), a **score** (0-10), an **attempt count**,
and a real **Progress overview** page showing trends over weeks.

## Current state (facts from code)

- `PlanActivity` (schema.prisma:691-714) stores targets: `targetQuantity`,
  `targetUnit`, `targetSets/Reps`, `targetDistance`, `targetLoad`, plus
  `weekNumber`/`dayIndex`/`fitnessType`. **No time target exists.**
- `PlanActivityLog` (:716-734) records `status`, `quantityDone`, `setsDone`,
  `repsDone`, `notes`, `performedAt`. **No score, no attempts, no time/actual
  result, no distance/load result.**
- Session path precedent: `ExercisePerformance` (:607-632) has `durationSec`,
  `distanceCovered`, `loadUsed`, `score`, `scoreBreakdown` — the data set
  already knows "measured performance with a score".
- Standing assessment scale: `TrainingAssessment.rating` (0-10 vocabulary).
- Write paths: `pages/api/plan-activity-logs/batch-assess.js` and `bulk-assess.js`
  (bulk-assess now week-gated); grid UI in `pages/training-plans/[id].js`.
- Charts: recharts v3 (`package.json:26`), `components/Charts.js`
  (PALETTE, HBars, Donut, KPI).

## Approved design

### A. Per-activity metric definition (`PlanActivity`)

- **New `metricType`** enum: `time | distance | load | reps | sets | quantity |
  none` — declares what this activity measures (100m run = `time`).
- **New `targetTimeSec`** Int? — the "time limit" for timed activities
  (100m target = 14s).
- Direction is **derived**, no extra field: `time` = lower-is-better (faster);
  everything else = higher-is-better.
- Existing target fields reused for non-time metrics. When creating/editing an
  activity the coach picks the metric type and fills only that target.

### B. Result recorded per log (`PlanActivityLog`)

New nullable fields:

```prisma
timeSec        Decimal?  // actual measured time, e.g. 13.2s  (the "how fast")
distanceDone   Decimal?  // actual distance covered
loadUsed       Decimal?  // actual weight used
score          Decimal?  // 0-10 activity score (manual or auto)
attempts       Int?      // tries before the counted/final attempt; default 1
```

Existing `quantityDone` / `setsDone` / `repsDone` cover the other metric types.
Result fields mirror `ExercisePerformance` exactly (durationSec/distanceCovered/
loadUsed precedent). All nullable -> old rows untouched; plain `prisma db push`.

### C. Scoring — auto from metric, coach can override

For each log against its activity target:
- **higher-is-better** (distance/load/reps/sets/quantity): pct = done ÷ target;
  score = round(10 × pct), capped 0-10.
- **time** (lower-is-better): result ≤ target -> 10; otherwise
  score = round(10 × target ÷ result) (e.g. 14s target, 16s run -> 8.75).
- **none / missing result**: coach may still give a manual score 0-10.
- Manual score always allowed and wins over auto. UI shows the chip:
  `13.2s vs 14.0s target · auto 9.4 · manual 8`.

### D. Completion % (computed, same metric)

Result achieved ÷ target for that activity's metric type -> % shown next to the
score. No composite index; three readable signals: **score (quality), attempts
(mastery), completion % (volume)**.

### E. Entry points (extend existing assess loop)

Monitoring grid / batch-assess / bulk-assess gain, per activity per athlete:
the **measured result** input matching the metric (time / distance / load /
reps / sets / quantity), the **score** squeeze, and **attempts**. Week-lock
gate stays.

### F. Progress views — drill-down + roster overview (in scope)

Adviser structure fold-in (see `PLAN-nav-ia.md`): the per-athlete drill lives
inside the training plan, not as a separate top-level flow.

Read-only aggregation:
- `GET /api/progress?planId=&athleteId=` -> per-athlete week rows
  `{ completionPct, avgScore, avgAttempts, byDimension }`.

Views:
1. **Trainings** (`/training-plans`): list of plans.
2. **Training A** (`/training-plans/[planId]`): lands on **Squad view** (grid +
   metric inputs; primary weekly assess/record). Second tab **Athletes under
   this training** with completion %, avg score.
3. **Athlete's progress & activities**
   (`/training-plans/[planId]/athletes/[athleteId]`): that athlete's activities
   across weeks with score + attempts; **time trend for timed activities**
   (100m: 14.0s -> 13.5s -> 13.0s); result-vs-target gaps ("Week 3 squat target
   40kg -> 30kg, 4 attempts").
4. **Progress overview** (`/progress`, Training sub-link): roster-wide summary —
   all athletes across the coach's plans, who's training, who's slipping.

Charts: recharts (`components/Charts.js` + raw recharts), Analytics/Reports
styling.

## Build order (mandatory)

1. Schema (`metricType`, `targetTimeSec` on activity; `timeSec`,
   `distanceDone`, `loadUsed`, `score`, `attempts` on log) + `prisma db push`.
2. Activity editor sets metric type + target (time gets a target-time input).
3. Assess grid / batch-assess / bulk-assess accept and store result, score,
   attempts (auto-score + chip).
4. Plan page: **Squad view** tab (default, today's grid + new metric inputs) +
   **Athletes under this training** tab split for the drill.
5. Athlete drill page
   `/training-plans/[planId]/athletes/[athleteId]` (progress & activities).
6. `/api/progress` + `/progress` (roster overview) + wire Training sub-menu
   entries (Per-edict ships with step 5/6).

## Verification

- ESLint on changed files (0 errors), `npm run build`, `prisma db push`,
  `/api/health` after deploy.
- Smoke: create timed activity (100m, 14s); log 13.2s -> auto score; log 16s ->
  lower auto score; manual override works; plan page shows Athletes tab +
  Squad view; athlete drill page shows time trend; roster overview renders; nav
  sub-links present for coach and admin.

## Files to touch

- `next-app/prisma/schema.prisma` (`PlanActivity` +2, `PlanActivityLog` +5)
- `next-app/pages/api/plan-activity-logs/batch-assess.js` — metric inputs persist
- `next-app/pages/api/plan-activity-logs/bulk-assess.js` — metric inputs persist
- `next-app/pages/training-plans/[id].js` — Athletes tab + Squad view + grid
  inputs (result, score, attempts)
- `next-app/pages/training-plans/[id]/athletes/[athleteId].js` (new) — athlete
  drill page
- `next-app/pages/training-plans.js` + activity create/edit form (metric type)
- `next-app/pages/progress.js` (new) + `next-app/pages/api/progress/index.js` (new)
- `next-app/components/AppShell.js` — Training sub-links ("Trainings",
  "Progress overview")
- `next-app/styles/Dashboard.module.css` — grid/input/progress styles