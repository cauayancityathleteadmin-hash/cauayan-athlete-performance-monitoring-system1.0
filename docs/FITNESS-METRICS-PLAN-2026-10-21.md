# Plan — Athlete Fitness Assessment Metrics for Training-Plan Activities

Date: 2026-10-21
Status: PART A DONE (2026-10-21) — B, C, D pending

## Progress log

### Part A — DONE (`fd5b7d2`, deployed, live-verified)
- Added `TIER_META` (label + rank + colour per tier) to `lib/starter-metrics.js`.
- Added `classifyFitnessValue(fitnessType, gender, birthdate, value)`:
  walks the DepEd tiers best→worst, honours direction (lower-is-better for
  times/recovery HR, higher-is-better for reps/cm), returns the tier, the band
  value, the next-better tier + the gap to it, and an `unverified` flag.
- Marked every norm block `verified: false` so the UI honestly shows "ref."
  (placeholder DepEd values — reference only until transcribed from the manual).
- Wire-up in `components/AthleteActivityManager.js`: every logged activity row
  now shows a tier badge (Excellent → Needs Improvement) under "Meets/Below
  target", plus a hint line "Very Good at 6.2 sec (−0.3 sec)".
- `pages/training-plans/[id]/athletes/[athleteId].js`: the athlete select now
  includes `gender` + `birthdate` (needed for sex/age norm lookup).
- Verified: node unit checks (both directions, all 7 fitness types, edge cases
  null/non-numeric), eslint 0 errors, `next build` OK, live health fresh,
  and the live athlete-page chunk (`2xgb76xkf2d8x.js`) contains the new tier
  strings (`nextTierLabel`, `Needs Improvement`, `Meets target`).


## The goal, in plain words

Right now a training activity has **one target** (e.g. "run 40m in 7.0s"). When a
coach logs the result we only say **"met" or "below"** — nothing more.

The user wants: after logging an activity, the system should **classify the
athlete** — are they **Excellent / Very Good / Good / Fair / Needs Improvement**
at that quality (fast, strong, quick, flexible, etc.). And over time build a
per-athlete **fitness profile** (how fast / how strong / how agile) that can be
compared across athletes, and eventually against Philippine school standards.

## What already exists (important — do NOT rebuild)

| Piece | Where | Status |
|---|---|---|
| "Quality" categories (fast/strong/agile/flexible/endurance/power/skill/recovery) | `FitnessDimension` enum + `lib/training-metrics.js` | built |
| DepEd-based normative norms per **sex × age group × 5 tiers** | `lib/starter-metrics.js` (cites **DepEd Order No. 34, s. 2019**) | built, but values are PLACEHOLDERS |
| Locked metric profile per fitness type (which columns/units) | `lib/training-metrics.js` | built |
| Activity targets pre-filled from the "Good" norm | `AddAthleteActivitiesForm` | built |
| Log a result → compare to target → met/below | `lib/activity-score.js`, `AthleteActivityManager.js` | built |
| Per-event performance metrics (assessment side) | `PerformanceMetric` model + `/admin/metrics` | built |

## The gap

1. A logged activity result is measured against **one target only** — there is
   **no classification** into the 5 DepEd tiers.
2. There is **no athlete fitness profile** aggregating speed/strength/etc.
3. The DepEd norm numbers in `starter-metrics.js` are **placeholders**, flagged
   in the file itself ("need to be transcribed from DepEd PFT Manual").
4. The norms live only in JS — no admin screen to view/correct them, and no
   record of which norm version was used when an athlete was classified.

## The plan (4 parts, each shippable on its own, safest first)

### Part A — Classification engine (no DB change)
- Add `lib/fitness-classify.js`: given `(fitnessType, sex, age, value)` return
  `{ tier, label, band }` using the existing `STARTER_NORMS`.
  - Respects direction: lower-is-better for times, higher-is-better for reps/cm.
  - Returns the tier word + the numeric band it fell into + the distance to the
    next tier ("close to Very Good").
- Wire it into `AthleteActivityManager` so each **logged** activity shows a tier
  badge (e.g. **Good**, trending to **Very Good**) next to met/below.
- Add a **"Fitness classification"** column to the per-athlete activity rows.
- Small, pure, testable. No migration. Nothing else can break.

### Part B — Real DepEd norm values (data only)
- Replace the placeholder numbers in `lib/starter-metrics.js` with the **actual
  DepEd PFT (DO 34, s. 2019) normative tables** for the standard battery:
  | Quality | Test | Unit | Direction |
  |---|---|---|---|
  | Endurance | 3-Minute Step Test (recovery HR) | bpm | lower better |
  | Strength | Push-Up (30 s) | reps | higher better |
  | Power | Standing Long Jump | cm | higher better |
  | Speed / Agility | 40-Meter Sprint | sec | lower better |
  | Mobility | Sit-and-Reach | cm | higher better |
  | Recovery | HR Recovery (post step test) | bpm | higher better |
  | Skill / Technique | Coordination (paper juggling) | reps | higher better |
- Age groups as DepEd uses them (10-11, 12-13, 14-15, 16-17, 18+), by sex.
- **Honesty rule:** where a value cannot be sourced with confidence, keep the
  existing number and mark it `unverified: true` so the UI can show "reference
  only" instead of pretending it is official. No invented numbers presented as
  official.
- Source note kept per fitness type (already the pattern in the file).

### Part C — Athlete fitness profile (DB-light)
- New admin-editable norm store so Cauayan can **correct/override** norms without
  a redeploy: one table `FitnessNorm` (fitnessType, sex, ageGroup, tier, value,
  sourceNote, verified) seeded from `starter-metrics.js`.
  - Migration via the project's safe path (`migrate diff` → folder → `migrate deploy`).
  - `lib/fitness-classify.js` reads DB first, falls back to the JS defaults —
    so the system works even before any admin edits.
- New section on the athlete profile (**Fitness** tab): a **radar/bar profile** of
  the athlete's latest tier per quality (Speed, Strength, Power, Endurance,
  Agility, Mobility, Recovery), with the date and the norm source.
  - Trend per quality over time (uses existing charts + `chart-config.js`).
  - Clearly labelled "based on DepEd PFT reference bands".
- Admin screen `/admin/metrics` gains a **"Fitness norms"** panel: view the full
  tier table per quality/sex/age and edit values, with a "Reset to DepEd default"
  action and a verified/unverified flag.

### Part D — Cross-athlete comparison & reports
- Coach/admin view: **squad fitness board** — athletes ranked by tier per quality
  (who is fastest / strongest / most agile), filter by sport/age/sex.
- Add the fitness profile to the **printable official report** as a formal section
  ("Physical Fitness Profile — DepEd PFT classification"), keeping the existing
  signature chain and formal layout.
- Standing/analytics tie-in: optional "fitness tier mix" summary per sport.

## Guardrails (project rules)

- One change at a time; backup first; lint + build; push; deploy; verify live.
- No theme change. Tokens only. Charts via `lib/chart-config.js`.
- No invented "official" numbers — unverified values are labelled as such.
- No athlete data-model field is added, so the athlete import template is
  unchanged; if that changes, update `lib/athlete-import-headers.js` + re-run the
  import round-trip in the same change.
- Report changes keep the formal structure and signature chain intact.

## Suggested order

A → B → C → D. Part A delivers visible value immediately with zero risk.
