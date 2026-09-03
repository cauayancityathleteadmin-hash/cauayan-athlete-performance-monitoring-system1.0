export function computeTotalPoints(achievements, pointsConfig) {
  const map = new Map();
  for (const pc of pointsConfig) map.set(`${pc.medal}|${pc.level}`, pc.points);
  let total = 0;
  for (const a of achievements) {
    if (a.medal && a.level) total += map.get(`${a.medal}|${a.level}`) || 0;
  }
  return total;
}

export function medalCounts(achievements) {
  const counts = { gold: 0, silver: 0, bronze: 0, participation: 0 };
  for (const a of achievements) {
    if (a.medal && counts[a.medal] !== undefined) counts[a.medal]++;
  }
  return counts;
}
