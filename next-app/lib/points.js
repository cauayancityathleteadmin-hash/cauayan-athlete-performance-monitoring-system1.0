// Standing point engine — SINGLE SOURCE OF TRUTH for achievement ranking.
// Locked 2026-09-22 (see docs/PLAN-standing-achievements.md Phase 1).
// Modeled on Palarong Pambansa points and the DepEd Palarong incentive tiers.
// The old PointsConfig DB table and lib/backup.js "points_config" snapshot are
// superseded by these constants — nothing reads PointsConfig anymore.

// Event-type factor: individual and small teams (<=3) score full points;
// large teams (4+) score half, mirroring DepEd's ~2x individual-vs-team incentive.
export const EVENT_FACTORS = { individual: 1, smallTeam: 1, largeTeam: 0.5 };

// Record-breaking bonus: +20% of base points (DepEd record-holder incentive).
export const RECORD_BONUS = 0.2;

// Base points per competition level x medal (individual / small-team scale).
// "fourth" = 4th place scores a small amount; "participation" earns a token amount.
export const LEVEL_ORDER = ["intramural", "barangay", "city", "provincial", "regional", "national", "international"];

export const BASE_POINTS = {
  intramural:  { gold: 4, silver: 3, bronze: 2, fourth: 1, participation: 0 },
  barangay:    { gold: 6, silver: 4, bronze: 3, fourth: 2, participation: 1 },
  city:        { gold: 10, silver: 7, bronze: 5, fourth: 3, participation: 2 },
  provincial:  { gold: 15, silver: 11, bronze: 8, fourth: 5, participation: 3 },
  regional:    { gold: 22, silver: 16, bronze: 11, fourth: 7, participation: 4 },
  national:    { gold: 30, silver: 22, bronze: 15, fourth: 10, participation: 5 },
  international: { gold: 40, silver: 30, bronze: 20, fourth: 13, participation: 6 },
};

export const MEDAL_ORDER = ["gold", "silver", "bronze", "fourth", "participation"];

function basePoints(achievement = {}) {
  return BASE_POINTS[achievement.level]?.[achievement.medal] ?? 0;
}

// Event factor from the linked event's eventCategory; falls back to individual.
function eventFactor(achievement = {}) {
  const category = achievement.event?.eventCategory;
  return category && EVENT_FACTORS[category] !== undefined ? EVENT_FACTORS[category] : EVENT_FACTORS.individual;
}

/** Points for a single achievement (rounded, per the rounding rule). */
export function computeAchievementPoints(achievement = {}) {
  const base = basePoints(achievement);
  if (!base) return 0;
  const record = achievement.isRecord ? RECORD_BONUS : 1;
  return Math.round(base * eventFactor(achievement) * record);
}

/** Total across achievements (used by standings + reports + the Standing list). */
export function computeTotalPoints(achievements = []) {
  return achievements.reduce((sum, a) => sum + computeAchievementPoints(a), 0);
}

/** Medal/placement tallies: gold, silver, bronze, fourth, participation. */
export function medalCounts(achievements = []) {
  const counts = { gold: 0, silver: 0, bronze: 0, fourth: 0, participation: 0 };
  for (const a of achievements) {
    if (a.medal && counts[a.medal] !== undefined) counts[a.medal] += 1;
  }
  return counts;
}

/** Number of medal (non-participation) achievements. */
export function awardCount(achievements = []) {
  return achievements.reduce((n, a) => n + (a.medal && a.medal !== "participation" ? 1 : 0), 0);
}

/**
 * Rank standings with SHARED ranks (competition-standard): equal total points
 * share the same rank number, then ties break by gold -> silver -> bronze ->
 * fourth -> most recent achievement -> last name (stable, explainable).
 * Result: 1, 2, 2, 4. Returns sorted rows each with a `rank` property.
 */
export function rankStandings(standings = []) {
  const sorted = [...standings].sort((a, b) => {
    if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
    if ((b.gold ?? 0) !== (a.gold ?? 0)) return (b.gold ?? 0) - (a.gold ?? 0);
    if ((b.silver ?? 0) !== (a.silver ?? 0)) return (b.silver ?? 0) - (a.silver ?? 0);
    if ((b.bronze ?? 0) !== (a.bronze ?? 0)) return (b.bronze ?? 0) - (a.bronze ?? 0);
    if ((b.fourth ?? 0) !== (a.fourth ?? 0)) return (b.fourth ?? 0) - (a.fourth ?? 0);
    const ad = a.mostRecentDate ? new Date(a.mostRecentDate).getTime() : 0;
    const bd = b.mostRecentDate ? new Date(b.mostRecentDate).getTime() : 0;
    if (bd !== ad) return bd - ad;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  let previousKey = null;
  let previousRank = 0;
  return sorted.map((row, index) => {
    const key = `${row.points ?? 0}|${row.gold ?? 0}|${row.silver ?? 0}|${row.bronze ?? 0}|${row.fourth ?? 0}|${row.mostRecentDate ?? ""}|${row.name ?? ""}`;
    const rank = key === previousKey ? previousRank : index + 1;
    previousKey = key;
    previousRank = rank;
    return { ...row, rank };
  });
}
