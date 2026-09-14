import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { notifyAthlete } from "../../../lib/notify";
import { resolveWeekGate } from "../../../lib/plan-weeks";
import { computeAutoScore, resultValueOf } from "../../../lib/activity-score";

const STATUSES = ["done", "partial", "missed"];
const DIM_SCORE = { done: 3, partial: 2, missed: 1 };
function deriveFitness(rows, fitnessByActivity) {
  const scores = new Map();
  for (const r of rows) {
    const f = fitnessByActivity.get(r.activityId);
    if (!f) continue;
    scores.set(f, (scores.get(f) || 0) + (DIM_SCORE[r.status] || 0));
  }
  let best = null, bestScore = -1;
  for (const [f, s] of scores) if (s > bestScore) { best = f; bestScore = s; }
  return best;
}

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
function toScore(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? Math.round(n * 10) / 10 : null;
}
function targetOf(act) {
  if (!act) return null;
  switch (act.metricType) {
    case "time": return act.targetTimeSec == null ? null : Number(act.targetTimeSec);
    case "distance": return act.targetDistance == null ? null : Number(act.targetDistance);
    case "load": return act.targetLoad == null ? null : Number(act.targetLoad);
    case "reps": return act.targetReps == null ? null : Number(act.targetReps);
    case "sets": return act.targetSets == null ? null : Number(act.targetSets);
    case "quantity": return act.targetQuantity == null ? null : Number(act.targetQuantity);
    default: return null;
  }
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

  const activities = await prisma.planActivity.findMany({
    where: { planId, athleteId },
    select: {
      id: true,
      fitnessType: true,
      metricType: true,
      targetTimeSec: true,
      targetQuantity: true,
      targetDistance: true,
      targetLoad: true,
      targetSets: true,
      targetReps: true,
    },
  });
  const activityIds = activities.map((a) => a.id);
  if (!activityIds.length) return res.status(400).json({ error: "This plan has no activities to assess." });

  const performedAtBody = text(body.performedAt, 30);
  const performedAt = performedAtBody ? new Date(performedAtBody) : new Date();
  if (isNaN(performedAt)) return res.status(400).json({ error: "Invalid date." });

  const gate = await resolveWeekGate(prisma, planId, performedAt);
  if (gate.plan && gate.locked) {
    return res.status(423).json({ error: `Week ${gate.gateWeek} is locked. Assessments can only be entered during the current week (Week ${gate.currentWeek}). Ask the admin to allow late assessment if needed.` });
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];
  const validRows = [];
  for (const row of rows) {
    const activityId = validId(row.activityId);
    if (!activityId || !activityIds.includes(activityId)) continue;
    const act = activities.find((a) => a.id === activityId);
    const raw = {
      activityId,
      status: STATUSES.includes(row.status) ? row.status : null,
      quantityDone: toDecimal(row.quantityDone),
      setsDone: toInt(row.setsDone),
      repsDone: toInt(row.repsDone),
      timeSec: toDecimal(row.timeSec),
      distanceDone: toDecimal(row.distanceDone),
      loadUsed: toDecimal(row.loadUsed),
      attempts: toInt(row.attempts),
      score: toScore(row.score),
      notes: text(row.notes, 2000) || null,
    };
    raw.score = raw.score != null ? raw.score : computeAutoScore(act ? act.metricType : "none", resultValueOf(raw, act ? act.metricType : "none"), targetOf(act));
    validRows.push(raw);
  }
  if (!validRows.length) return res.status(400).json({ error: "At least one activity needs a status." });
  const fitnessByActivity = new Map(activities.map((a) => [a.id, a.fitnessType]));
  const summaryFitness = deriveFitness(validRows, fitnessByActivity);

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
        timeSec: r.timeSec,
        distanceDone: r.distanceDone,
        loadUsed: r.loadUsed,
        score: r.score,
        attempts: r.attempts,
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
          fitnessDimension: summaryFitness,
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