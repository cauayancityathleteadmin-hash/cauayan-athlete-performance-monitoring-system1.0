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

  if (req.method !== "POST" || session.user.role !== "coach") return res.status(405).json({ error: "Coach application method not allowed." });
  if (!requireCsrf(req, res)) return;

  const eventPlanId = validId(req.body?.eventPlanId);
  const reason = text(req.body?.reason, 500) || null;
  if (!eventPlanId) return res.status(400).json({ error: "A valid event plan is required." });

  const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) } });
  if (!coach || coach.status !== "active") return res.status(403).json({ error: "Active coach profile required." });
  const plan = await prisma.eventPlan.findUnique({ where: { id: eventPlanId }, select: { id: true, status: true } });
  if (!plan || plan.status !== "open") return res.status(400).json({ error: "Applications are only allowed for open event plans." });

  const application = await prisma.$transaction(async (tx) => {
    const saved = await tx.eventApplication.upsert({
      where: { eventPlanId_coachId: { eventPlanId, coachId: coach.id } },
      update: { status: "pending", reason, appliedAt: new Date(), reviewedAt: null, reviewedBy: null },
      create: { eventPlanId, coachId: coach.id, reason, status: "pending" },
    });
    await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "apply", entityType: "event_application", entityId: saved.id, description: `Applied to event plan ${eventPlanId}` } });
    return saved;
  });
  return res.status(200).json(application);
}