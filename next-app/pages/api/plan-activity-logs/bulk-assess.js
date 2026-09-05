import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { notifyAthlete } from "../../../lib/notify";

const STATUSES = ["done", "partial", "missed"];
const FITNESS = ["endurance", "strength", "power", "speed_agility", "skill_technique", "mobility", "recovery"];

function toDecimal(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function toInt(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

async function canAccessPlan(prismaClient, session, planId) {
  const plan = await prismaClient.trainingPlan.findUnique({ where: { id: planId }, select: { id: true, coachId: true } });
  if (!plan) return null;
  if (session.user.role === "admin") return plan;
  const coach = await prismaClient.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
  if (coach && plan.coachId === coach.id) return plan;
  return false;
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireCsrf(req, res)) return;
  if (session.user.role === "admin") return res.status(403).json({ error: "Only the assigned coach assesses athletes on training plans." });

  const ip = req.headers["x-forwarded-for"] && req.headers["x-forwarded-for"].split(",")[0].trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:bulk-assess`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const body = req.body || {};
  const planId = validId(body.planId);
  const athleteId = validId(body.athleteId);
  if (!planId) return res.status(400).json({ error: "A valid planId is required." });
  if (!athleteId) return res.status(400).json({ error: "A valid athleteId is required." });

  const access = await canAccessPlan(prisma, session, planId);
  if (access === null) return res.status(404).json({ error: "Training plan not found." });
  if (access === false) return res.status(403).json({ error: "You do not have permission to assess this plan." });

  const onPlan = await prisma.trainingPlanAthlete.findFirst({ where: { planId, athleteId } });
  if (!onPlan) return res.status(409).json({ error: "This athlete is not part of the plan." });

  const activities = await prisma.planActivity.findMany({ where: { planId, athleteId }, select: { id: true } });
  const activityIds = activities.map((a) => a.id);
  if (!activityIds.length) return res.status(400).json({ error: "This plan has no activities to assess." });

  const performedAtBody = text(body.performedAt, 30);
  const performedAt = performedAtBody ? new Date(performedAtBody) : new Date();
  if (isNaN(performedAt)) return res.status(400).json({ error: "Invalid date." });

  const rows = Array.isArray(body.rows) ? body.rows : [];
  const validRows = [];
  for (const row of rows) {
    const activityId = validId(row.activityId);
    if (!activityId || !activityIds.includes(activityId)) continue;
    validRows.push({
      activityId,
      status: STATUSES.includes(row.status) ? row.status : null,
      quantityDone: toDecimal(row.quantityDone),
      setsDone: toInt(row.setsDone),
      repsDone: toInt(row.repsDone),
      notes: text(row.notes, 2000) || null,
    });
  }
  if (!validRows.length) return res.status(400).json({ error: "At least one activity needs a status." });

  await prisma.$transaction(async (tx) => {
    await tx.planActivityLog.deleteMany({
      where: { athleteId, activityId: { in: activityIds } },
    });
    await tx.planActivityLog.createMany({
      data: validRows.map((r) => ({
        activityId: r.activityId,
        athleteId,
        performedAt,
        status: r.status,
        quantityDone: r.quantityDone,
        setsDone: r.setsDone,
        repsDone: r.repsDone,
        notes: r.notes,
        loggedBy: Number(session.user.id),
      })),
    });

    const rating = Number(body.summaryRating);
    if (Number.isInteger(rating) && rating >= 1 && rating <= 10) {
      await tx.trainingAssessment.create({
        data: {
          planId,
          athleteId,
          assessmentDate: performedAt,
          rating,
          fitnessDimension: FITNESS.includes(body.summaryFitness) ? body.summaryFitness : null,
          comments: text(body.summaryComments, 2000) || null,
          assessedBy: Number(session.user.id),
        },
      });
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: Number(session.user.id),
      action: "bulk_assess",
      entityType: "planActivityLog",
      entityId: null,
      description: `Assessed ${validRows.length} activity/activities for athlete #${athleteId} on plan #${planId}${Number.isInteger(Number(body.summaryRating)) ? ` with rating ${Number(body.summaryRating)}` : ""}.`,
    },
  });

  const athleteForNotify = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { id: true, firstName: true, lastName: true, email: true, contactNumber: true } });
  await notifyAthlete({
    athlete: athleteForNotify,
    subject: "Your training assessment is ready",
    message: `Hello ${athleteForNotify ? `${athleteForNotify.firstName} ${athleteForNotify.lastName}` : ""}, your coach completed an assessment of ${validRows.length} activity/activities.${Number.isInteger(Number(body.summaryRating)) ? ` Overall rating: ${Number(body.summaryRating)}/10.` : ""} Ask your coach for the full details.`,
  });

  const logs = await prisma.planActivityLog.findMany({
    where: { athleteId, activityId: { in: activityIds } },
    orderBy: [{ activity: { orderIndex: "asc" } }],
    include: {
      athlete: { select: { id: true, firstName: true, lastName: true } },
      activity: { select: { id: true, activityName: true, fitnessType: true } },
    },
  });
  return res.status(201).json(JSON.parse(JSON.stringify({ success: true, logged: logs.length })));
}