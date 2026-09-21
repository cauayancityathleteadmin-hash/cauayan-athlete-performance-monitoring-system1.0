/* ============================================================================
   STARTER NORMS — DepEd PFT-based normative reference values for target suggestions.

   Source: DepEd Order No. 34, s. 2019 — "Revised Physical Fitness Tests Manual"
   Classification: Excellent (5) / Very Good (4) / Good (3) / Fair (2) / Needs Improvement (1)

   These are DEFAULT SUGGESTIONS only — coaches override per activity.
   Admins can edit/update via the Metrics Management screen.
   ========================================================================== */

// Age group labels matching DepEd PFT manual groupings
export const AGE_GROUPS = ["10-11", "12-13", "14-15", "16-17", "18+"];

// Classification tiers (DepEd 1-5 scale, but we use the descriptive labels)
export const CLASSIFICATION_TIERS = ["excellent", "veryGood", "good", "fair", "needsImprovement"];

// Default classification to use as starter target (middle = "good")
export const DEFAULT_STARTER_TIER = "good";

/**
 * Normative reference values by fitness type, sex, and age group.
 * Structure: STARTER_NORMS[fitnessType].norms[sex][ageGroup][tier] = numeric value
 *
 * VALUES BELOW ARE PLACEHOLDERS — need to be transcribed from DepEd PFT Manual.
 * Admins can correct via the Metrics Management screen.
 */
export const STARTER_NORMS = {
  // endurance → 3-Minute Step Test (Recovery Heart Rate, bpm at 1 min post-exercise)
  // Lower recovery HR = better cardiovascular fitness
  endurance: {
    label: "Endurance",
    test: "3-Minute Step Test (Recovery HR)",
    primaryMetric: "time",          // maps to targetTimeSec in activity
    unit: "bpm",
    betterDirection: "lower",
    description: "Heart rate (bpm) 1 minute after 3-minute step test. Lower = better recovery.",
    norms: {
      male: {
        "10-11": { excellent: 80, veryGood: 88, good: 96, fair: 105, needsImprovement: 115 },
        "12-13": { excellent: 78, veryGood: 86, good: 94, fair: 103, needsImprovement: 112 },
        "14-15": { excellent: 75, veryGood: 83, good: 91, fair: 100, needsImprovement: 109 },
        "16-17": { excellent: 72, veryGood: 80, good: 88, fair: 97, needsImprovement: 106 },
        "18+":   { excellent: 70, veryGood: 78, good: 86, fair: 95, needsImprovement: 104 },
      },
      female: {
        "10-11": { excellent: 85, veryGood: 93, good: 101, fair: 110, needsImprovement: 120 },
        "12-13": { excellent: 83, veryGood: 91, good: 99, fair: 108, needsImprovement: 117 },
        "14-15": { excellent: 80, veryGood: 88, good: 96, fair: 105, needsImprovement: 114 },
        "16-17": { excellent: 78, veryGood: 86, good: 94, fair: 103, needsImprovement: 112 },
        "18+":   { excellent: 76, veryGood: 84, good: 92, fair: 101, needsImprovement: 110 },
      },
    },
  },

  // strength → Push-Up (max reps in 30 seconds)
  strength: {
    label: "Strength",
    test: "Push-Up (30 sec)",
    primaryMetric: "reps",          // maps to targetReps
    unit: "reps",
    betterDirection: "higher",
    description: "Maximum push-ups in 30 seconds. Higher = stronger.",
    norms: {
      male: {
        "10-11": { excellent: 25, veryGood: 20, good: 15, fair: 10, needsImprovement: 5 },
        "12-13": { excellent: 30, veryGood: 24, good: 18, fair: 12, needsImprovement: 7 },
        "14-15": { excellent: 35, veryGood: 28, good: 21, fair: 14, needsImprovement: 8 },
        "16-17": { excellent: 40, veryGood: 32, good: 24, fair: 16, needsImprovement: 9 },
        "18+":   { excellent: 45, veryGood: 36, good: 27, fair: 18, needsImprovement: 10 },
      },
      female: {
        "10-11": { excellent: 20, veryGood: 16, good: 12, fair: 8, needsImprovement: 4 },
        "12-13": { excellent: 24, veryGood: 19, good: 14, fair: 9, needsImprovement: 5 },
        "14-15": { excellent: 28, veryGood: 22, good: 16, fair: 11, needsImprovement: 6 },
        "16-17": { excellent: 30, veryGood: 24, good: 18, fair: 12, needsImprovement: 7 },
        "18+":   { excellent: 32, veryGood: 25, good: 19, fair: 13, needsImprovement: 8 },
      },
    },
  },

  // power → Standing Long Jump (cm)
  power: {
    label: "Power",
    test: "Standing Long Jump",
    primaryMetric: "distance",      // maps to targetDistance
    unit: "cm",
    betterDirection: "higher",
    description: "Best of 3 attempts, measured in centimeters. Higher = more explosive power.",
    norms: {
      male: {
        "10-11": { excellent: 180, veryGood: 160, good: 140, fair: 120, needsImprovement: 100 },
        "12-13": { excellent: 200, veryGood: 180, good: 160, fair: 140, needsImprovement: 120 },
        "14-15": { excellent: 220, veryGood: 200, good: 180, fair: 160, needsImprovement: 140 },
        "16-17": { excellent: 240, veryGood: 220, good: 200, fair: 180, needsImprovement: 160 },
        "18+":   { excellent: 250, veryGood: 230, good: 210, fair: 190, needsImprovement: 170 },
      },
      female: {
        "10-11": { excellent: 160, veryGood: 145, good: 130, fair: 115, needsImprovement: 100 },
        "12-13": { excellent: 175, veryGood: 160, good: 145, fair: 130, needsImprovement: 115 },
        "14-15": { excellent: 190, veryGood: 175, good: 160, fair: 145, needsImprovement: 130 },
        "16-17": { excellent: 200, veryGood: 185, good: 170, fair: 155, needsImprovement: 140 },
        "18+":   { excellent: 210, veryGood: 195, good: 180, fair: 165, needsImprovement: 150 },
      },
    },
  },

  // speed_agility → 40-Meter Sprint (seconds)
  speed_agility: {
    label: "Speed / Agility",
    test: "40-Meter Sprint",
    primaryMetric: "time",          // maps to targetTimeSec
    unit: "sec",
    betterDirection: "lower",
    description: "Time in seconds for 40m sprint. Lower = faster.",
    norms: {
      male: {
        "10-11": { excellent: 6.2, veryGood: 6.6, good: 7.0, fair: 7.5, needsImprovement: 8.0 },
        "12-13": { excellent: 6.0, veryGood: 6.4, good: 6.8, fair: 7.2, needsImprovement: 7.7 },
        "14-15": { excellent: 5.8, veryGood: 6.2, good: 6.6, fair: 7.0, needsImprovement: 7.5 },
        "16-17": { excellent: 5.6, veryGood: 6.0, good: 6.4, fair: 6.8, needsImprovement: 7.2 },
        "18+":   { excellent: 5.5, veryGood: 5.9, good: 6.3, fair: 6.7, needsImprovement: 7.1 },
      },
      female: {
        "10-11": { excellent: 6.8, veryGood: 7.2, good: 7.6, fair: 8.1, needsImprovement: 8.6 },
        "12-13": { excellent: 6.6, veryGood: 7.0, good: 7.4, fair: 7.9, needsImprovement: 8.4 },
        "14-15": { excellent: 6.4, veryGood: 6.8, good: 7.2, fair: 7.7, needsImprovement: 8.2 },
        "16-17": { excellent: 6.3, veryGood: 6.7, good: 7.1, fair: 7.6, needsImprovement: 8.1 },
        "18+":   { excellent: 6.2, veryGood: 6.6, good: 7.0, fair: 7.5, needsImprovement: 8.0 },
      },
    },
  },

  // skill_technique → Paper Juggling / Coordination (reps)
  // Note: No exact DepEd general test equivalent — using coordination subtest as reference
  skill_technique: {
    label: "Skill / Technique",
    test: "Paper Juggling (Coordination)",
    primaryMetric: "reps",          // maps to targetReps
    unit: "reps",
    betterDirection: "higher",
    description: "Coordination repetitions (e.g., paper juggling cycles). Higher = better coordination.",
    norms: {
      male: {
        "10-11": { excellent: 50, veryGood: 40, good: 30, fair: 20, needsImprovement: 10 },
        "12-13": { excellent: 55, veryGood: 44, good: 33, fair: 22, needsImprovement: 11 },
        "14-15": { excellent: 60, veryGood: 48, good: 36, fair: 24, needsImprovement: 12 },
        "16-17": { excellent: 65, veryGood: 52, good: 39, fair: 26, needsImprovement: 13 },
        "18+":   { excellent: 70, veryGood: 56, good: 42, fair: 28, needsImprovement: 14 },
      },
      female: {
        "10-11": { excellent: 48, veryGood: 38, good: 28, fair: 18, needsImprovement: 9 },
        "12-13": { excellent: 52, veryGood: 42, good: 31, fair: 21, needsImprovement: 10 },
        "14-15": { excellent: 56, veryGood: 45, good: 34, fair: 23, needsImprovement: 11 },
        "16-17": { excellent: 60, veryGood: 48, good: 36, fair: 24, needsImprovement: 12 },
        "18+":   { excellent: 64, veryGood: 51, good: 38, fair: 25, needsImprovement: 13 },
      },
    },
    sourceNote: "Based on DepEd PFT coordination subtest; no exact sport-specific standard in general PFT. Check NSA for sport-specific norms.",
  },

  // mobility → Sit and Reach (cm)
  mobility: {
    label: "Mobility",
    test: "Sit and Reach",
    primaryMetric: "distance",      // maps to targetDistance
    unit: "cm",
    betterDirection: "higher",
    description: "Sit-and-reach distance in cm. Higher = better hamstring/lower back flexibility.",
    norms: {
      male: {
        "10-11": { excellent: 30, veryGood: 25, good: 20, fair: 15, needsImprovement: 10 },
        "12-13": { excellent: 32, veryGood: 27, good: 22, fair: 17, needsImprovement: 12 },
        "14-15": { excellent: 34, veryGood: 29, good: 24, fair: 19, needsImprovement: 14 },
        "16-17": { excellent: 35, veryGood: 30, good: 25, fair: 20, needsImprovement: 15 },
        "18+":   { excellent: 36, veryGood: 31, good: 26, fair: 21, needsImprovement: 16 },
      },
      female: {
        "10-11": { excellent: 35, veryGood: 30, good: 25, fair: 20, needsImprovement: 15 },
        "12-13": { excellent: 37, veryGood: 32, good: 27, fair: 22, needsImprovement: 17 },
        "14-15": { excellent: 39, veryGood: 34, good: 29, fair: 24, needsImprovement: 19 },
        "16-17": { excellent: 40, veryGood: 35, good: 30, fair: 25, needsImprovement: 20 },
        "18+":   { excellent: 41, veryGood: 36, good: 31, fair: 26, needsImprovement: 21 },
      },
    },
  },

  // recovery → HR Recovery after 3-min step test (bpm drop in 1 min)
  recovery: {
    label: "Recovery",
    test: "HR Recovery (Post Step Test)",
    primaryMetric: "quantity",      // maps to targetQuantity
    unit: "bpm",
    betterDirection: "higher",      // larger drop = better recovery
    description: "Heart rate drop (bpm) from peak to 1 min post-exercise. Higher = better autonomic recovery.",
    norms: {
      male: {
        "10-11": { excellent: 40, veryGood: 35, good: 30, fair: 25, needsImprovement: 20 },
        "12-13": { excellent: 42, veryGood: 37, good: 32, fair: 27, needsImprovement: 22 },
        "14-15": { excellent: 44, veryGood: 39, good: 34, fair: 29, needsImprovement: 24 },
        "16-17": { excellent: 46, veryGood: 41, good: 36, fair: 31, needsImprovement: 26 },
        "18+":   { excellent: 48, veryGood: 43, good: 38, fair: 33, needsImprovement: 28 },
      },
      female: {
        "10-11": { excellent: 38, veryGood: 33, good: 28, fair: 23, needsImprovement: 18 },
        "12-13": { excellent: 40, veryGood: 35, good: 30, fair: 25, needsImprovement: 20 },
        "14-15": { excellent: 42, veryGood: 37, good: 32, fair: 27, needsImprovement: 22 },
        "16-17": { excellent: 44, veryGood: 39, good: 34, fair: 29, needsImprovement: 24 },
        "18+":   { excellent: 46, veryGood: 41, good: 36, fair: 31, needsImprovement: 26 },
      },
    },
  },
};

/**
 * Get the age group label for an athlete's birthdate.
 * Matches DepEd PFT age groupings.
 */
export function ageGroupFor(birthdate) {
  if (!birthdate) return "18+";
  const age = Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  if (age <= 11) return "10-11";
  if (age <= 13) return "12-13";
  if (age <= 15) return "14-15";
  if (age <= 17) return "16-17";
  return "18+";
}

/**
 * Normalize AthleteGender to norms sex key.
 */
export function sexFor(gender) {
  if (gender === "male") return "male";
  if (gender === "female") return "female";
  return "male"; // fallback for other/prefer_not_to_say
}

/**
 * Get the starter norm value for a fitness type, athlete gender, and birthdate.
 * Returns the DEFAULT_STARTER_TIER (good) band value with metadata.
 */
export function getStarterNorm(fitnessType, gender, birthdate) {
  const norm = STARTER_NORMS[fitnessType];
  if (!norm) return null;

  const ageGroup = ageGroupFor(birthdate);
  const sex = sexFor(gender);
  const tierNorms = norm.norms?.[sex]?.[ageGroup];
  if (!tierNorms) return null;

  const value = tierNorms[DEFAULT_STARTER_TIER];
  if (value === undefined) return null;

  return {
    fitnessType,
    test: norm.test,
    value,
    unit: norm.unit,
    tier: DEFAULT_STARTER_TIER,
    ageGroup,
    sex,
    betterDirection: norm.betterDirection,
    primaryMetric: norm.primaryMetric,
    description: norm.description,
    sourceNote: norm.sourceNote || "DepEd Order No. 34, s. 2019 — PFT Manual",
  };
}

/**
 * Get all classification tiers for a fitness type/sex/age group.
 * Used by admin management screen to display full norm table.
 */
export function getAllTiers(fitnessType, sex, ageGroup) {
  const norm = STARTER_NORMS[fitnessType];
  if (!norm) return null;
  return norm.norms?.[sex]?.[ageGroup] || null;
}

/**
 * Get all age groups for a fitness type and sex.
 */
export function getAgeGroups(fitnessType, sex) {
  const norm = STARTER_NORMS[fitnessType];
  if (!norm) return [];
  return Object.keys(norm.norms?.[sex] || {});
}

/**
 * Update a norm value (used by admin management screen).
 * This mutates the in-memory object — persist to DB via SystemSetting or dedicated table.
 */
export function updateNorm(fitnessType, sex, ageGroup, tier, value) {
  const norm = STARTER_NORMS[fitnessType];
  if (!norm) return false;
  if (!norm.norms[sex] || !norm.norms[sex][ageGroup]) return false;
  if (norm.norms[sex][ageGroup][tier] === undefined) return false;

  norm.norms[sex][ageGroup][tier] = Number(value);
  return true;
}

/**
 * Get the primary target key for a fitness type (delegates to training-metrics).
 * Kept here for convenience.
 */
export function primaryTargetKeyFor(fitnessType) {
  const norm = STARTER_NORMS[fitnessType];
  if (!norm) return null;
  const map = {
    time: "targetTimeSec",
    distance: "targetDistance",
    load: "targetLoad",
    reps: "targetReps",
    sets: "targetSets",
    quantity: "targetQuantity",
  };
  return map[norm.primaryMetric] || null;
}