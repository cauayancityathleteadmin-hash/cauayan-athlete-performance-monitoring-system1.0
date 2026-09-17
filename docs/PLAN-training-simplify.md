# PLAN: Training simplify — activity notes + one assessment per athlete

Status: implemented 2026-09-15 (approved by user, "yes go")
Owner: Q&A 2026-09-15 — decisions locked below.

Companion plans: `PLAN-nav-drill-comments.md`, `PLAN-activity-metrics-progress.md`,
`PLAN-training-consistency.md`. This plan simplifies (does not replace) those.

## Why (user request)

Training data-entry and storage is redundant: per-activity 0–10 scores AND an
athlete rating AND athlete-level "guidance" comments AND per-activity comments all
overlap. The user wants exactly two inputs, both already built:

1. **Notes per athlete per activity** — written by the admin, read by the coach
   (admin-only POST is already enforced in the API).
2. **One assessment per athlete per training** — a 1–10 rating + optional comment.

Everything duplicated (guidance comments, per-activity scores, auto-score math,
the dead `bulk-assess` endpoint, the "Score metric" naming) is removed. Progress
monitoring (Status done / partial / missed + amount done + completion charts) is
kept everywhere it exists.

## Decisions locked (Q&A 2026-09-15)

1. Progress monitoring stays: Done / Partial / Missed + amount done per activity,
   with training charts, athlete drill charts, and the Progress overview page.
2. Per-activity score 0–10 is removed (no auto-calc, no manual score cell, no
   score columns/charts/rollups).
3. Assessment = ONE row per athlete per training, replaced when re-assessed
   (`@@unique([planId, athleteId])`). No history for now.
4. "Metric" on activity forms is renamed "What to measure".
5. Athlete-level "Guidance" comments (`AthletePlanComment` model + UI + API) are
   deleted; per-activity comments (`ActivityPlanComment`) remain.
6. Legacy session/exercise tables stay (still used by Reports/Dashboard/seed).

## What changes

- `prisma/schema.prisma`: drop `PlanActivityLog.score`; drop `AthletePlanComment`
  model + inverse relation fields; `TrainingAssessment.planId` required, drop
  `sessionId`/`session`, add `@@unique([planId, athleteId])`.
- Delete API `pages/api/training-plans/[id]/athlete/[athleteId]/comments.js`
  (guidance) and `pages/api/plan-activity-logs/bulk-assess.js`.
- `pages/api/plan-activity-logs/batch-assess.js`: remove score; upsert the
  athlete assessment on `planId_athleteId`.
- `pages/api/progress.js`: score rollups → latest assessment rating; detail
  summary gains `rating`.
- Pages: detail `training-plans/[id]` (guidance panel, roster guidance column,
  score cell/state/payload/undo, "Score metric" label), drill
  `athletes/[athleteId]` (guidance section, score chart/columns, "Avg score" →
  "Coach rating"), `pages/progress` ("Avg score" → "Rating").

## Risks / notes

- Applying `@@unique([planId, athleteId])` requires no null/duplicate rows in
  `training_assessments`; verified before `prisma db push`.
- Vercel build-time `prisma db push` fails P3005 and is skipped; schema must be
  pushed manually before deploy.
- Undo after save restores activity statuses but keeps the stored rating
  (pre-existing behavior, still true with upsert).