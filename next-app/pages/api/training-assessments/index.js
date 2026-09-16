import { prisma } from "../../../lib/prisma";
import { requireSession, requireCsrf, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method === "POST") {
    if (!requireCsrf(req, res)) return;
    const body = req.body || {};
    const planId = validId(body.planId);
    const athleteId = validId(body.athleteId);
    if (!planId) return res.status(400).json({ error: "A valid planId is required." });
    if (!athleteId) return res.status(400).json({ error: "A valid athleteId is required." });

    const plan = await prisma.trainingPlan.findUnique({ where: { id: planId }, select: { id: true, coachId: true } });
    if (!plan) return res.status(404).json({ error: "Training plan not found." });
    if (session.user.role === "admin") {
      // admins may write assessments too
    } else {
      const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
      if (!coach || plan.coachId !== coach.id) return res.status(403).json({ error: "You do not have permission to assess this plan." });
    }

    const onPlan = await prisma.trainingPlanAthlete.findFirst({ where: { planId, athleteId }, select: { id: true } });
    if (!onPlan) return res.status(409).json({ error: "This athlete is not part of the plan." });

    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) return res.status(400).json({ error: "Rating must be an integer from 1 to 10." });

    const assessmentDateBody = text(body.assessmentDate, 30);
    const assessmentDate = assessmentDateBody ? new Date(assessmentDateBody) : new Date();
    if (isNaN(assessmentDate)) return res.status(400).json({ error: "Invalid assessment date." });

    const assessment = await prisma.trainingAssessment.upsert({
      where: { planId_athleteId: { planId, athleteId } },
      create: { planId, athleteId, assessmentDate, rating, comments: text(body.comments, 2000) || null, assessedBy: Number(session.user.id) },
      update: { rating, comments: body.comments ? text(body.comments, 2000) : null, assessmentDate },
      include: {
        athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true, sport: { select: { sportName: true } } } },
        plan: { select: { id: true, planName: true, frequency: true } },
        assessor: { select: { username: true, email: true } },
      },
    });
    return res.status(201).json(JSON.parse(JSON.stringify(assessment)));
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

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
      assessor: { select: { username: true, email: true } },
    },
  });
  return res.status(200).json(JSON.parse(JSON.stringify(assessments)));
}