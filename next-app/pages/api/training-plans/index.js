import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

const FREQUENCIES = ["day", "week", "month"];

async function resolveCoach(session) {
  return prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method === "GET") {
    const isAdmin = session.user.role === "admin";
    let where = {};
    if (!isAdmin) {
      const coach = await resolveCoach(session);
      where = coach ? { coachId: coach.id } : { coachId: -1 };
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

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;
  if (!["admin", "coach"].includes(session.user.role)) return res.status(403).json({ error: "You do not have permission for this action." });

  const body = req.body || {};
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
  if (session.user.role === "admin") {
    const coach = await prisma.coach.findUnique({ where: { id: coachId, status: "active" }, select: { id: true } });
    if (!coach) return res.status(400).json({ error: "Selected coach is invalid." });
  }

  const startDate = text(body.startDate, 10, true);
  if (!startDate) return res.status(400).json({ error: "A start date is required." });
  const endDate = text(body.endDate, 10) || null;
  if (endDate && new Date(endDate) < new Date(startDate)) return res.status(400).json({ error: "End date must be on or after the start date." });
  const frequency = FREQUENCIES.includes(body.frequency) ? body.frequency : "day";

  let athleteIds = Array.isArray(body.athleteIds) ? [...new Set(body.athleteIds.map(validId).filter(Boolean))] : [];
  if (session.user.role === "coach") {
    const actors = await prisma.athlete.findMany({ where: { id: { in: athleteIds }, coachId, status: "active" }, select: { id: true } });
    athleteIds = actors.map((a) => a.id);
  } else if (athleteIds.length) {
    const actors = await prisma.athlete.findMany({ where: { id: { in: athleteIds }, status: "active" }, select: { id: true } });
    athleteIds = actors.map((a) => a.id);
  }
  if (!athleteIds.length) return res.status(400).json({ error: "Select at least one active athlete for the plan." });

  const created = await prisma.$transaction(async (tx) => {
    const plan = await tx.trainingPlan.create({
      data: {
        planName,
        description: text(body.description, 2000) || null,
        sportId,
        coachId,
        frequency,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        status: body.status === "completed" ? "completed" : "active",
      },
      select: { id: true },
    });
    await tx.trainingPlanAthlete.createMany({ data: athleteIds.map((id) => ({ planId: plan.id, athleteId: id })) });
    await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "trainingPlan", entityId: plan.id, description: `Created training plan "${planName}"` } });
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