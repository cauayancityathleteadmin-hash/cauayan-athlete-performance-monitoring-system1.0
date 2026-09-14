import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { sendCoachApprovalEmail, sendCoachRejectionEmail, sendNotificationEmail } from "../../../lib/email";
import { sendSms } from "../../../lib/sms";
import { notifyCoach } from "../../../lib/notify";
import { generateApprovalCode, hashApprovalCode, verifyApprovalCode, APPROVAL_CODE_EXPIRY_MS } from "../../../lib/security-codes";

const NOT_ACTIVATED = "APPROVAL_NOT_ACTIVATED";
const CODE_PATTERN = /^\d{6}$/;

async function approverFor(session) {
  return prisma.coach.findUnique({
    where: { userId: Number(session.user.id) },
    select: { id: true, canApproveCoaches: true, approvalActivatedAt: true, approvalCodeHash: true, approvalCodeExpiresAt: true, email: true, contactNumber: true, firstName: true, lastName: true },
  });
}

function activationRequired(res) {
  return res.status(403).json({ error: "Your coach approval power is not activated yet. Enter the 6-digit code we sent you to activate it.", code: NOT_ACTIVATED });
}

async function deliverCode(approver, code) {
  const name = `${approver.firstName || ""} ${approver.lastName || ""}`.trim();
  const message = `Your coach application approval power is now waiting for activation.\n\nYour 6-digit activation code is: ${code}\n\nEnter this code on the Coach Approvals page within 24 hours. Do not share this code.`;
  const emailed = await sendNotificationEmail({ email: approver.email, name, subject: "Your coach approval power is ready to activate", message });
  const smsSent = approver.contactNumber ? await sendSms({ to: approver.contactNumber, message: `Cauayan Coach Approvals activation code: ${code}. Valid for 24 hours. Do not share it.` }) : false;
  return { email: emailed, sms: smsSent };
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:coachapprovals`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  // This endpoint is a coach-registration approval power. It is open to an ACTIVE coach
  // who has been granted `canApproveCoaches` and activated it with a one-time code.
  // It grants NO other admin authority.
  const approver = await approverFor(session);
  if (!approver || !approver.canApproveCoaches) return res.status(403).json({ error: "You do not have coach application approval rights." });

  if (req.method === "GET") {
    if (!approver.approvalActivatedAt) return activationRequired(res);
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
    const action = req.body?.action;

    if (action === "activate") {
      const code = text(req.body?.code, 10);
      if (!code || !CODE_PATTERN.test(code)) return res.status(400).json({ error: "Enter the 6-digit code sent to you." });
      if (!approver.approvalCodeHash || !approver.approvalCodeExpiresAt) return res.status(409).json({ error: "There is no pending activation code. Ask the admin to grant your approval rights again or request a new code." });
      if (new Date(approver.approvalCodeExpiresAt).getTime() < Date.now()) {
        return res.status(410).json({ error: "That activation code has expired. Request a new code.", code: "APPROVAL_CODE_EXPIRED" });
      }
      if (!verifyApprovalCode(code, approver.approvalCodeHash)) {
        return res.status(400).json({ error: "That code is incorrect. Check the email/SMS we sent you." });
      }
      await prisma.$transaction([
        prisma.coach.update({ where: { id: approver.id }, data: { approvalActivatedAt: new Date(), approvalCodeHash: null, approvalCodeExpiresAt: null } }),
        prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "activate", entityType: "coach", entityId: approver.id, description: `Activated coach application approval power with a verification code (coach #${approver.id}).` } }),
      ]);
      return res.status(200).json({ success: true, activated: true, message: "Your approval power is now active. You can review pending coach applications." });
    }

    if (action === "resend_code") {
      if (approver.approvalActivatedAt) return res.status(409).json({ error: "Your approval power is already active." });
      const code = generateApprovalCode();
      const expiresAt = new Date(Date.now() + APPROVAL_CODE_EXPIRY_MS);
      await prisma.coach.update({ where: { id: approver.id }, data: { approvalCodeHash: hashApprovalCode(code), approvalCodeExpiresAt: expiresAt } });
      const { email, sms } = await deliverCode(approver, code);
      const failed = (email ? [] : ["email"]).concat(approver.contactNumber && !sms ? ["SMS"] : []);
      await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "resend", entityType: "coach", entityId: approver.id, description: `Sent a new activation code for coach approval power (#${approver.id}).` } });
      return res.status(200).json({ success: true, message: failed.length ? `A new code should be on its way, but delivery failed by ${failed.join(" and ")}. Contact the admin.` : "A new code was sent to your email and phone. It is valid for 24 hours." });
    }

    if (!approver.approvalActivatedAt) return activationRequired(res);

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