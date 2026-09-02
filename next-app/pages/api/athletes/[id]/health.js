import { prisma } from "../../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../../lib/api-security";
import { rateLimiters } from "../../../../lib/rate-limit";

const HEALTH_STATUS = ["healthy", "sick", "injured", "recovering", "inactive"];

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:healthlog`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const athleteId = validId(req.query?.id);
  if (!athleteId) return res.status(400).json({ error: "Invalid athlete ID." });

  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { id: true, coachId: true } });
  if (!athlete) return res.status(404).json({ error: "Athlete not found." });

  if (session.user.role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || athlete.coachId !== coach.id) {
      return res.status(403).json({ error: "You do not have access to this athlete." });
    }
  }

  const body = req.body || {};
  const status = body.status;
  if (!HEALTH_STATUS.includes(status)) {
    return res.status(400).json({ error: "Provide a valid health status." });
  }
  const description = text(body.description, 2000) || null;

  const result = await prisma.$transaction(async (tx) => {
    const log = await tx.healthLog.create({
      data: { athleteId, status, description, reportedBy: Number(session.user.id) },
    });
    const updated = await tx.athlete.update({
      where: { id: athleteId },
      data: { healthStatus: status, healthNotes: description ?? undefined },
      select: { healthStatus: true, healthNotes: true },
    });
    await tx.auditLog.create({
      data: { userId: Number(session.user.id), action: "create", entityType: "healthLog", entityId: log.id, description: `Logged ${status} health for athlete #${athleteId}` },
    });
    return { log, athlete: updated };
  });

  return res.status(201).json({ message: "Health status updated.", ...JSON.parse(JSON.stringify(result)) });
}