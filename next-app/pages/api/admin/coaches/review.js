import { prisma } from "../../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, text, validId, setSecurityHeaders } from "../../../../lib/api-security";
import { rateLimiters } from "../../../../lib/rate-limit";
import { sendCoachApprovalEmail, sendCoachRejectionEmail } from "../../../../lib/email";
import { notifyCoach } from "../../../../lib/notify";

function smsPayloadFor(coach) {
  return { coach: { firstName: coach.firstName, lastName: coach.lastName, email: coach.email, contactNumber: coach.contactNumber, notifySms: coach.notifySms, notifyEmail: false } };
}

function smsNoteFor(coach, result) {
  return coach.notifySms && coach.contactNumber && !result.sms ? " A confirmation SMS could not be sent." : "";
}

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
  if (!coachId || !["approved", "rejected", "deactivate", "reactivate"].includes(decision)) return res.status(400).json({ error: "Coach and decision are required." });
  const coach = await prisma.coach.findUnique({ where: { id: coachId }, include: { user: true, athletes: { select: { id: true } } } });
  if (!coach) return res.status(404).json({ error: "Coach account not found." });

  if (decision === "deactivate") {
    if (coach.user.status !== "active") return res.status(409).json({ error: "Only active coaches can be deactivated." });
    const athleteIds = coach.athletes.map((a) => a.id);
    const pendingOut = await prisma.athleteTransfer.findMany({
      where: {
        status: "pending",
        OR: [{ fromCoachId: coachId }, { fromCoachId: null, requestedBy: coach.userId }],
      },
      select: { id: true, fromCoachId: true, toCoach: { select: { id: true, firstName: true, lastName: true, email: true, contactNumber: true, notifySms: true, notifyEmail: true } } },
    });
    const pendingIn = await prisma.athleteTransfer.findMany({
      where: { toCoachId: coachId, status: "pending", fromCoachId: { not: null } },
      select: { id: true, fromCoach: { select: { id: true, firstName: true, lastName: true, email: true, contactNumber: true, notifySms: true, notifyEmail: true } } },
    });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: coach.userId }, data: { status: "inactive" } });
      await tx.coach.update({ where: { id: coachId }, data: { status: "inactive" } });
      if (athleteIds.length) {
        const now = new Date();
        await tx.athlete.updateMany({ where: { id: { in: athleteIds } }, data: { coachId: null } });
        await tx.athleteCoachHistory.updateMany({ where: { coachId, endedAt: null }, data: { endedAt: now } });
      }
      const cancelledIds = [...new Set(pendingOut.concat(pendingIn).map((t) => t.id))];
      if (cancelledIds.length) {
        await tx.athleteTransfer.updateMany({ where: { id: { in: cancelledIds }, status: "pending" }, data: { status: "cancelled", decidedBy: Number(session.user.id), decisionNote: reason || "Coach account deactivated", decidedAt: new Date() } });
      }
      await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "deactivate", entityType: "coach", entityId: coachId, description: `Deactivated coach ${coach.coachCode}${reason ? `: ${reason}` : ""}. ${athleteIds.length} athlete(s) became uncoached; ${cancelledIds.length} pending request(s) cancelled` } });
    });

    await notifyCoach({ coach: { firstName: coach.firstName, lastName: coach.lastName, email: coach.email, contactNumber: coach.contactNumber, notifySms: coach.notifySms, notifyEmail: coach.notifyEmail }, subject: "Coach account deactivated", message: "Your coach account has been deactivated. You cannot sign in until an administrator reactivates it." });
    for (const t of pendingOut) {
      if (t.fromCoachId !== null) await notifyCoach({ coach: t.toCoach, subject: "Transfer request cancelled", message: "A transfer request sent to you was cancelled because the requesting coach was deactivated." });
    }
    for (const t of pendingIn) {
      await notifyCoach({ coach: t.fromCoach, subject: "Transfer request cancelled", message: "Your transfer request was cancelled because the receiving coach was deactivated." });
    }

    return res.status(200).json({ success: true, status: "inactive", message: `Coach deactivated. ${athleteIds.length} athlete${athleteIds.length === 1 ? "" : "s"} became uncoached, and pending requests were cancelled.` });
  }

  if (decision === "reactivate") {
    if (coach.user.status !== "inactive") return res.status(409).json({ error: "Only deactivated coaches can be reactivated." });

    const uncoached = await prisma.athlete.findMany({ where: { coachId: null }, select: { id: true } });
    const returned = [];
    for (const u of uncoached) {
      const last = await prisma.athleteCoachHistory.findFirst({ where: { athleteId: u.id }, orderBy: { startedAt: "desc" }, select: { coachId: true } });
      if (last && last.coachId === coachId) returned.push(u.id);
    }
    const claims = returned.length
      ? await prisma.athleteTransfer.findMany({
          where: { athleteId: { in: returned }, status: "pending", fromCoachId: null },
          select: { id: true, toCoach: { select: { id: true, firstName: true, lastName: true, email: true, contactNumber: true, notifySms: true, notifyEmail: true } } },
        })
      : [];

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: coach.userId }, data: { status: "active" } });
      await tx.coach.update({ where: { id: coachId }, data: { status: "active" } });
      if (returned.length) {
        await tx.athlete.updateMany({ where: { id: { in: returned } }, data: { coachId } });
        await tx.athleteCoachHistory.createMany({ data: returned.map((athleteId) => ({ athleteId, coachId, assignedBy: Number(session.user.id), reason: "Returned after coach reactivation" })) });
      }
      if (claims.length) {
        await tx.athleteTransfer.updateMany({ where: { id: { in: claims.map((c) => c.id) }, status: "pending" }, data: { status: "cancelled", decidedBy: Number(session.user.id), decisionNote: "Athlete returned to original coach on reactivation", decidedAt: new Date() } });
      }
      await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "reactivate", entityType: "coach", entityId: coachId, description: `Reactivated coach ${coach.coachCode}. ${returned.length} athlete(s) returned to roster${reason ? `: ${reason}` : ""}` } });
    });

    await notifyCoach({ coach: { firstName: coach.firstName, lastName: coach.lastName, email: coach.email, contactNumber: coach.contactNumber, notifySms: coach.notifySms, notifyEmail: coach.notifyEmail }, subject: "Coach account reactivated", message: `Your coach account has been reactivated.${returned.length ? ` ${returned.length} athlete(s) who remained uncoached were returned to your roster.` : ""}` });
    for (const claim of claims) {
      await notifyCoach({ coach: claim.toCoach, subject: "Uncoached athlete request cancelled", message: "Your request to add an uncoached athlete was cancelled because the athlete returned to their original coach when the account was reactivated." });
    }

    return res.status(200).json({ success: true, status: "active", message: `Coach reactivated.${returned.length ? ` ${returned.length} athlete(s) returned to the roster.` : ""}` });
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

    const approvalSms = await notifyCoach({ ...smsPayloadFor(coach), subject: "Coach application approved", message: "Your coach application has been approved. You can now sign in." });
    const approvalSmsNote = smsNoteFor(coach, approvalSms);

    return res.status(200).json({ success: true, status, message: emailed ? `Coach approved. Sign in with the password you registered with.${approvalSmsNote}` : `Coach approved. A confirmation email could not be sent.${approvalSmsNote}` });
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

    const reapprovalSms = await notifyCoach({ ...smsPayloadFor(coach), subject: "Coach application approved", message: "Your coach application has been approved. You can now sign in." });
    const reapprovalSmsNote = smsNoteFor(coach, reapprovalSms);

    return res.status(200).json({ success: true, status: "active", message: emailed ? `Coach reapproved. Sign in with the password you registered with.${reapprovalSmsNote}` : `Coach reapproved. A confirmation email could not be sent.${reapprovalSmsNote}` });
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

  const rejectionSms = await notifyCoach({ ...smsPayloadFor(coach), subject: "Coach application rejected", message: reason ? `Your coach application has been rejected. Reason: ${reason}` : "Your coach application has been rejected." });
  const rejectionSmsNote = smsNoteFor(coach, rejectionSms);

  return res.status(200).json({ success: true, status, message: `Coach rejected. Notification sent via email.${rejectionSmsNote}` });
}