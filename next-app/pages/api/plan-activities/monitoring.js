import { prisma } from "../../../lib/prisma";
import { requireSession, setSecurityHeaders } from "../../../lib/api-security";
import { buildMonitoringGrid } from "../../../lib/plan-monitoring";

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

  const plan = await prisma.trainingPlan.findUnique({ where: { id: planId }, select: { id: true, coachId: true, durationWeeks: true, durationDays: true, startDate: true } });
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
        where: { status: { in: ["done", "partial", "missed"] } },
        orderBy: { performedAt: "desc" },
        take: 1,
        select: { id: true, status: true, performedAt: true, quantityDone: true, setsDone: true, repsDone: true, notes: true }
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

  // Determine max week (from plan.durationDays, durationWeeks fallback, or max weekNumber in activities)
  const durationWeeks = (plan.durationDays != null ? Math.ceil(plan.durationDays / 7) : null) || plan.durationWeeks;
  const maxWeek = durationWeeks || Math.max(...activities.map(a => a.weekNumber || 1), 1);
  const week = weekNumber || 1;

  const { grid, progress } = buildMonitoringGrid({ activities, planAthletes, week });

  return res.status(200).json({
    plan: { id: plan.id, durationDays: plan.durationDays, durationWeeks: plan.durationWeeks, startDate: plan.startDate },
    currentWeek: week,
    maxWeek,
    grid,
    progress,
  });
}