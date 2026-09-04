import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

const STATUSES = ["planned", "done", "partial", "missed"];

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

async function isPlanOwnerForActivity(prismaClient, session, activityId) {
  const activity = await prismaClient.planActivity.findUnique({ where: { id: activityId }, include: { plan: { select: { coachId: true } } } });
  if (!activity) return null;
  if (session.user.role === "admin") return { activity };
  const coach = await prismaClient.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
  if (coach && activity.plan.coachId === coach.id) return { activity };
  return false;
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method === "GET") {
    const planId = validId(req.query.planId);
    const activityId = validId(req.query.activityId);
    const athleteId = validId(req.query.athleteId);
    if (!planId && !activityId) return res.status(400).json({ error: "Provide a planId or activityId to list progress." });

    const where = {};
    if (activityId) where.activityId = activityId;
    else if (planId) {
      const activities = await prisma.planActivity.findMany({ where: { planId }, select: { id: true } });
      where.activityId = { in: activities.map((a) => a.id) };
    }
    if (athleteId) where.athleteId = athleteId;

    const logs = await prisma.planActivityLog.findMany({
      where,
      orderBy: [{ performedAt: "desc" }],
      include: {
        athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } },
        logger: { select: { id: true, email: true, username: true } },
        activity: { select: { id: true, activityName: true, fitnessType: true } },
      },
      take: 500,
    });
    return res.status(200).json(JSON.parse(JSON.stringify(logs)));
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const body = req.body || {};
  const activityId = validId(body.activityId);
  if (!activityId) return res.status(400).json({ error: "A valid activityId is required." });
  const access = await isPlanOwnerForActivity(prisma, session, activityId);
  if (access === null) return res.status(404).json({ error: "Activity not found." });
  if (access === false) return res.status(403).json({ error: "You do not have permission to log progress for this activity." });

  const athleteId = validId(body.athleteId);
  if (!athleteId) return res.status(400).json({ error: "A valid athleteId is required." });
  const onPlan = await prisma.trainingPlanAthlete.findFirst({ where: { planId: access.activity.plan.id, athleteId } });
  if (!onPlan) return res.status(409).json({ error: "This athlete is not part of the plan." });
  if (access.activity.athleteId !== athleteId) return res.status(409).json({ error: "This activity is for a different athlete." });

  const status = STATUSES.includes(body.status) ? body.status : "planned";
  const performedAtBody = text(body.performedAt, 30);
  const performedAt = performedAtBody ? new Date(performedAtBody) : new Date();
  if (isNaN(performedAt)) return res.status(400).json({ error: "Invalid date." });

  const create = {
    activityId,
    athleteId,
    performedAt,
    status,
    quantityDone: toDecimal(body.quantityDone),
    setsDone: toInt(body.setsDone),
    repsDone: toInt(body.repsDone),
    notes: text(body.notes, 2000) || null,
    loggedBy: Number(session.user.id),
  };
  const log = await prisma.planActivityLog.create({ data: create });

  const full = await prisma.planActivityLog.findUnique({ where: { id: log.id }, include: { athlete: { select: { id: true, firstName: true, lastName: true } }, logger: { select: { email: true, username: true } }, activity: { select: { id: true, activityName: true } } } });
  return res.status(201).json(JSON.parse(JSON.stringify(full)));
}