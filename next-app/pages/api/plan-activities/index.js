import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { FITNESS_TYPES, metricProfileFor, primaryMetricFor, primaryTargetKeyFor, allowedTargetKeysFor, unitOptionsFor, fitnessTypeAllowedForPlanType } from "../../../lib/training-metrics";

const TARGET_KEYS = ["targetTimeSec", "targetDistance", "targetLoad", "targetReps", "targetSets", "targetQuantity"];

/* Enforce the LOCKED metric profile: any target column outside the type's
   fixed set is nulled. metricType itself is always derived server-side
   (primaryMetricFor) and is never accepted from the client. */
function sanitizeTargetFields(fitnessType, fields) {
  const allowed = allowedTargetKeysFor(fitnessType);
  const out = { ...fields };
  for (const key of TARGET_KEYS) {
    if (!allowed.has(key)) out[key] = null;
  }
  if (!unitOptionsFor(fitnessType).length) out.targetUnit = null;
  return out;
}

function validateUnit(fitnessType, unit) {
  if (!unit) return true;
  const allowed = unitOptionsFor(fitnessType);
  return allowed.length > 0 && allowed.includes(unit);
}

function unitMessage(fitnessType) {
  const allowed = unitOptionsFor(fitnessType);
  return allowed.length ? allowed.join(", ") : "this type has no unit";
}

function buildTargetData(fitnessType, source) {
  return sanitizeTargetFields(fitnessType, {
    targetQuantity: toDecimal(source.targetQuantity),
    targetUnit: text(source.targetUnit, 50) || null,
    targetSets: toInt(source.targetSets),
    targetReps: toInt(source.targetReps),
    targetDistance: toDecimal(source.targetDistance),
    targetLoad: toDecimal(source.targetLoad),
    targetTimeSec: toDecimal(source.targetTimeSec),
  });
}

/* True when the scoring (primary) target column has a value — the target that
   a Pre-Conditioning activity must carry. */
function hasPrimaryTarget(fitnessType, targetData) {
  const key = primaryTargetKeyFor(fitnessType);
  return Boolean(key && targetData[key] != null);
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
    try {
      const activities = await prisma.planActivity.findMany({
        where: { planId },
        orderBy: { orderIndex: "asc" },
        include: {
          athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } },
          logs: { orderBy: { performedAt: "desc" }, include: { athlete: { select: { id: true, firstName: true, lastName: true } }, logger: { select: { email: true, username: true } } } },
        },
      });
      return res.status(200).json(JSON.parse(JSON.stringify(activities)));
    } catch (e) {
      return res.status(500).json({ error: "Failed to fetch activities." });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;
  if (session.user.role !== "coach" && session.user.role !== "admin") return res.status(403).json({ error: "You do not have permission for this action." });

  const body = req.body || {};
  const plan = await prisma.trainingPlan.findUnique({ where: { id: planId }, select: { id: true, planType: true } });
  if (!plan) return res.status(404).json({ error: "Training plan not found." });
  const planType = plan.planType || "normal";

  const action = body.action || "create";

  if (action === "bulk") {
    const planAthletes = await prisma.trainingPlanAthlete.findMany({ where: { planId }, select: { athleteId: true } });
    const allowedAthleteIds = new Set(planAthletes.map((a) => a.athleteId));
    const list = Array.isArray(body.activities) ? body.activities : [];
    const disallowedItem = list.find((item) => FITNESS_TYPES.includes(item.fitnessType) && !fitnessTypeAllowedForPlanType(planType, item.fitnessType));
    if (disallowedItem) {
      const ft = FITNESS_TYPES.includes(disallowedItem.fitnessType) ? disallowedItem.fitnessType : "endurance";
      return res.status(400).json({ error: `${metricProfileFor(ft).label} activities are not available on a Pre-Conditioning plan.` });
    }
    const cleaned = [];
    for (const item of list) {
      const name = text(item.activityName, 191, true);
      if (!name) continue;
      const athleteId = validId(item.athleteId);
      if (!athleteId || !allowedAthleteIds.has(athleteId)) continue;
      const fitnessType = FITNESS_TYPES.includes(item.fitnessType) ? item.fitnessType : "endurance";
      const metricType = primaryMetricFor(fitnessType);
      const targetUnit = text(item.targetUnit, 50) || null;
      if (targetUnit && !validateUnit(fitnessType, targetUnit)) continue;
      const targetData = buildTargetData(fitnessType, item);
      if (planType === "pre_conditioning" && !hasPrimaryTarget(fitnessType, targetData)) {
        return res.status(400).json({ error: `A target (${metricType}) is required for "${name}" on a Pre-Conditioning plan.` });
      }
      cleaned.push({
        athleteId,
        activityName: name,
        fitnessType,
        metricType,
        ...targetData,
        instructions: text(item.instructions, 2000) || null,
      });
    }
    if (!cleaned.length) return res.status(400).json({ error: "Enter at least one activity with a name for an athlete on this plan." });
    if (cleaned.length > 50) return res.status(400).json({ error: "Please limit a bulk add to 50 activities at a time." });

    const created = await prisma.planActivity.createManyAndReturn({
      data: cleaned.map((item, i) => ({
        planId,
        athleteId: item.athleteId,
        activityName: item.activityName,
        fitnessType: item.fitnessType,
        metricType: item.metricType,
        targetQuantity: item.targetQuantity,
        targetUnit: item.targetUnit,
        targetSets: item.targetSets,
        targetReps: item.targetReps,
        targetDistance: item.targetDistance,
        targetLoad: item.targetLoad,
        targetTimeSec: item.targetTimeSec,
        instructions: item.instructions,
        dayIndex: toInt(item.dayIndex),
        weekNumber: toInt(item.weekNumber),
        orderIndex: i,
      })),
      select: { id: true },
    });
    const createdIds = created.map((c) => c.id);

    const [full] = await Promise.all([
      prisma.planActivity.findMany({
        where: { id: { in: createdIds } },
        include: { athlete: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { orderIndex: "asc" },
      }),
      prisma.auditLog.create({
        data: { userId: Number(session.user.id), action: "bulk_create", entityType: "planActivity", entityId: null, description: `Added ${createdIds.length} activities to training plan #${planId}` },
      }),
    ]);
    return res.status(201).json(JSON.parse(JSON.stringify({ created: full, count: full.length })));
  }

  if (action === "create") {
    const name = text(body.activityName, 191, true);
    if (!name) return res.status(400).json({ error: "An activity name is required." });
    const fitnessType = FITNESS_TYPES.includes(body.fitnessType) ? body.fitnessType : "endurance";
    if (!fitnessTypeAllowedForPlanType(planType, fitnessType)) {
      return res.status(400).json({ error: `${metricProfileFor(fitnessType).label} activities are not available on a Pre-Conditioning plan.` });
    }
    const metricType = primaryMetricFor(fitnessType);
    const athleteId = validId(body.athleteId);
    if (!athleteId) return res.status(400).json({ error: "A valid athleteId is required." });
    const onPlan = await prisma.trainingPlanAthlete.findFirst({ where: { planId, athleteId } });
    if (!onPlan) return res.status(409).json({ error: "This athlete is not part of the plan." });

    const targetUnit = text(body.targetUnit, 50) || null;
    if (targetUnit && !validateUnit(fitnessType, targetUnit)) {
      return res.status(400).json({ error: `Invalid unit for ${fitnessType}. Allowed: ${unitMessage(fitnessType)}` });
    }

    const targetData = buildTargetData(fitnessType, body);
    if (planType === "pre_conditioning" && !hasPrimaryTarget(fitnessType, targetData)) {
      return res.status(400).json({ error: `A target (${metricType}) is required on Pre-Conditioning activities.` });
    }

    const created = await prisma.planActivity.create({
      data: {
        planId,
        athleteId,
        activityName: name,
        fitnessType,
        metricType,
        targetQuantity: targetData.targetQuantity,
        targetUnit: targetData.targetUnit,
        targetSets: targetData.targetSets,
        targetReps: targetData.targetReps,
        targetDistance: targetData.targetDistance,
        targetLoad: targetData.targetLoad,
        targetTimeSec: targetData.targetTimeSec,
        instructions: text(body.instructions, 2000) || null,
        dayIndex: toInt(body.dayIndex),
        weekNumber: toInt(body.weekNumber),
      },
      select: { id: true },
    });

    const full = await prisma.planActivity.findUnique({ where: { id: created.id }, include: { athlete: { select: { id: true, firstName: true, lastName: true } } } });
    await prisma.auditLog.create({
      data: { userId: Number(session.user.id), action: "create", entityType: "planActivity", entityId: created.id, description: `Created activity "${name}" for athlete #${athleteId} on plan #${planId}` },
    });
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
    const finalFitness = data.fitnessType || activity.fitnessType;
    if (data.fitnessType !== undefined && data.fitnessType !== activity.fitnessType && !fitnessTypeAllowedForPlanType(planType, data.fitnessType)) {
      return res.status(400).json({ error: `${metricProfileFor(data.fitnessType).label} activities are not available on a Pre-Conditioning plan.` });
    }
    data.metricType = primaryMetricFor(finalFitness);
    if ("targetUnit" in body) {
      const newUnit = text(body.targetUnit, 50) || null;
      if (newUnit && !validateUnit(finalFitness, newUnit)) {
        return res.status(400).json({ error: `Invalid unit for ${finalFitness}. Allowed: ${unitMessage(finalFitness)}` });
      }
      data.targetUnit = newUnit;
    }
    for (const key of TARGET_KEYS) {
      if (key in body) data[key] = key === "targetSets" || key === "targetReps" ? toInt(body[key]) : toDecimal(body[key]);
    }
    if ("instructions" in body) data.instructions = text(body.instructions, 2000) || null;
    if ("dayIndex" in body) data.dayIndex = toInt(body.dayIndex);
    if ("weekNumber" in body) data.weekNumber = toInt(body.weekNumber);

    if (body.athleteId != null) {
      const newAthleteId = validId(body.athleteId);
      if (!newAthleteId) return res.status(400).json({ error: "A valid athleteId is required." });
      const onPlan = await prisma.trainingPlanAthlete.findFirst({ where: { planId, athleteId: newAthleteId } });
      if (!onPlan) return res.status(409).json({ error: "This athlete is not part of the plan." });
      data.athleteId = newAthleteId;
    }

    /* Lock enforcement on update too: re-sanitize every target column and the
       unit against the type's fixed profile, so disallowed fields (including
       legacy values) are cleared the moment an activity is edited. */
    const sanitized = sanitizeTargetFields(finalFitness, {
      targetQuantity: "targetQuantity" in data ? data.targetQuantity : activity.targetQuantity,
      targetUnit: data.targetUnit !== undefined ? data.targetUnit : activity.targetUnit,
      targetSets: "targetSets" in data ? data.targetSets : activity.targetSets,
      targetReps: "targetReps" in data ? data.targetReps : activity.targetReps,
      targetDistance: "targetDistance" in data ? data.targetDistance : activity.targetDistance,
      targetLoad: "targetLoad" in data ? data.targetLoad : activity.targetLoad,
      targetTimeSec: "targetTimeSec" in data ? data.targetTimeSec : activity.targetTimeSec,
    });
    data.targetQuantity = sanitized.targetQuantity;
    data.targetUnit = sanitized.targetUnit;
    data.targetSets = sanitized.targetSets;
    data.targetReps = sanitized.targetReps;
    data.targetDistance = sanitized.targetDistance;
    data.targetLoad = sanitized.targetLoad;
    data.targetTimeSec = sanitized.targetTimeSec;

    if (planType === "pre_conditioning" && !hasPrimaryTarget(finalFitness, sanitized)) {
      return res.status(400).json({ error: `A target (${primaryMetricFor(finalFitness)}) is required on Pre-Conditioning activities.` });
    }

    await prisma.planActivity.update({ where: { id: activityId }, data });
    await prisma.auditLog.create({
      data: { userId: Number(session.user.id), action: "update", entityType: "planActivity", entityId: activityId, description: `Updated activity #${activityId} on plan #${planId}` },
    });
    return res.status(200).json({ success: true, message: "Activity updated." });
  }

  if (action === "delete") {
    const activityId = validId(body.activityId);
    if (!activityId) return res.status(400).json({ error: "A valid activityId is required." });
    const activity = await prisma.planActivity.findFirst({ where: { id: activityId, planId } });
    if (!activity) return res.status(404).json({ error: "Activity not found." });

    await prisma.planActivity.delete({ where: { id: activityId } });
    await prisma.auditLog.create({
      data: { userId: Number(session.user.id), action: "delete", entityType: "planActivity", entityId: activityId, description: `Removed activity #${activityId} from plan #${planId}` },
    });
    return res.status(200).json({ success: true, message: "Activity removed." });
  }

  return res.status(400).json({ error: "Unknown action." });
}