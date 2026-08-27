import { prisma } from "../../../../lib/prisma";
import { requireSession, requireRole, requireCsrf, setSecurityHeaders } from "../../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).end();

  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (!requireRole(session, "admin", res)) return;
  if (!requireCsrf(req, res)) return;

  const { coachId } = req.body;
  if (!coachId || typeof coachId !== "number" || coachId <= 0) {
    return res.status(400).json({ error: "Invalid coach ID" });
  }

  const coach = await prisma.coach.findUnique({
    where: { id: coachId },
    include: { user: true },
  });

  if (!coach) {
    return res.status(404).json({ error: "Coach not found" });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: coach.userId },
      data: { mustChangePassword: true, passwordChangedAt: null },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "coach_password_reset",
        description: `Reset password requirement for coach ${coachId}`,
      },
    }),
  ]);

  return res.status(200).json({ success: true });
}