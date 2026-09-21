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

Implemented helpers (all in `lib/training-metrics.js`):
- `FITNESS_TYPES_BY_PLAN_TYPE` — `normal` → full `FITNESS_TYPES` list (source of
  truth stays the locked array); `pre_conditioning` →
  `[endurance, strength, speed_agility, mobility, recovery]`.
- `fitnessTypesForPlanType(planType)` — the offerable set for a plan type
  (unknown/legacy plan types fall back to Normal's full set).
- `fitnessTypeAllowedForPlanType(planType, fitnessType)` — boolean check used by
  the Add Activities form/API in Phase 4.
- `BETTER_DIRECTION` — per-metric comparison: `time → "lower"`,
  `distance/load/reps/sets/quantity → "higher"`; `betterDirectionFor(metric)`
  defaults to `"higher"` for anything unlisted.

Status: pending deployment verification.

## Phase 4 — Plan-type metrics + targets in activity creation

Implemented:
- **Fitness types offered** are filtered by plan type everywhere activities are
  added/edited (`components/AthleteActivityManager.js`): `fitnessTypesForPlanType`
  drives the add-form and edit-form dropdowns (`AthleteActivitiesBlock` + the
  `AddAthleteActivitiesForm`). Existing activities keep their current type in the
  edit dropdown even when it is outside the plan type's offerable set, so legacy
  rows stay editable.
- **Target required** for Pre-Conditioning (optional for Normal). The required
  value is the scoring (primary) target column for the activity's metric
  (`primaryTargetKeyFor(fitnessType)` in `lib/training-metrics.js`): e.g.
  endurance → `targetTimeSec`, strength → `targetLoad`, recovery →
  `targetQuantity`. Marked with a red `*` in the target fields
  (`LockedTargetFields`), enforced client-side on submit (add + edit) and
  server-side in `pages/api/plan-activities/index.js`:
  - bulk/create reject a missing primary target on Pre-Conditioning plans;
  - bulk/create reject fitness types outside the plan type's offerable set;
  - update blocks changing to a disallowed type (keeping an existing type is
    allowed) and re-checks the required target on save.
- **Meets target / Below target** indicator on each activity row (Athlete Detail
  → Activities): computed from the latest recorded log vs the activity target
  using `BETTER_DIRECTION` (`time` → lower is better; everything else → higher),
  shown as a small badge under the latest status: `Meets target` (accent) /
  `Below target` (warning). Hidden when there is no target or no recorded value.

Status: pending deployment verification.

## Phase 5 — Add Activities form layout & input formatting

Implemented (`components/AthleteActivityManager.js`, add + edit forms):
- Uniform input recipe across both forms: every add-form control now uses the
  shared `.fieldControl` class (same border/background/radius/padding/font as the
  edit form and `.formGrid`), so labels, heights and spacing match everywhere.
- Grouped by metric: each add-form row is a card with stacked sections — Name,
  then a **Fitness type + Targets** group (targets get a muted caption
  "Targets — required on Pre-Conditioning / optional on Normal"), then a shared
  Day (1–7) + Week row, then Instructions. The edit form gets the same Targets
  caption for parity.
- Short fields share rows (Day + Week); everything wraps on mobile via
  `flexWrap`; the card grid uses `--space-*` gaps only (no raw px).
- Layout-only change: save payloads and names are untouched, so the Phase 4 API
  enforcement (plan-type filter + required target) is unaffected.

Status: pending deployment verification.

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