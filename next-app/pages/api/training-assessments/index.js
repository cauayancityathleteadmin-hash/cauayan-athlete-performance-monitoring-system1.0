import { prisma } from "../../../lib/prisma";
import { requireSession, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

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
      session: { select: { id: true, sessionDate: true } },
      assessor: { select: { username: true, email: true } },
    },
  });
  return res.status(200).json(JSON.parse(JSON.stringify(assessments)));
}