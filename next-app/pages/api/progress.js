import { prisma } from "../../lib/prisma";
import { requireSession, validId, setSecurityHeaders } from "../../lib/api-security";
import { rateLimiters } from "../../lib/rate-limit";

function computeCompletion(activity, log) {
  if (!log) return null;
  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  let done = null, target = null;
  const lowerBetter = activity.metricType === "time";
  if (activity.metricType === "time" && activity.targetTimeSec != null) {
    done = log.timeSec != null ? toNum(log.timeSec) : null;
    target = toNum(activity.targetTimeSec);
  } else if (activity.targetQuantity != null) {
    done = toNum(log.quantityDone); target = toNum(activity.targetQuantity);
  } else if (activity.targetDistance != null) {
    done = toNum(log.distanceDone); target = toNum(activity.targetDistance);
  } else if (activity.targetSets != null) {
    done = log.setsDone != null ? toNum(log.setsDone) : null; target = toNum(activity.targetSets);
  } else if (activity.targetReps != null) {
    done = log.repsDone != null ? toNum(log.repsDone) : null; target = toNum(activity.targetReps);
  }
  if (done == null || target == null || target <= 0 || (lowerBetter && done <= 0)) return null;
  const ratio = lowerBetter ? target / done : done / target;
  return { percent: Math.round(Math.min(100, Math.max(0, ratio * 100))), done, target };
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"] && req.headers["x-forwarded-for"].split(",")[0].trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:progress`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests." });

  const isAdmin = session.user.role === "admin";
  const rosterMode = req.query.roster === "1" || req.query.roster === "true";
  const planId = validId(req.query.planId);
  const athleteId = validId(req.query.athleteId);

  if (rosterMode) {
    const wherePlans = isAdmin ? {} : { coach: { userId: Number(session.user.id) } };
    const plans = await prisma.trainingPlan.findMany({
      where: wherePlans,
      select: { id: true, planName: true, startDate: true },
      orderBy: { startDate: "desc" },
      take: 50,
    });
    if (!plans.length) return res.status(200).json(JSON.parse(JSON.stringify({ roster: [] })));
    const planIds = plans.map((p) => p.id);
    const planMap = new Map(plans.map((p) => [p.id, p]));
    const planAthletes = await prisma.trainingPlanAthlete.findMany({
      where: { planId: { in: planIds } },
      select: { planId: true, athleteId: true },
    });
    const athleteIds = [...new Set(planAthletes.map((pa) => pa.athleteId))];
    const athletes = athleteIds.length
      ? await prisma.athlete.findMany({ where: { id: { in: athleteIds } }, select: { id: true, firstName: true, lastName: true, athleteCode: true } })
      : [];
    const athleteMap = new Map(athletes.map((a) => [a.id, a]));
    const allActivities = await prisma.planActivity.findMany({
      where: { planId: { in: planIds }, athleteId: { in: athleteIds } },
      select: { id: true, planId: true, athleteId: true, metricType: true, targetTimeSec: true, targetQuantity: true, targetDistance: true, targetSets: true, targetReps: true },
    });
    const allActivityIds = allActivities.map((a) => a.id);
    const latestLogs = allActivityIds.length
      ? await prisma.planActivityLog.findMany({
          where: { activityId: { in: allActivityIds } },
          orderBy: [{ activityId: "asc" }, { performedAt: "desc" }],
          select: { activityId: true, status: true, score: true },
        })
      : [];
    const latestLogMap = new Map();
    for (const l of latestLogs) if (!latestLogMap.has(l.activityId)) latestLogMap.set(l.activityId, l);

    const athletePlanMap = new Map();
    for (const pa of planAthletes) {
      const k = `${pa.athleteId}:${pa.planId}`;
      if (!athletePlanMap.has(k)) athletePlanMap.set(k, { athleteId: pa.athleteId, planId: pa.planId, total: 0, done: 0, partial: 0, missed: 0, scoreSum: 0, scored: 0 });
    }
    for (const act of allActivities) {
      const entry = athletePlanMap.get(`${act.athleteId}:${act.planId}`);
      if (!entry) continue;
      entry.total++;
      const log = latestLogMap.get(act.id);
      if (log?.status === "done") entry.done++;
      else if (log?.status === "partial") entry.partial++;
      else if (log?.status === "missed") entry.missed++;
      if (log?.score != null) { entry.scoreSum += Number(log.score); entry.scored++; }
    }
    const roster = [];
    for (const [key, entry] of athletePlanMap) {
      const ath = athleteMap.get(entry.athleteId);
      const plan = planMap.get(entry.planId);
      if (!ath || !plan) continue;
      roster.push({
        athleteId: entry.athleteId,
        athlete: `${ath.firstName} ${ath.lastName}`,
        athleteCode: ath.athleteCode,
        planId: entry.planId,
        planName: plan.planName,
        total: entry.total,
        completed: entry.done,
        partial: entry.partial,
        missed: entry.missed,
        completionPercent: entry.total > 0 ? Math.round(((entry.done + entry.partial) / entry.total) * 100) : 0,
        averageScore: entry.scored > 0 ? Math.round((entry.scoreSum / entry.scored) * 10) / 10 : null,
      });
    }
    roster.sort((a, b) => a.athlete.localeCompare(b.athlete) || a.planName.localeCompare(b.planName));
    return res.status(200).json(JSON.parse(JSON.stringify({ roster })));
  }

  if (!planId) return res.status(400).json({ error: "planId is required." });

  const plan = await prisma.trainingPlan.findUnique({
    where: { id: planId },
    select: { id: true, planName: true, coachId: true, startDate: true, durationDays: true, durationWeeks: true },
  });
  if (!plan) return res.status(404).json({ error: "Plan not found." });
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || plan.coachId !== coach.id) return res.status(403).json({ error: "No access." });
  }

  if (athleteId) {
    const onPlan = await prisma.trainingPlanAthlete.findFirst({ where: { planId, athleteId }, select: { id: true } });
    if (!onPlan) return res.status(404).json({ error: "Athlete not on this plan." });
  }

  const whereActivities = { planId };
  if (athleteId) whereActivities.athleteId = athleteId;

  const activities = await prisma.planActivity.findMany({
    where: whereActivities,
    orderBy: [{ weekNumber: "asc" }, { dayIndex: "asc" }, { orderIndex: "asc" }],
    select: {
      id: true, athleteId: true, activityName: true, fitnessType: true, dayIndex: true, weekNumber: true, orderIndex: true,
      metricType: true, targetTimeSec: true, targetQuantity: true, targetUnit: true, targetDistance: true, targetLoad: true, targetSets: true, targetReps: true,
    },
  });

  const activityIds = activities.map((a) => a.id);
  const latestLogs = activityIds.length
    ? await prisma.planActivityLog.findMany({
        where: { activityId: { in: activityIds } },
        orderBy: [{ activityId: "asc" }, { performedAt: "desc" }],
        select: {
          id: true, activityId: true, athleteId: true, performedAt: true, status: true,
          quantityDone: true, setsDone: true, repsDone: true, timeSec: true, distanceDone: true, loadUsed: true, score: true, attempts: true, notes: true,
        },
      })
    : [];

  const latestMap = new Map();
  for (const l of latestLogs) {
    if (!latestMap.has(l.activityId)) latestMap.set(l.activityId, l);
  }

  let completed = 0, partial = 0, missed = 0, total = activities.length;
  let scoreSum = 0, scoredCount = 0;

  const enriched = activities.map((a) => {
    const log = latestMap.get(a.id) || null;
    const completion = computeCompletion(a, log);
    if (log?.status === "done") completed++;
    else if (log?.status === "partial") partial++;
    else if (log?.status === "missed") missed++;
    if (log?.score != null) { scoreSum += Number(log.score); scoredCount++; }
    return { ...a, latestLog: log, completion };
  });

  const athlete = athleteId
    ? await prisma.athlete.findUnique({ where: { id: athleteId }, select: { id: true, firstName: true, lastName: true, athleteCode: true } })
    : null;

  return res.status(200).json(JSON.parse(JSON.stringify({
    plan: { id: plan.id, planName: plan.planName, startDate: plan.startDate.toISOString(), durationDays: plan.durationDays, durationWeeks: plan.durationWeeks },
    athlete,
    activities: enriched,
    summary: { total, completed, partial, missed, completionPercent: total > 0 ? Math.round(((completed + partial) / total) * 100) : 0, averageScore: scoredCount > 0 ? Math.round((scoreSum / scoredCount) * 10) / 10 : null },
  })));
}