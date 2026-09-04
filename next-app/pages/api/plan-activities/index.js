import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

const FITNESS_TYPES = ["endurance", "strength", "power", "speed_agility", "skill_technique", "mobility", "recovery"];

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
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const planId = validId(req.query.planId || req.body?.planId);
  if (!planId) return res.status(400).json({ error: "A valid planId is required." });
  const access = await canAccessPlan(prisma, session, planId);
  if (access === null) return res.status(404).json({ error: "Training plan not found." });
  if (access === false) return res.status(403).json({ error: "You do not have permission to manage this plan's activities." });

  if (req.method === "GET") {
    const activities = await prisma.planActivity.findMany({
      where: { planId },
      orderBy: { orderIndex: "asc" },
      include: {
        targets: { include: { athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } } } },
        logs: { orderBy: { performedAt: "desc" }, include: { athlete: { select: { id: true, firstName: true, lastName: true } }, logger: { select: { email: true, username: true } } } },
      },
    });
    return res.status(200).json(JSON.parse(JSON.stringify(activities)));
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;
  if (!["admin", "coach"].includes(session.user.role)) return res.status(403).json({ error: "You do not have permission for this action." });

  const body = req.body || {};
  const plan = await prisma.trainingPlan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!plan) return res.status(404).json({ error: "Training plan not found." });

  const action = body.action || "create";

  if (action === "bulk") {
    const planAthletes = await prisma.trainingPlanAthlete.findMany({ where: { planId }, select: { athleteId: true } });
    const allowedAthleteIds = new Set(planAthletes.map((a) => a.athleteId));
    const list = Array.isArray(body.activities) ? body.activities : [];
    const cleaned = [];
    for (const item of list) {
      const name = text(item.activityName, 191, true);
      if (!name) continue;
      let targets = Array.isArray(item.athleteTargets) ? item.athleteTargets : [];
      targets = targets.map((t) => ({ athleteId: validId(t.athleteId) })).filter((t) => t.athleteId && allowedAthleteIds.has(t.athleteId));
      cleaned.push({
        activityName: name,
        fitnessType: FITNESS_TYPES.includes(item.fitnessType) ? item.fitnessType : "endurance",
        targetQuantity: toDecimal(item.targetQuantity),
        targetUnit: text(item.targetUnit, 50) || null,
        targetSets: toInt(item.targetSets),
        targetReps: toInt(item.targetReps),
        targetDistance: toDecimal(item.targetDistance),
        targetLoad: toDecimal(item.targetLoad),
        instructions: text(item.instructions, 2000) || null,
        targets,
      });
    }
    if (!cleaned.length) return res.status(400).json({ error: "Enter at least one activity with a name." });
    if (cleaned.length > 50) return res.status(400).json({ error: "Please limit a bulk add to 50 activities at a time." });

    const createdIds = await prisma.$transaction(async (tx) => {
      const count = await tx.planActivity.count({ where: { planId } });
      const ids = [];
      for (let i = 0; i < cleaned.length; i++) {
        const item = cleaned[i];
        const activity = await tx.planActivity.create({
          data: {
            planId,
            activityName: item.activityName,
            fitnessType: item.fitnessType,
            targetQuantity: item.targetQuantity,
            targetUnit: item.targetUnit,
            targetSets: item.targetSets,
            targetReps: item.targetReps,
            targetDistance: item.targetDistance,
            targetLoad: item.targetLoad,
            instructions: item.instructions,
            orderIndex: count + i,
          },
          select: { id: true },
        });
        if (item.targets.length) {
          await tx.planActivityTarget.createMany({
            data: item.targets.map((t) => ({
              activityId: activity.id,
              athleteId: t.athleteId,
              targetQuantity: toDecimal(t.targetQuantity),
              targetUnit: text(t.targetUnit, 50) || null,
              targetSets: toInt(t.targetSets),
              targetReps: toInt(t.targetReps),
              targetDistance: toDecimal(t.targetDistance),
              targetLoad: toDecimal(t.targetLoad),
              note: text(t.note, 2000) || null,
            })),
          });
        }
        ids.push(activity.id);
      }
      return ids;
    });

    const full = await prisma.planActivity.findMany({
      where: { id: { in: createdIds } },
      include: { targets: true },
      orderBy: { orderIndex: "asc" },
    });
    return res.status(201).json(JSON.parse(JSON.stringify({ created: full, count: full.length })));
  }

  if (action === "create") {
    const name = text(body.activityName, 191, true);
    if (!name) return res.status(400).json({ error: "An activity name is required." });
    const fitnessType = FITNESS_TYPES.includes(body.fitnessType) ? body.fitnessType : "endurance";
    const planAthletes = await prisma.trainingPlanAthlete.findMany({ where: { planId }, select: { athleteId: true } });
    const allowedAthleteIds = planAthletes.map((a) => a.athleteId);

    let targets = Array.isArray(body.targets) ? body.targets : [];
    targets = targets
      .map((t) => ({ athleteId: validId(t.athleteId) }))
      .filter((t) => t.athleteId && allowedAthleteIds.includes(t.athleteId));

    const created = await prisma.$transaction(async (tx) => {
      const count = await tx.planActivity.count({ where: { planId } });
      const activity = await tx.planActivity.create({
        data: {
          planId,
          activityName: name,
          fitnessType,
          targetQuantity: toDecimal(body.targetQuantity),
          targetUnit: text(body.targetUnit, 50) || null,
          targetSets: toInt(body.targetSets),
          targetReps: toInt(body.targetReps),
          targetDistance: toDecimal(body.targetDistance),
          targetLoad: toDecimal(body.targetLoad),
          instructions: text(body.instructions, 2000) || null,
          orderIndex: count,
        },
        select: { id: true },
      });
      if (targets.length) {
        await tx.planActivityTarget.createMany({
          data: targets.map((t) => ({
            activityId: activity.id,
            athleteId: t.athleteId,
            targetQuantity: toDecimal(t.targetQuantity),
            targetUnit: text(t.targetUnit, 50) || null,
            targetSets: toInt(t.targetSets),
            targetReps: toInt(t.targetReps),
            targetDistance: toDecimal(t.targetDistance),
            targetLoad: toDecimal(t.targetLoad),
            note: text(t.note, 2000) || null,
          })),
        });
      }
      return activity.id;
    });

    const full = await prisma.planActivity.findUnique({ where: { id: created }, include: { targets: true } });
    return res.status(201).json(JSON.parse(JSON.stringify(full)));
  }

  if (action === "update") {
    const activityId = validId(body.activityId);
    if (!activityId) return res.status(400).json({ error: "A valid activityId is required." });
    const activity = await prisma.planActivity.findFirst({ where: { id: activityId, planId } });
    if (!activity) return res.status(404).json({ error: "Activity not found." });

    const data = {
      activityName: text(body.activityName, 191, true),
    };
    if (!data.activityName) return res.status(400).json({ error: "An activity name is required." });
    if (FITNESS_TYPES.includes(body.fitnessType)) data.fitnessType = body.fitnessType;
    if ("targetQuantity" in body) data.targetQuantity = toDecimal(body.targetQuantity);
    if ("targetUnit" in body) data.targetUnit = text(body.targetUnit, 50) || null;
    if ("targetSets" in body) data.targetSets = toInt(body.targetSets);
    if ("targetReps" in body) data.targetReps = toInt(body.targetReps);
    if ("targetDistance" in body) data.targetDistance = toDecimal(body.targetDistance);
    if ("targetLoad" in body) data.targetLoad = toDecimal(body.targetLoad);
    if ("instructions" in body) data.instructions = text(body.instructions, 2000) || null;

    await prisma.planActivity.update({ where: { id: activityId }, data });
    return res.status(200).json({ success: true, message: "Activity updated." });
  }

  if (action === "delete") {
    const activityId = validId(body.activityId);
    if (!activityId) return res.status(400).json({ error: "A valid activityId is required." });
    const activity = await prisma.planActivity.findFirst({ where: { id: activityId, planId } });
    if (!activity) return res.status(404).json({ error: "Activity not found." });

    await prisma.planActivity.delete({ where: { id: activityId } });
    return res.status(200).json({ success: true, message: "Activity removed." });
  }

  return res.status(400).json({ error: "Unknown action." });
}