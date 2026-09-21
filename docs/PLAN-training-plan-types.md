# Training Plan Types — Normal vs Pre-Conditioning

Combined design + execution doc for the Normal / Pre-Conditioning training plan
types. Work happens phase by phase; each phase ends with a test-and-verify step
before the next begins.

Ground rules (locked):
- Existing trainings keep working unchanged — every plan already in the system
  defaults to **Normal**.
- Theme is unchanged.
- Training Detail tabs reuse the existing `components/PageSectionTabs.js` —
  no second tab implementation.
- Test Normal and Pre-Conditioning **separately** at every phase from Phase 2.

---

## Phase 1 — Decision (RESOLVED): Coach-set targets per activity

**"Strict" for Pre-Conditioning is implemented as coach-set target values per
activity.** The metric fields stay locked per fitness type (see
`lib/training-metrics.js`); what the coach sets is the **goal for that specific
activity** against the metric — e.g. the metric stays "100m sprint time" but the
coach sets the target "under 15 seconds".

- The mechanism is the same everywhere: any activity (Normal or
  Pre-Conditioning) may carry a coach-set target.
- Pre-Conditioning makes it matter most: there the target is **required**
  (readiness check). For Normal it is **optional**.
- "Met" is computed per-metric with the right comparison direction:
  - **time** → lower is better (targetTimeSec)
  - **distance** → higher is better (targetDistance)
  - **load** → higher is better (targetLoad)
  - **reps** → higher is better (targetReps)
  - **sets** → higher is better (targetSets)
  - **quantity** → higher is better (targetQuantity)
- Reading: an athlete's recorded value "Meets target" only when it beats or
  equals the target in the correct direction (≤ for time, ≥ for everything
  else).

No code change in Phase 1 — decision only. This document is the final record.

---

## Phase 2 — Plan Type field (locked after creation)

- New `planType` column on `training_plans`, values `normal` /
  `pre_conditioning`, default `normal` (existing rows → Normal, no data change).
- Create Training form shows a two-option selector (cards) with short
  descriptions:
  - **Normal Training** — Regular practice and skill-building.
  - **Pre-Conditioning** — Preparing an athlete for an upcoming competition.
    Stricter tracking, focused on conditioning.
- The type is set once at creation and is **not editable afterwards** (PUT
  rejects `planType`). Wrong pick → create a new plan.
- Duplicate (`action=duplicate`) carries the source template's plan type.

Status: pending.

## Phase 3 — Metrics per plan type + target reference

| Plan type          | Fitness types shown in activity creation                                  |
| ------------------ | ------------------------------------------------------------------------- |
| Normal             | all 7 (endurance, strength, power, speed_agility, skill_technique, mobility, recovery) |
| Pre-Conditioning   | endurance, strength, speed_agility, mobility, recovery (power + skill_technique excluded) |

Single source of truth: `lib/training-metrics.js`
(`FITNESS_TYPES_BY_PLAN_TYPE`, `BETTER_DIRECTION`, plan-type labels/descriptions).
Target unit and comparison direction for each metric are the Phase 1 table above.

Status: pending.

## Phase 4 — Plan-type metrics + targets in activity creation

- Activity creation shows only the fitness types relevant to the plan type.
- Target field follows the metric's unit (existing target columns:
  `targetTimeSec`, `targetDistance`, `targetLoad`, `targetReps`, `targetSets`,
  `targetQuantity`).
- Target **required** for Pre-Conditioning activities, optional for Normal.
- Once a value is recorded, show a "Meets target / Below target" indicator
  using the per-metric comparison direction.

Status: pending.

## Phase 5 — Add Activities form layout & input formatting

Uniform label style/height/spacing, sensible field grid (short fields share
rows), grouped by metric. Must work for both plan-type field sets and mobile;
must still save correctly after any layout change.

Status: pending.

## Phase 6 — Training Detail tabs

Training Detail already has tabs via `PageSectionTabs.js`
(`overview` / `trends` / `roster`). This phase confirms the sections qualify,
matches labels to actual content, and verifies deep-links + sticky + both plan
types + mobile.

Status: pending.

## Phase 7 — Training List separated by plan type

Segmented control **All / Normal / Pre-Conditioning** on the Training list
(default **All**), reflected in the URL query so it survives refresh. Combines
with existing search/status/sport filters. Subtle type badge on each row.

Status: pending.

## Phase 8 — Full regression

Create both types, add activities through the fixed form, verify metrics +
layout per type, legacy plans work as Normal, tabs work for both, list toggle
combines with filters, charts/scoring/rosters intact, mobile + console clean.