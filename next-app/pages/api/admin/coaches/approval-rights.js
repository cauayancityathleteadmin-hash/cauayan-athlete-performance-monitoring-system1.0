import { prisma } from "../../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, validId, setSecurityHeaders } from "../../../../lib/api-security";
import { rateLimiters } from "../../../../lib/rate-limit";
import { sendNotificationEmail } from "../../../../lib/email";
import { sendSms } from "../../../../lib/sms";
import { generateApprovalCode, hashApprovalCode, APPROVAL_CODE_EXPIRY_MS } from "../../../../lib/security-codes";

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
  const coach = await prisma.coach.findUnique({
    where: { id: coachId },
    select: { id: true, canApproveCoaches: true, coachCode: true, firstName: true, lastName: true, email: true, contactNumber: true, user: { select: { status: true } } },
  });
  if (!coach) return res.status(404).json({ error: "Coach not found." });
  if (coach.user.status !== "active") return res.status(409).json({ error: "Only active coach accounts can be given approval rights." });

  const canApproveCoaches = Boolean(req.body.canApproveCoaches);

  if (canApproveCoaches) {
    const code = generateApprovalCode();
    const expiresAt = new Date(Date.now() + APPROVAL_CODE_EXPIRY_MS);
    await prisma.$transaction([
      prisma.coach.update({ where: { id: coachId }, data: { canApproveCoaches: true, approvalCodeHash: hashApprovalCode(code), approvalCodeExpiresAt: expiresAt, approvalActivatedAt: null } }),
      prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "update", entityType: "coach", entityId: coachId, description: `Granted coach application approval rights for ${coach.coachCode} and sent an activation code (email/SMS).` } }),
    ]);

    const name = `${coach.firstName} ${coach.lastName}`.trim();
    const message = `Your coach application approval power is now waiting for activation.\n\nYour 6-digit activation code is: ${code}\n\nEnter this code on the Coach Approvals page within 24 hours to activate the ability to approve coach applications. Do not share this code.`;
    const emailed = await sendNotificationEmail({ email: coach.email, name, subject: "Your coach approval power is ready to activate", message });
    const smsSent = coach.contactNumber ? await sendSms({ to: coach.contactNumber, message: `Cauayan Coach Approvals activation code: ${code}. Valid for 24 hours. Do not share it.` }) : false;

    const failed = (emailed ? [] : ["email"]).concat(coach.contactNumber && !smsSent ? ["SMS"] : []);
    const notice = failed.length ? ` Activation code could not be delivered by ${failed.join(" and ")}; the coach can request another code from the Coach Approvals page.` : "";
    return res.status(200).json({ success: true, canApproveCoaches, codeSent: { email: emailed, sms: smsSent }, message: `Activation code sent to ${coach.coachCode} by email${coach.contactNumber ? " and SMS" : ""}.${notice}` });
  }

  await prisma.$transaction([
    prisma.coach.update({ where: { id: coachId }, data: { canApproveCoaches: false, approvalCodeHash: null, approvalCodeExpiresAt: null, approvalActivatedAt: null } }),
    prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "update", entityType: "coach", entityId: coachId, description: `Revoked coach application approval rights for ${coach.coachCode}` } }),
  ]);
  return res.status(200).json({ success: true, canApproveCoaches: false, message: `Approval rights revoked for ${coach.coachCode}.` });
}