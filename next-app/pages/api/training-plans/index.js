import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

const FREQUENCIES = ["day", "week", "month"];
const STATUSES = ["active", "completed"];

function toDurationWeeks(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

async function resolveCoach(session) {
  return prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
}

async function canAccessPlan(prismaClient, session, planId, requireAdmin = false) {
  const plan = await prismaClient.trainingPlan.findUnique({ where: { id: planId }, select: { id: true, coachId: true, isTemplate: true } });
  if (!plan) return null;
  if (session.user.role === "admin") return plan;
  if (requireAdmin) return false;
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

  const isAdmin = session.user.role === "admin";

  if (req.method === "GET") {
    const { template } = req.query;
    let where = {};
    if (!isAdmin) {
      const coach = await resolveCoach(session);
      where = coach ? { coachId: coach.id } : { coachId: -1 };
    }
    if (template === "true") {
      where.isTemplate = true;
    } else if (template === "false") {
      where.isTemplate = false;
    }
    const plans = await prisma.trainingPlan.findMany({
      where,
      orderBy: { startDate: "desc" },
      include: {
        sport: { select: { id: true, sportName: true } },
        coach: { select: { id: true, coachCode: true, firstName: true, lastName: true } },
        athletes: { include: { athlete: { select: { id: true, athleteCode: true, firstName: true, middleName: true, lastName: true, healthStatus: true, status: true } } } },
        assessments: { include: { athlete: { select: { id: true, firstName: true, lastName: true } }, assessor: { select: { username: true, email: true } } }, orderBy: { assessmentDate: "desc" } },
      },
    });
    return res.status(200).json(JSON.parse(JSON.stringify(plans)));
  }

  if (req.method === "POST") {
    if (!requireCsrf(req, res)) return;
    if (!["admin", "coach"].includes(session.user.role)) return res.status(403).json({ error: "You do not have permission for this action." });

    const body = req.body || {};
    const action = body.action || "create";

    if (action === "create") {
      const planName = text(body.planName, 191, true);
      if (!planName) return res.status(400).json({ error: "A plan name is required." });
      const sportId = validId(body.sportId);
      if (!sportId) return res.status(400).json({ error: "A valid sport is required." });
      const sport = await prisma.sport.findUnique({ where: { id: sportId, status: "active" }, select: { id: true } });
      if (!sport) return res.status(400).json({ error: "Selected sport is invalid." });

      let coachId = validId(body.coachId);
      if (session.user.role === "coach") {
        const coach = await resolveCoach(session);
        if (!coach) return res.status(403).json({ error: "Coach account not found." });
        coachId = coach.id;
      }
      if (!coachId) return res.status(400).json({ error: "A valid coach is required." });
      if (isAdmin) {
        const coach = await prisma.coach.findUnique({ where: { id: coachId, status: "active" }, select: { id: true } });
        if (!coach) return res.status(400).json({ error: "Selected coach is invalid." });
      }

      const startDate = text(body.startDate, 10, true);
      if (!startDate) return res.status(400).json({ error: "A start date is required." });
      const endDate = text(body.endDate, 10) || null;
      if (endDate && new Date(endDate) < new Date(startDate)) return res.status(400).json({ error: "End date must be on or after the start date." });
      const frequency = FREQUENCIES.includes(body.frequency) ? body.frequency : "day";
      const durationWeeks = toDurationWeeks(body.durationWeeks);
      const isTemplate = Boolean(body.isTemplate);
      if (isTemplate && !isAdmin) return res.status(403).json({ error: "Only admins can create template plans." });

      let athleteIds = Array.isArray(body.athleteIds) ? [...new Set(body.athleteIds.map(validId).filter(Boolean))] : [];
      if (isTemplate) {
        athleteIds = [];
      } else {
        if (session.user.role === "coach") {
          const actors = await prisma.athlete.findMany({ where: { id: { in: athleteIds }, coachId, status: "active" }, select: { id: true } });
          athleteIds = actors.map((a) => a.id);
        } else if (athleteIds.length) {
          const actors = await prisma.athlete.findMany({ where: { id: { in: athleteIds }, status: "active" }, select: { id: true } });
          athleteIds = actors.map((a) => a.id);
        }
        if (!athleteIds.length) return res.status(400).json({ error: "Select at least one active athlete for the plan." });
      }

      const created = await prisma.$transaction(async (tx) => {
        const plan = await tx.trainingPlan.create({
          data: {
            planName,
            description: text(body.description, 2000) || null,
            sportId,
            coachId,
            frequency,
            durationWeeks,
            startDate: new Date(startDate),
            endDate: endDate ? new Date(endDate) : null,
            status: STATUSES.includes(body.status) ? body.status : "active",
            isTemplate,
          },
          select: { id: true },
        });
        if (!isTemplate && athleteIds.length) {
          await tx.trainingPlanAthlete.createMany({ data: athleteIds.map((id) => ({ planId: plan.id, athleteId: id })) });
        }
        await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "trainingPlan", entityId: plan.id, description: `Created training plan "${planName}"${isTemplate ? " (template)" : ""}` } });
        return plan.id;
      });

      const full = await prisma.trainingPlan.findUnique({
        where: { id: created },
        include: {
          sport: { select: { id: true, sportName: true } },
          coach: { select: { id: true, coachCode: true, firstName: true, lastName: true } },
          athletes: { include: { athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } } } },
        },
      });
      return res.status(201).json(JSON.parse(JSON.stringify(full)));
    }

    if (action === "duplicate") {
      const sourcePlanId = validId(body.sourcePlanId);
      if (!sourcePlanId) return res.status(400).json({ error: "A valid source plan ID is required." });
      const sourcePlan = await prisma.trainingPlan.findUnique({
        where: { id: sourcePlanId },
        include: { activities: { include: { targets: true } }, athletes: { select: { athleteId: true } } },
      });
      if (!sourcePlan) return res.status(404).json({ error: "Source plan not found." });
      const access = await canAccessPlan(prisma, session, sourcePlanId);
      if (access === null) return res.status(404).json({ error: "Source plan not found." });
      if (access === false) return res.status(403).json({ error: "You do not have permission to duplicate this plan." });

      let coachId = validId(body.coachId);
      if (session.user.role === "coach") {
        const coach = await resolveCoach(session);
        if (!coach) return res.status(403).json({ error: "Coach account not found." });
        coachId = coach.id;
      }
      if (!coachId) coachId = sourcePlan.coachId;
      if (isAdmin) {
        const coach = await prisma.coach.findUnique({ where: { id: coachId, status: "active" }, select: { id: true } });
        if (!coach) return res.status(400).json({ error: "Selected coach is invalid." });
      }

      const startDate = text(body.startDate, 10, true);
      if (!startDate) return res.status(400).json({ error: "A start date is required." });
      const endDate = text(body.endDate, 10) || null;
      if (endDate && new Date(endDate) < new Date(startDate)) return res.status(400).json({ error: "End date must be on or after the start date." });

      let athleteIds = Array.isArray(body.athleteIds) ? [...new Set(body.athleteIds.map(validId).filter(Boolean))] : [];
      if (session.user.role === "coach") {
        const actors = await prisma.athlete.findMany({ where: { id: { in: athleteIds }, coachId, status: "active" }, select: { id: true } });
        athleteIds = actors.map((a) => a.id);
      } else if (athleteIds.length) {
        const actors = await prisma.athlete.findMany({ where: { id: { in: athleteIds }, status: "active" }, select: { id: true } });
        athleteIds = actors.map((a) => a.id);
      }
      if (!athleteIds.length) return res.status(400).json({ error: "Select at least one active athlete for the new plan." });

      const created = await prisma.$transaction(async (tx) => {
        const plan = await tx.trainingPlan.create({
          data: {
            planName: body.planName || `${sourcePlan.planName} (copy)`,
            description: sourcePlan.description,
            sportId: sourcePlan.sportId,
            coachId,
            frequency: sourcePlan.frequency,
            durationWeeks: sourcePlan.durationWeeks,
            startDate: new Date(startDate),
            endDate: endDate ? new Date(endDate) : null,
            status: "active",
            isTemplate: false,
          },
          select: { id: true },
        });
        await tx.trainingPlanAthlete.createMany({ data: athleteIds.map((id) => ({ planId: plan.id, athleteId: id })) });
        for (const activity of sourcePlan.activities) {
          const newActivity = await tx.planActivity.create({
            data: {
              planId: plan.id,
              activityName: activity.activityName,
              fitnessType: activity.fitnessType,
              targetQuantity: activity.targetQuantity,
              targetUnit: activity.targetUnit,
              targetSets: activity.targetSets,
              targetReps: activity.targetReps,
              targetDistance: activity.targetDistance,
              targetLoad: activity.targetLoad,
              instructions: activity.instructions,
              orderIndex: activity.orderIndex,
            },
            select: { id: true },
          });
          if (activity.targets.length) {
            await tx.planActivityTarget.createMany({
              data: activity.targets.map((t) => ({
                activityId: newActivity.id,
                athleteId: t.athleteId,
                targetQuantity: t.targetQuantity,
                targetUnit: t.targetUnit,
                targetSets: t.targetSets,
                targetReps: t.targetReps,
                targetDistance: t.targetDistance,
                targetLoad: t.targetLoad,
                note: t.note,
              })),
            });
          }
        }
        await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "trainingPlan", entityId: plan.id, description: `Duplicated training plan from #${sourcePlanId}` } });
        return plan.id;
      });

      const full = await prisma.trainingPlan.findUnique({
        where: { id: created },
        include: {
          sport: { select: { id: true, sportName: true } },
          coach: { select: { id: true, coachCode: true, firstName: true, lastName: true } },
          athletes: { include: { athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } } } },
        },
      });
      return res.status(201).json(JSON.parse(JSON.stringify(full)));
    }

    return res.status(400).json({ error: "Unknown action." });
  }

  if (req.method === "PUT") {
    if (!requireCsrf(req, res)) return;
    if (!["admin", "coach"].includes(session.user.role)) return res.status(403).json({ error: "You do not have permission for this action." });

    const planId = validId(req.query.id || req.body?.planId);
    if (!planId) return res.status(400).json({ error: "A valid plan ID is required." });
    const access = await canAccessPlan(prisma, session, planId);
    if (access === null) return res.status(404).json({ error: "Training plan not found." });
    if (access === false) return res.status(403).json({ error: "You do not have permission to edit this plan." });

    const body = req.body || {};
    const data = {};

    if (body.planName !== undefined) {
      const planName = text(body.planName, 191, true);
      if (!planName) return res.status(400).json({ error: "A plan name is required." });
      data.planName = planName;
    }
    if (body.description !== undefined) data.description = text(body.description, 2000) || null;
    if (body.sportId !== undefined) {
      const sportId = validId(body.sportId);
      if (!sportId) return res.status(400).json({ error: "A valid sport is required." });
      const sport = await prisma.sport.findUnique({ where: { id: sportId, status: "active" }, select: { id: true } });
      if (!sport) return res.status(400).json({ error: "Selected sport is invalid." });
      data.sportId = sportId;
    }
    if (body.frequency !== undefined) {
      const frequency = FREQUENCIES.includes(body.frequency) ? body.frequency : "day";
      data.frequency = frequency;
    }
    if (body.durationWeeks !== undefined) {
      data.durationWeeks = toDurationWeeks(body.durationWeeks);
    }
    if (body.startDate !== undefined) {
      const startDate = text(body.startDate, 10, true);
      if (!startDate) return res.status(400).json({ error: "A start date is required." });
      data.startDate = new Date(startDate);
    }
    if (body.endDate !== undefined) {
      const endDate = text(body.endDate, 10) || null;
      if (endDate && body.startDate && new Date(endDate) < new Date(body.startDate)) return res.status(400).json({ error: "End date must be on or after the start date." });
      if (endDate && !body.startDate) {
        const plan = await prisma.trainingPlan.findUnique({ where: { id: planId }, select: { startDate: true } });
        if (plan && new Date(endDate) < new Date(plan.startDate)) return res.status(400).json({ error: "End date must be on or after the start date." });
      }
      data.endDate = endDate ? new Date(endDate) : null;
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) return res.status(400).json({ error: "Invalid status." });
      data.status = body.status;
    }
    if (isAdmin && body.isTemplate !== undefined) {
      data.isTemplate = Boolean(body.isTemplate);
    }
    if (body.coachId !== undefined && isAdmin) {
      const coachId = validId(body.coachId);
      if (!coachId) return res.status(400).json({ error: "A valid coach is required." });
      const coach = await prisma.coach.findUnique({ where: { id: coachId, status: "active" }, select: { id: true } });
      if (!coach) return res.status(400).json({ error: "Selected coach is invalid." });
      data.coachId = coachId;
    }

    if (Object.keys(data).length === 0) return res.status(400).json({ error: "No valid fields to update." });

    await prisma.trainingPlan.update({ where: { id: planId }, data });
    await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "update", entityType: "trainingPlan", entityId: planId, description: `Updated training plan #${planId}` } });

    const updated = await prisma.trainingPlan.findUnique({
      where: { id: planId },
      include: {
        sport: { select: { id: true, sportName: true } },
        coach: { select: { id: true, coachCode: true, firstName: true, lastName: true } },
        athletes: { include: { athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } } } },
      },
    });
    return res.status(200).json(JSON.parse(JSON.stringify(updated)));
  }

  if (req.method === "DELETE") {
    if (!requireCsrf(req, res)) return;
    if (!["admin", "coach"].includes(session.user.role)) return res.status(403).json({ error: "You do not have permission for this action." });

    const planId = validId(req.query.id || req.body?.planId);
    if (!planId) return res.status(400).json({ error: "A valid plan ID is required." });
    const access = await canAccessPlan(prisma, session, planId);
    if (access === null) return res.status(404).json({ error: "Training plan not found." });
    if (access === false) return res.status(403).json({ error: "You do not have permission to delete this plan." });

    await prisma.trainingPlan.delete({ where: { id: planId } });
    await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "delete", entityType: "trainingPlan", entityId: planId, description: `Deleted training plan #${planId}` } });
    return res.status(200).json({ success: true, message: "Training plan deleted." });
  }

  return res.status(405).json({ error: "Method not allowed." });
}