import { prisma } from "../../lib/prisma";
import { requireSession, setSecurityHeaders } from "../../lib/api-security";
import { rateLimiters } from "../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:nav-shortcuts`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const isAdmin = session.user.role === "admin";
  let coachId = null;
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    coachId = coach?.id ?? null;
  }

  const where = isAdmin ? {} : coachId ? { coachId } : { coachId: -1 };

  const [plans, athletes] = await Promise.all([
    prisma.trainingPlan.findMany({
      where: { ...where, isTemplate: false },
      orderBy: { startDate: "desc" },
      select: { id: true, planName: true },
      take: 100,
    }),
    prisma.athlete.findMany({
      where: { status: "active", ...(!isAdmin && coachId ? { coachId } : {}) },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true },
      take: 200,
    }),
  ]);

  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json(JSON.parse(JSON.stringify({ plans, athletes })));
}