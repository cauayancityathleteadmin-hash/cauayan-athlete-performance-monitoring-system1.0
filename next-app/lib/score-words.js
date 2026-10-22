/* Plain-word scoring layer on top of the existing norm engine.
   No new metric, no schema change. Maps each fitness type to a short
   "fast/slow", "strong/weak" pair so coaches/athletes read results at a glance.
   The underlying bands and numbers still come from STARTER_NORMS / admin
   overrides (see lib/starter-metrics.js + /admin/metrics). */

const WORD_PAIRS = {
  speed_agility: { better: "Fast", worse: "Slow" },
  endurance: { better: "High stamina", worse: "Low stamina" },
  strength: { better: "Strong", worse: "Weak" },
  power: { better: "Explosive", worse: "Low power" },
  skill_technique: { better: "Sharp", worse: "Needs work" },
  mobility: { better: "Flexible", worse: "Tight" },
  recovery: { better: "Fast recovery", worse: "Slow recovery" },
};

const TIER_WORD = {
  excellent: "Very good",
  veryGood: "Good",
  good: "Good",
  fair: "Fair",
  needsImprovement: "Needs attention",
};

// Short phrase used in tight UI (tables, chips). Uses the pair for
// the fitness type when available; falls back to a neutral reading.
export function scoreWord(fitnessType, tier, direction) {
  const pair = WORD_PAIRS[fitnessType];
  if (pair) {
    if (tier === "excellent" || tier === "veryGood") return pair.better;
    if (tier === "good") return pair.better;
    if (tier === "fair") return pair.worse;
    if (tier === "needsImprovement") return pair.worse;
  }
  return TIER_WORD[tier] || null;
}

// A single "score" string like "Fast · Very Good" for display next to results.
// Falls back gracefully when classification isn't available.
export function activityScoreLabel(fitnessType, tierLabel, scoreWordLabel) {
  if (scoreWordLabel && tierLabel) return `${scoreWordLabel} · ${tierLabel}`;
  if (scoreWordLabel) return scoreWordLabel;
  if (tierLabel) return tierLabel;
  return null;
}

// Explanation shown in tooltips / coach view.
export function scoreWordExplanation(fitnessType) {
  const pair = WORD_PAIRS[fitnessType];
  if (!pair) return null;
  return `${pair.better} when you meet or beat the target band for this age/sex; ${pair.worse} when below the expected band. Bands are set in Admin → Metrics.`;
}

export const SCORE_WORD_PAIRS = WORD_PAIRS;
