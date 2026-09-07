import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { sendCoachApprovalEmail, sendCoachRejectionEmail } from "../../../lib/email";
import { notifyCoach } from "../../../lib/notify";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:coachapprovals`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  // This endpoint is a coach-registration approval power. It is open to an ACTIVE coach
  // who has been granted `canApproveCoaches`. It grants NO other admin authority.
  const approver = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true, canApproveCoaches: true } });
  if (!approver || !approver.canApproveCoaches) return res.status(403).json({ error: "You do not have coach application approval rights." });

  if (req.method === "GET") {
    const applications = await prisma.coach.findMany({
      where: { user: { status: "pending" } },
      orderBy: { dateRegistered: "asc" },
      select: {
        id: true,
        coachCode: true,
        firstName: true,
        lastName: true,
        middleName: true,
        email: true,
        contactNumber: true,
        dateRegistered: true,
        school: { select: { schoolName: true } },
        sports: { include: { sport: { select: { sportName: true } } } },
        user: { select: { status: true } },
      },
    });
    return res.status(200).json(applications.map((c) => ({ ...c, dateRegistered: c.dateRegistered.toISOString(), sports: c.sports.map((cs) => cs.sport.sportName) })));
  }

  if (req.method === "POST") {
    if (!requireCsrf(req, res)) return;
    const coachId = validId(req.body?.coachId);
    const decision = req.body?.decision;
    const reason = text(req.body?.reason, 500) || null;
    if (!coachId || !["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "Coach and decision (approved or rejected) are required." });

    const target = await prisma.coach.findUnique({ where: { id: coachId }, include: { user: true } });
    if (!target) return res.status(404).json({ error: "Coach account not found." });
    if (target.user.status !== "pending") return res.status(409).json({ error: "Only pending coach applications can be reviewed here." });
    if (target.id === approver.id) return res.status(409).json({ error: "You cannot review your own coach application." });

    const status = decision === "approved" ? "active" : "rejected";

    await prisma.$transaction([
      prisma.user.update({ where: { id: target.userId }, data: { status } }),
      prisma.coach.update({ where: { id: target.id }, data: { status: decision === "approved" ? "active" : "inactive" } }),
      prisma.auditLog.create({ data: { userId: Number(session.user.id), action: decision, entityType: "coach", entityId: target.id, description: `${decision} coach application ${target.coachCode}${reason ? `: ${reason}` : ""}` } }),
    ]);

    if (decision === "approved") {
      const emailed = await sendCoachApprovalEmail({
        email: target.email,
        name: `${target.firstName} ${target.lastName}`,
        coachCode: target.coachCode,
      });
      const smsPayload = { coach: { firstName: target.firstName, lastName: target.lastName, email: target.email, contactNumber: target.contactNumber, notifySms: target.notifySms, notifyEmail: false } };
      const smsResult = await notifyCoach({ ...smsPayload, subject: "Coach application approved", message: "Your coach application has been approved. You can now sign in." });
      const smsFailed = target.notifySms && target.contactNumber && !smsResult.sms;
      const smsNote = smsFailed ? " A confirmation SMS could not be sent." : "";
      return res.status(200).json({ success: true, status, message: emailed ? `Coach ${target.coachCode} approved.${smsNote}` : `Coach ${target.coachCode} approved. A confirmation email could not be sent.${smsNote}` });
    }

    await sendCoachRejectionEmail({
      email: target.email,
      name: `${target.firstName} ${target.lastName}`,
      coachCode: target.coachCode,
      reason,
    });
    const smsPayload = { coach: { firstName: target.firstName, lastName: target.lastName, email: target.email, contactNumber: target.contactNumber, notifySms: target.notifySms, notifyEmail: false } };
    const smsResult = await notifyCoach({ ...smsPayload, subject: "Coach application rejected", message: reason ? `Your coach application has been rejected. Reason: ${reason}` : "Your coach application has been rejected." });
    const smsFailed = target.notifySms && target.contactNumber && !smsResult.sms;
    const smsNote = smsFailed ? " A confirmation SMS could not be sent." : "";
    return res.status(200).json({ success: true, status, message: `Coach ${target.coachCode} rejected.${smsNote}` });
  }

  return res.status(405).json({ error: "Method not allowed." });
}