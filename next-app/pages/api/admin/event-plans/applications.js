import { prisma } from "../../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, text, validId, setSecurityHeaders } from "../../../../lib/api-security";
import { sendEventApplicationDecisionEmail } from "../../../../lib/email";
import { rateLimiters } from "../../../../lib/rate-limit";

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

  const applicationId = validId(req.body?.applicationId);
  const decision = req.body?.decision;
  const reason = text(req.body?.reason, 500) || null;
  if (!applicationId || !["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "Application and decision are required." });

  const application = await prisma.eventApplication.findUnique({ where: { id: applicationId }, include: { eventPlan: { include: { sports: true } } } });
  if (!application) return res.status(404).json({ error: "Application not found." });
  if (application.status !== "pending") return res.status(409).json({ error: "Only pending applications can be reviewed." });

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.eventApplication.update({ where: { id: applicationId }, data: { status: decision, reason, reviewedAt: new Date(), reviewedBy: Number(session.user.id) } });
    if (decision === "approved") {
      for (const planSport of application.eventPlan.sports) {
        const existing = await tx.eventParticipant.findFirst({ where: { eventPlanId: application.eventPlanId, coachId: application.coachId, sportId: planSport.sportId, participantType: "coach", status: "active" } });
        if (!existing) await tx.eventParticipant.create({ data: { eventPlanId: application.eventPlanId, coachId: application.coachId, sportId: planSport.sportId, participantType: "coach", status: "active", addedBy: Number(session.user.id) } });
      }
    }
    await tx.auditLog.create({ data: { userId: Number(session.user.id), action: decision, entityType: "event_application", entityId: applicationId, description: `${decision} event application ${applicationId}` } });
    return updated;
  });

  const coach = await prisma.coach.findUnique({ where: { id: application.coachId }, select: { firstName: true, lastName: true, email: true } });
  if (coach) {
    await sendEventApplicationDecisionEmail({
      email: coach.email,
      name: `${coach.firstName} ${coach.lastName}`.trim(),
      eventPlanName: application.eventPlan.eventName,
      decision,
      reason,
    }).catch(() => {});
  }

  return res.status(200).json(saved);
}