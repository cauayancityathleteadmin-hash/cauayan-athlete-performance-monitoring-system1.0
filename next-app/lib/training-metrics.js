/* ============================================================================
   LOCKED FITNESS-TYPE METRICS — single source of truth for activity targets.

   Every fitness type has a FIXED, locked metric profile. Coaches cannot add,
   remove, or rename these fields; there is no "custom metric" option. Editing
   the locked set is an admin/developer data update ONLY (this file + the DB
   enum are the source), never something coaches change at runtime.

   Contract:
   - primaryMetric = the ActivityMetric used for scoring/completion (result
     grid, progress %, charts). Exactly one per type, never "none".
   - fields        = the exact fixed fields a coach sees for the type, in
     order. Each maps to a PlanActivity target column:
         targetTimeSec, targetDistance, targetLoad, targetReps,
         targetSets, targetQuantity
     `units`: when a field has units, it needs a unit picker (its selected
     value is stored in `targetUnit`). Only ONE field per profile carries
     units so the single targetUnit column stays unambiguous.
     `fixedUnit`: a static unit label shown next to the input (not stored).
   - units         = the flat unit list used by the API to validate
     `targetUnit` (server-side lock).

   Display labels for fitness types come from here too (FITNESS_OPTIONS),
   so every page/Dropdown renders the same wording.
   ========================================================================== */

export const FITNESS_TYPES = ["endurance", "strength", "power", "speed_agility", "skill_technique", "mobility", "recovery"];

export const METRIC_TYPES = ["time", "distance", "load", "reps", "sets", "quantity", "none"];

export const FITNESS_TYPE_METRICS = {
  endurance: {
    label: "Endurance",
    primaryMetric: "time",
    units: ["km", "m", "miles"],
    fields: [
      { key: "targetTimeSec", metric: "time", label: "Time target", fixedUnit: "sec" },
      { key: "targetDistance", metric: "distance", label: "Distance", units: ["km", "m", "miles"] },
    ],
  },
  strength: {
    label: "Strength",
    primaryMetric: "load",
    units: ["kg", "lb"],
    fields: [
      { key: "targetLoad", metric: "load", label: "Load", units: ["kg", "lb"] },
      { key: "targetReps", metric: "reps", label: "Reps" },
      { key: "targetSets", metric: "sets", label: "Sets" },
    ],
  },
  power: {
    label: "Power",
    primaryMetric: "load",
    units: ["kg", "lb"],
    fields: [
      { key: "targetLoad", metric: "load", label: "Load", units: ["kg", "lb"] },
      { key: "targetReps", metric: "reps", label: "Reps" },
    ],
  },
  speed_agility: {
    label: "Speed / Agility",
    primaryMetric: "time",
    units: ["m"],
    fields: [
      { key: "targetTimeSec", metric: "time", label: "Time target", fixedUnit: "sec" },
      { key: "targetDistance", metric: "distance", label: "Distance", units: ["m"] },
    ],
  },
  skill_technique: {
    label: "Skill / Technique",
    primaryMetric: "reps",
    units: [],
    fields: [
      { key: "targetReps", metric: "reps", label: "Reps" },
      { key: "targetSets", metric: "sets", label: "Sets" },
    ],
  },
  mobility: {
    label: "Mobility",
    primaryMetric: "time",
    units: [],
    fields: [
      { key: "targetTimeSec", metric: "time", label: "Time target", fixedUnit: "sec" },
      { key: "targetReps", metric: "reps", label: "Reps" },
    ],
  },
  recovery: {
    label: "Recovery",
    primaryMetric: "quantity",
    units: ["sessions", "min", "hr"],
    fields: [
      { key: "targetQuantity", metric: "quantity", label: "Quantity", units: ["sessions", "min", "hr"] },
    ],
  },
};

/* Defensive default for unknown/legacy values (keeps create paths safe). */
export const FALLBACK_PROFILE = {
  label: "Activity",
  primaryMetric: "quantity",
  units: [],
  fields: [],
};

export function metricProfileFor(fitnessType) {
  return FITNESS_TYPE_METRICS[fitnessType] || FALLBACK_PROFILE;
}

export function primaryMetricFor(fitnessType) {
  return metricProfileFor(fitnessType).primaryMetric;
}

export function metricFieldsFor(fitnessType) {
  return metricProfileFor(fitnessType).fields;
}

/* Which PlanActivity target columns the type actually uses (for server
   sanitizing: any field outside this set gets nulled on create/update). */
export function allowedTargetKeysFor(fitnessType) {
  return new Set(metricFieldsFor(fitnessType).map((f) => f.key));
}

/* The units that are valid for targetUnit on this type (locked). */
export function unitOptionsFor(fitnessType) {
  return metricProfileFor(fitnessType).units;
}

/* Default unit pick for new rows (first field that carries units). */
export function defaultUnitFor(fitnessType) {
  const withUnits = metricFieldsFor(fitnessType).find((f) => f.units && f.units.length);
  return withUnits && withUnits.units.length ? withUnits.units[0] : "";
}

/* { value, label } options for fitness-type dropdowns, same order as the DB
   enum for consistent presentation. */
export const FITNESS_OPTIONS = FITNESS_TYPES.map((v) => ({ value: v, label: FITNESS_TYPE_METRICS[v].label }));

/* ============================================================================
   TRAINING PLAN TYPES — Normal vs Pre-Conditioning.

   `planType` on a training plan is fixed at creation (never edited later).
   It decides which fitness types are offered when adding activities and
   whether a target is required. See docs/PLAN-training-plan-types.md.
   ========================================================================== */

export const PLAN_TYPES = ["normal", "pre_conditioning"];

export const PLAN_TYPE_META = {
  normal: {
    label: "Normal Training",
    description: "Regular practice and skill-building.",
  },
  pre_conditioning: {
    label: "Pre-Conditioning",
    description: "Preparing an athlete for an upcoming competition. Stricter tracking, focused on conditioning.",
  },
};

export const PLAN_TYPE_OPTIONS = PLAN_TYPES.map((v) => ({ value: v, ...PLAN_TYPE_META[v] }));

/* Which fitness types a plan type offers when adding activities.
   Normal uses the full locked set; Pre-Conditioning focuses on
   conditioning (power + skill_technique excluded). */
export const FITNESS_TYPES_BY_PLAN_TYPE = {
  normal: FITNESS_TYPES,
  pre_conditioning: ["endurance", "strength", "speed_agility", "mobility", "recovery"],
};

export function fitnessTypesForPlanType(planType) {
  return FITNESS_TYPES_BY_PLAN_TYPE[planType] || FITNESS_TYPES;
}

export function fitnessTypeAllowedForPlanType(planType, fitnessType) {
  return fitnessTypesForPlanType(planType).includes(fitnessType);
}

/* Comparison direction per metric for "Meets target":
   - time     → lower is better (beat-or-equal the target by going under)
   - distance → higher is better (targetDistance)
   - load     → higher is better (targetLoad)
   - reps     → higher is better (targetReps)
   - sets     → higher is better (targetSets)
   - quantity → higher is better (targetQuantity) */
export const BETTER_DIRECTION = {
  time: "lower",
  distance: "higher",
  load: "higher",
  reps: "higher",
  sets: "higher",
  quantity: "higher",
};

export function betterDirectionFor(metric) {
  return BETTER_DIRECTION[metric] || "higher";
}

/* The target column that carries the scoring value for a metric — i.e. the
   one that must be set on a Pre-Conditioning activity (its primary metric). */
const PRIMARY_TARGET_KEY = {
  time: "targetTimeSec",
  distance: "targetDistance",
  load: "targetLoad",
  reps: "targetReps",
  sets: "targetSets",
  quantity: "targetQuantity",
};

export function primaryTargetKeyFor(fitnessType) {
  return PRIMARY_TARGET_KEY[primaryMetricFor(fitnessType)];
}