import { prisma } from "../../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, text, validId, setSecurityHeaders } from "../../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (!requireRole(session, "admin", res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const coachId = validId(req.body?.coachId);
  const decision = req.body?.decision;
  const reason = text(req.body?.reason, 500) || null;
  if (!coachId || !["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "Coach and decision are required." });
  const coach = await prisma.coach.findUnique({ where: { id: coachId }, include: { user: true } });
  if (!coach || coach.user.status !== "pending") return res.status(409).json({ error: "Pending coach application not found." });

  const status = decision === "approved" ? "active" : "rejected";
  await prisma.$transaction([
    prisma.user.update({ where: { id: coach.userId }, data: { status } }),
    prisma.coach.update({ where: { id: coachId }, data: { status: decision === "approved" ? "active" : "inactive" } }),
    prisma.auditLog.create({ data: { userId: Number(session.user.id), action: decision, entityType: "coach", entityId: coachId, description: `${decision} coach application ${coach.coachCode}${reason ? `: ${reason}` : ""}` } }),
  ]);
  return res.status(200).json({ success: true, status });
}