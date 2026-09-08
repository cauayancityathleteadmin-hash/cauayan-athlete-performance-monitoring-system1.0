import { prisma } from "../../../../../../lib/prisma";
import { requireCsrf, requireSession, validId, text, setSecurityHeaders } from "../../../../../../lib/api-security";
import { rateLimiters } from "../../../../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed." });

  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:plancomments`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const planId = validId(req.query?.id);
  const athleteId = validId(req.query?.athleteId);
  if (!planId || !athleteId) return res.status(400).json({ error: "Invalid plan or athlete ID." });

  if (req.method === "POST") {
    if (!requireCsrf(req, res)) return;
    if (session.user.role !== "admin") return res.status(403).json({ error: "Only administrators can post guidance comments." });
    const body = text(req.body?.body, 2000);
    if (!body) return res.status(400).json({ error: "Write a comment first." });

    const plan = await prisma.trainingPlan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!plan) return res.status(404).json({ error: "Training plan not found." });
    const inPlan = await prisma.trainingPlanAthlete.findUnique({
      where: { planId_athleteId: { planId, athleteId } },
      select: { id: true },
    });
    if (!inPlan) return res.status(400).json({ error: "That athlete is not part of this training plan." });

    const comment = await prisma.athletePlanComment.create({
      data: { planId, athleteId, authorId: Number(session.user.id), body },
      include: { author: { select: { username: true, email: true } } },
    });
    return res.status(201).json({ comment: JSON.parse(JSON.stringify(comment)) });
  }

  const plan = await prisma.trainingPlan.findUnique({
    where: { id: planId },
    select: { id: true, coachId: true },
  });
  if (!plan) return res.status(404).json({ error: "Training plan not found." });

  if (session.user.role === "coach") {
    const [coach, athlete] = await Promise.all([
      prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } }),
      prisma.athlete.findUnique({ where: { id: athleteId }, select: { coachId: true } }),
    ]);
    const ownsPlan = coach && plan.coachId === coach.id;
    const ownsAthlete = coach && athlete && athlete.coachId === coach.id;
    if (!ownsPlan && !ownsAthlete) {
      return res.status(403).json({ error: "You do not have access to these comments." });
    }
  }

  const comments = await prisma.athletePlanComment.findMany({
    where: { planId, athleteId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { username: true, email: true, coach: { select: { firstName: true, lastName: true } } } } },
  });
  return res.status(200).json({ comments: JSON.parse(JSON.stringify(comments)) });
}