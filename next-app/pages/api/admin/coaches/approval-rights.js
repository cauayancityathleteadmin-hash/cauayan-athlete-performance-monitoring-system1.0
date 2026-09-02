import { prisma } from "../../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, validId, setSecurityHeaders } from "../../../../lib/api-security";
import { rateLimiters } from "../../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireRole(session, "admin", res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:coachapprover`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const coachId = validId(req.body?.coachId);
  if (!coachId) return res.status(400).json({ error: "Coach id is required." });
  const coach = await prisma.coach.findUnique({ where: { id: coachId }, select: { id: true, canApproveCoaches: true, coachCode: true, user: { select: { status: true } } } });
  if (!coach) return res.status(404).json({ error: "Coach not found." });
  if (coach.user.status !== "active") return res.status(409).json({ error: "Only active coach accounts can be given approval rights." });

  const canApproveCoaches = Boolean(req.body.canApproveCoaches);
  await prisma.$transaction([
    prisma.coach.update({ where: { id: coachId }, data: { canApproveCoaches } }),
    prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "update", entityType: "coach", entityId: coachId, description: `${canApproveCoaches ? "Granted" : "Revoked"} coach application approval rights for ${coach.coachCode}` } }),
  ]);
  return res.status(200).json({ success: true, canApproveCoaches });
}