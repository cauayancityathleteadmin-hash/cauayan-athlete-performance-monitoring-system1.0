import { prisma } from "../../../../lib/prisma";
import { requireCsrf, requireSession, setSecurityHeaders, text } from "../../../../lib/api-security";
import { rateLimiters } from "../../../../lib/rate-limit";

const ALLOWED_STATUS = new Set(["active", "inactive"]);

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireCsrf(req, res)) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (!rateLimiters.api(`api:${ip}:status`).allowed) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const athleteId = Number(req.query?.id);
  if (!Number.isSafeInteger(athleteId) || athleteId <= 0) return res.status(400).json({ error: "Invalid athlete ID." });

  const newStatus = text(req.body?.status, 20, true);
  if (!newStatus || !ALLOWED_STATUS.has(newStatus)) return res.status(400).json({ error: "A valid status is required." });

  const reason = text(req.body?.reason, 500);

  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { id: true, coachId: true, status: true, athleteCode: true } });
  if (!athlete) return res.status(404).json({ error: "Athlete not found." });

  if (session.user.role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || athlete.coachId !== coach.id) {
      return res.status(403).json({ error: "You do not have access to this athlete." });
    }
  }

  if (athlete.status === newStatus) {
    return res.status(200).json({ success: true, message: "No change — athlete is already " + newStatus + ".", unchanged: true });
  }

  await prisma.$transaction([
    prisma.athlete.update({ where: { id: athleteId }, data: { status: newStatus } }),
    prisma.athleteStatusHistory.create({
      data: {
        athleteId,
        oldStatus: athlete.status,
        newStatus,
        changedBy: Number(session.user.id),
        reason: reason || null,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "update",
        entityType: "athlete",
        entityId: athleteId,
        description: `Changed athlete status to ${newStatus}`,
      },
    }),
  ]);

  return res.status(200).json({ success: true, message: `Athlete status updated to ${newStatus}.` });
}
