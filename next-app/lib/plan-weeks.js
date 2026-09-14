const MS_DAY = 1000 * 60 * 60 * 24;

function toDate(v) {
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? null : d;
}

export function planWeekFor(startDate, at) {
  const start = toDate(startDate);
  const when = toDate(at);
  if (!start || !when) return 1;
  const diffDays = Math.floor((when.getTime() - start.getTime()) / MS_DAY);
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

export function currentPlanWeek(startDate) {
  return planWeekFor(startDate, new Date());
}

export async function resolveWeekGate(prismaClient, planId, at) {
  const plan = await prismaClient.trainingPlan.findUnique({
    where: { id: planId },
    select: { id: true, startDate: true, allowLateAssessment: true },
  });
  if (!plan) return { plan: null, locked: false, currentWeek: 1, gateWeek: 1 };
  const gateWeek = planWeekFor(plan.startDate, at);
  const currentWeek = planWeekFor(plan.startDate, new Date());
  const locked = !plan.allowLateAssessment && gateWeek !== currentWeek;
  return { plan, locked, currentWeek, gateWeek };
}