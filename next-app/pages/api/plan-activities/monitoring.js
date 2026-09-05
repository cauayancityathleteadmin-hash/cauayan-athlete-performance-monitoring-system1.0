import { prisma } from "../../../lib/prisma";
import { requireSession, setSecurityHeaders } from "../../../lib/api-security";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const planId = req.query.planId ? parseInt(req.query.planId) : null;
  const athleteId = req.query.athleteId ? parseInt(req.query.athleteId) : null;
  const weekNumber = req.query.weekNumber ? parseInt(req.query.weekNumber) : null;

  if (!planId) return res.status(400).json({ error: "planId required." });

  const plan = await prisma.trainingPlan.findUnique({ where: { id: planId }, select: { id: true, coachId: true, durationWeeks: true, startDate: true } });
  if (!plan) return res.status(404).json({ error: "Training plan not found." });

  if (session.user.role !== "admin") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || plan.coachId !== coach.id) return res.status(403).json({ error: "Not your plan." });
  }

  // Build where clause
  const where = { planId };
  if (athleteId) where.athleteId = athleteId;

  // Get all activities for this plan (and optionally athlete)
  const activities = await prisma.planActivity.findMany({
    where,
    include: {
      athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } },
      logs: {
        where: { status: { in: ["done", "partial"] } },
        orderBy: { performedAt: "desc" },
        take: 1,
        select: { id: true, status: true, performedAt: true, quantityDone: true, notes: true }
      }
    },
    orderBy: [{ dayIndex: "asc" }, { weekNumber: "asc" }, { orderIndex: "asc" }],
  });

  // Get all athletes on plan for grid rows
  const planAthletes = await prisma.trainingPlanAthlete.findMany({
    where: { planId },
    include: { athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } } },
    orderBy: { athlete: { lastName: "asc" } },
  });

  // Determine max week (from plan.durationWeeks or max weekNumber in activities)
  const maxWeek = plan.durationWeeks || Math.max(...activities.map(a => a.weekNumber || 1), 1);
  const week = weekNumber || 1;

  // Build grid: athlete -> day -> activities
  const grid = {};
  for (const pa of planAthletes) {
    const aid = pa.athlete.id;
    grid[aid] = {
      athlete: pa.athlete,
      days: {}
    };
    for (let d = 1; d <= 7; d++) {
      const dayActivities = activities.filter(a => a.athleteId === aid && a.dayIndex === d && (!a.weekNumber || a.weekNumber === week));
      const done = dayActivities.filter(a => a.logs.length > 0 && a.logs[0].status === "done").length;
      const partial = dayActivities.filter(a => a.logs.length > 0 && a.logs[0].status === "partial").length;
      const total = dayActivities.length;
      grid[aid].days[d] = {
        dayIndex: d,
        total,
        done,
        partial,
        pending: total - done - partial,
        activities: dayActivities.map(a => ({
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

  return res.status(200).json({
    plan: { id: plan.id, durationWeeks: plan.durationWeeks, startDate: plan.startDate },
    currentWeek: week,
    maxWeek,
    grid,
  });
}