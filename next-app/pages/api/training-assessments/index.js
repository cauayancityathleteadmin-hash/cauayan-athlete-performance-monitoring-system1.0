import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

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
      const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true, athletes: { select: { id: true } } } });
      if (!coach) return res.status(200).json([]);
      where = { athleteId: { in: coach.athletes.map((a) => a.id) } };
    }
    const assessments = await prisma.trainingAssessment.findMany({
      where,
      orderBy: { assessmentDate: "desc" },
      take: 200,
      include: {
        athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true, sport: { select: { sportName: true } } } },
        plan: { select: { id: true, planName: true, frequency: true } },
        session: { select: { id: true, sessionDate: true } },
        assessor: { select: { username: true, email: true } },
      },
    });
    return res.status(200).json(JSON.parse(JSON.stringify(assessments)));
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;
  if (!["admin", "coach"].includes(session.user.role)) return res.status(403).json({ error: "You do not have permission for this action." });

  const body = req.body || {};
  const athleteId = validId(body.athleteId);
  if (!athleteId) return res.status(400).json({ error: "A valid athlete is required." });
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "Rating must be a whole number from 1 to 5." });

  const planId = validId(body.planId);
  if (planId) {
    const plan = await prisma.trainingPlan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!plan) return res.status(400).json({ error: "Selected training plan is invalid." });
  }

  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId, status: "active" }, select: { id: true, coachId: true } });
  if (!athlete) return res.status(400).json({ error: "Selected athlete is invalid or inactive." });
  if (session.user.role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || athlete.coachId !== coach.id) return res.status(403).json({ error: "You can only assess your own athletes." });
  }

  const created = await prisma.$transaction(async (tx) => {
    const assessment = await tx.trainingAssessment.create({
      data: {
        planId: planId || null,
        sessionId: validId(body.sessionId) || null,
        athleteId,
        assessmentDate: new Date(),
        rating,
        comments: text(body.comments, 2000) || null,
        assessedBy: Number(session.user.id),
      },
      select: { id: true },
    });
    await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "trainingAssessment", entityId: assessment.id, description: `Recorded training assessment (${rating}/5) for athlete #${athleteId}` } });
    return assessment.id;
  });

  const full = await prisma.trainingAssessment.findUnique({
    where: { id: created },
    include: { athlete: { select: { id: true, firstName: true, lastName: true } }, plan: { select: { id: true, planName: true } }, assessor: { select: { username: true, email: true } } },
  });
  return res.status(201).json(JSON.parse(JSON.stringify(full)));
}