import { prisma } from "../../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, text, validId, setSecurityHeaders } from "../../../../lib/api-security";
import { rateLimiters } from "../../../../lib/rate-limit";
import { sendCoachApprovalEmail, sendCoachRejectionEmail } from "../../../../lib/email";

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
  if (!coachId || !["approved", "rejected", "delete"].includes(decision)) return res.status(400).json({ error: "Coach and decision are required." });
  const coach = await prisma.coach.findUnique({ where: { id: coachId }, include: { user: true, athletes: { select: { id: true } } } });
  if (!coach) return res.status(404).json({ error: "Coach account not found." });

  if (decision === "delete") {
    if (coach.athletes.length > 0) {
      return res.status(409).json({ error: `Coach still has ${coach.athletes.length} assigned athlete${coach.athletes.length === 1 ? "" : "s"}. Reassign or remove their athletes before deleting the account.` });
    }
    await prisma.$transaction(async (tx) => {
      // Clean up any records that reference the coach/user and are not fully cascaded.
      await tx.coachSport.deleteMany({ where: { coachId } });
      await tx.eventApplication.deleteMany({ where: { coachId } });
      await tx.eventParticipant.deleteMany({ where: { coachId } });
      await tx.athleteCoachHistory.deleteMany({ where: { coachId } });
      await tx.passwordResetToken.deleteMany({ where: { userId: coach.userId } });
      await tx.assessment.deleteMany({ where: { recordedBy: coach.userId } });
      await tx.auditLog.deleteMany({ where: { userId: coach.userId } });
      await tx.user.delete({ where: { id: coach.userId } });
      await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "delete", entityType: "coach", entityId: coachId, description: `deleted coach account ${coach.coachCode}${reason ? `: ${reason}` : ""}` } });
    });
    return res.status(200).json({ success: true, status: "deleted", message: "Coach account deleted." });
  }

  const isPending = coach.user.status === "pending";
  const isRejected = coach.user.status === "rejected";

  if (decision === "rejected" && !isPending) return res.status(409).json({ error: "Only pending coach applications can be rejected here." });
  if (decision === "approved" && !isPending && !isRejected) return res.status(409).json({ error: "Coach account is not awaiting action." });

  const status = decision === "approved" ? "active" : "rejected";

  if (decision === "approved" && isPending) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: coach.userId }, data: { status: "active", mustChangePassword: false } }),
      prisma.coach.update({ where: { id: coachId }, data: { status: "active" } }),
      prisma.auditLog.create({ data: { userId: Number(session.user.id), action: decision, entityType: "coach", entityId: coachId, description: `${decision} coach application ${coach.coachCode}${reason ? `: ${reason}` : ""}` } }),
    ]);

    const emailed = await sendCoachApprovalEmail({
      email: coach.email,
      name: `${coach.firstName} ${coach.lastName}`,
      coachCode: coach.coachCode,
    });

    return res.status(200).json({ success: true, status, message: emailed ? "Coach approved. Sign in with the password you registered with." : "Coach approved. A confirmation email could not be sent." });
  }

  if (decision === "approved" && isRejected) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: coach.userId }, data: { status: "active", mustChangePassword: false } }),
      prisma.coach.update({ where: { id: coachId }, data: { status: "active" } }),
      prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "reapprove", entityType: "coach", entityId: coachId, description: `reapproved coach ${coach.coachCode}${reason ? `: ${reason}` : ""}` } }),
    ]);

    const emailed = await sendCoachApprovalEmail({
      email: coach.email,
      name: `${coach.firstName} ${coach.lastName}`,
      coachCode: coach.coachCode,
    });

    return res.status(200).json({ success: true, status: "active", message: emailed ? "Coach reapproved. Sign in with the password you registered with." : "Coach reapproved. A confirmation email could not be sent." });
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: coach.userId }, data: { status } }),
    prisma.coach.update({ where: { id: coachId }, data: { status: "inactive" } }),
    prisma.auditLog.create({ data: { userId: Number(session.user.id), action: decision, entityType: "coach", entityId: coachId, description: `${decision} coach application ${coach.coachCode}${reason ? `: ${reason}` : ""}` } }),
  ]);

  await sendCoachRejectionEmail({
    email: coach.email,
    name: `${coach.firstName} ${coach.lastName}`,
    coachCode: coach.coachCode,
    reason,
  });

  return res.status(200).json({ success: true, status, message: "Coach rejected. Notification sent via email." });
}