export function buildMonitoringGrid({ activities, planAthletes, week }) {
  const grid = {};
  const progress = {};
  for (const pa of planAthletes) {
    const aid = pa.athlete.id;
    grid[aid] = {
      athlete: pa.athlete,
      days: {},
    };
    const weekActivities = activities.filter((a) => a.athleteId === aid && (!a.weekNumber || a.weekNumber === week));
    const weekDone = weekActivities.filter((a) => a.logs.length > 0 && a.logs[0].status === "done").length;
    const weekPartial = weekActivities.filter((a) => a.logs.length > 0 && a.logs[0].status === "partial").length;
    progress[aid] = {
      completed: weekDone + weekPartial,
      total: weekActivities.length,
      percent: weekActivities.length ? Math.round(((weekDone + weekPartial) / weekActivities.length) * 100) : 0,
    };
    for (let d = 1; d <= 7; d++) {
      const dayActivities = activities.filter((a) => a.athleteId === aid && a.dayIndex === d && (!a.weekNumber || a.weekNumber === week));
      const done = dayActivities.filter((a) => a.logs.length > 0 && a.logs[0].status === "done").length;
      const partial = dayActivities.filter((a) => a.logs.length > 0 && a.logs[0].status === "partial").length;
      const missed = dayActivities.filter((a) => a.logs.length > 0 && a.logs[0].status === "missed").length;
      const total = dayActivities.length;
      grid[aid].days[d] = {
        dayIndex: d,
        total,
        done,
        partial,
        missed,
        pending: total - done - partial - missed,
        activities: dayActivities.map((a) => ({
          id: a.id,
          activityName: a.activityName,
          fitnessType: a.fitnessType,
          targetQuantity: a.targetQuantity,
          targetUnit: a.targetUnit,
          targetSets: a.targetSets,
          targetReps: a.targetReps,
          targetDistance: a.targetDistance,
          targetLoad: a.targetLoad,
          log: a.logs[0] || null,
        })),
      };
    }
  }
  return { grid, progress };
}