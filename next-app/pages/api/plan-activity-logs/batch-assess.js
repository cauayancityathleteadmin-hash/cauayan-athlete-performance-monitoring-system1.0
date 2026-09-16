import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { notifyAthlete } from "../../../lib/notify";
import { resolveWeekGate } from "../../../lib/plan-weeks";

const STATUSES = ["done", "partial", "missed"];

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
  const rate = rateLimiters.api(`api:${ip}:batch-assess`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const body = req.body || {};
  const planId = validId(body.planId) || validId(req.query.planId);
  if (!planId) return res.status(400).json({ error: "A valid planId is required." });

  const access = await canAccessPlan(prisma, session, planId);
  if (access === null) return res.status(404).json({ error: "Training plan not found." });
  if (access === false) return res.status(403).json({ error: "You do not have permission to assess this plan." });

  const performedAtBody = text(body.performedAt, 30);
  const performedAt = performedAtBody ? new Date(performedAtBody) : new Date();
  if (isNaN(performedAt)) return res.status(400).json({ error: "Invalid date." });

  const gate = await resolveWeekGate(prisma, planId, performedAt);
  if (gate.plan && gate.locked) {
    return res.status(423).json({ error: `Week ${gate.gateWeek} is locked. Assessments can only be entered during the current week (Week ${gate.currentWeek}). Ask the admin to allow late assessment if needed.` });
  }

  const planActivities = await prisma.planActivity.findMany({
    where: { planId },
    select: { id: true, athleteId: true },
  });
  const actById = new Map(planActivities.map((a) => [a.id, a]));

  const rows = Array.isArray(body.rows) ? body.rows : [];
  const validRows = [];
  const athleteIds = new Set();
  for (const row of rows) {
    const activityId = validId(row.activityId);
    const athleteId = validId(row.athleteId);
    const act = activityId ? actById.get(activityId) : null;
    if (!act || act.athleteId !== athleteId) continue;
    const status = STATUSES.includes(row.status) ? row.status : null;
    if (!status) continue;
    validRows.push({
      athleteId,
      activityId,
      status,
      quantityDone: toDecimal(row.quantityDone),
      setsDone: toInt(row.setsDone),
      repsDone: toInt(row.repsDone),
      timeSec: toDecimal(row.timeSec),
      distanceDone: toDecimal(row.distanceDone),
      loadUsed: toDecimal(row.loadUsed),
      attempts: toInt(row.attempts),
      notes: text(row.notes, 2000) || null,
    });
    athleteIds.add(athleteId);
  }

  const assessments = Array.isArray(body.assessments) ? body.assessments : [];
  const validAssessments = [];
  for (const candidate of assessments) {
    const athleteId = validId(candidate.athleteId);
    const rating = Number(candidate.rating);
    if (!athleteId || !Number.isInteger(rating) || rating < 1 || rating > 10) continue;
    if (!athleteIds.has(athleteId)) {
      const onPlan = await prisma.trainingPlanAthlete.findFirst({ where: { planId, athleteId }, select: { id: true } });
      if (!onPlan) continue;
      athleteIds.add(athleteId);
    }
    validAssessments.push({ athleteId, rating, comments: text(candidate.comments, 2000) || null });
  }

  if (!validRows.length && !validAssessments.length) {
    return res.status(400).json({ error: "Nothing to save — mark at least one activity or leave a rating." });
  }

  const activityIds = validRows.map((r) => r.activityId);

  await prisma.$transaction(async (tx) => {
    if (validRows.length) {
      await tx.planActivityLog.deleteMany({
        where: { athleteId: { in: [...athleteIds] }, activityId: { in: activityIds } },
      });
      await tx.planActivityLog.createMany({
        data: validRows.map((r) => ({
          activityId: r.activityId,
          athleteId: r.athleteId,
          performedAt,
          status: r.status,
          quantityDone: r.quantityDone,
          setsDone: r.setsDone,
          repsDone: r.repsDone,
          timeSec: r.timeSec,
          distanceDone: r.distanceDone,
          loadUsed: r.loadUsed,
          attempts: r.attempts,
          notes: r.notes,
          loggedBy: Number(session.user.id),
        })),
      });
    }
    for (const a of validAssessments) {
      await tx.trainingAssessment.upsert({
        where: { planId_athleteId: { planId, athleteId: a.athleteId } },
        create: { planId, athleteId: a.athleteId, assessmentDate: performedAt, rating: a.rating, comments: a.comments, assessedBy: Number(session.user.id) },
        update: { rating: a.rating, comments: a.comments, assessmentDate: performedAt },
      });
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: Number(session.user.id),
      action: "batch_assess",
      entityType: "planActivityLog",
      entityId: null,
      description: `Saved ${validRows.length} activity log(s) across ${athleteIds.size} athlete(s)${validAssessments.length ? ` and ${validAssessments.length} assessment rating(s)` : ""} on plan #${planId}.`,
    },
  });

  const athleteIdsArr = [...athleteIds];
  const athletes = await prisma.athlete.findMany({ where: { id: { in: athleteIdsArr } }, select: { id: true, firstName: true, lastName: true, email: true, contactNumber: true } });
  for (const athlete of athletes) {
    const count = validRows.filter((r) => r.athleteId === athlete.id).length;
    const rated = validAssessments.find((a) => a.athleteId === athlete.id);
    const name = athlete ? `${athlete.firstName} ${athlete.lastName}` : "";
    await notifyAthlete({
      athlete,
      subject: "Your training assessment is ready",
      message: `Hello ${name}, your coach updated ${count ? `${count} activity/activities` : "your assessment"} on training plan #${planId}.${rated ? ` Overall rating: ${rated.rating}/10.` : ""} Ask your coach for the full details.`,
    });
  }

  return res.status(201).json({ success: true, logged: validRows.length, athletes: athleteIdsArr.length, rated: validAssessments.length });
}