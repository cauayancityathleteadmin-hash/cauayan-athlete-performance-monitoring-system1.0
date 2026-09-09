import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { notifyCoach } from "../../../lib/notify";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:transferdecide`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (!requireCsrf(req, res)) return;

  const id = validId(req.query?.id);
  if (!id) return res.status(400).json({ error: "Invalid request." });

  const decision = req.body?.decision;
  const note = text(req.body?.note, 500) || null;
  if (!["approved", "rejected", "cancelled"].includes(decision)) return res.status(400).json({ error: "Invalid decision." });

  const transfer = await prisma.athleteTransfer.findUnique({
    where: { id },
    include: {
      athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true, coachId: true } },
      fromCoach: { select: { id: true, firstName: true, lastName: true, email: true, contactNumber: true, notifySms: true, notifyEmail: true } },
      toCoach: { select: { id: true, firstName: true, lastName: true, email: true, contactNumber: true, notifySms: true, notifyEmail: true, userId: true } },
    },
  });
  if (!transfer) return res.status(404).json({ error: "Request not found." });
  if (transfer.status !== "pending") return res.status(409).json({ error: "This request has already been decided." });

  const userId = Number(session.user.id);
  const coach = await prisma.coach.findUnique({ where: { userId }, select: { id: true } });

  const isAdmin = session.user.role === "admin";
  let canDecide = false;
  if (decision === "cancelled") {
    canDecide = transfer.requestedBy === userId || isAdmin;
  } else if (transfer.fromCoachId === null) {
    canDecide = isAdmin;
  } else {
    canDecide = Boolean(coach && coach.id === transfer.toCoachId);
  }
  if (!canDecide) return res.status(403).json({ error: "You do not have permission to decide this request." });

  if (decision === "approved") {
    const current = await prisma.athlete.findUnique({ where: { id: transfer.athleteId }, select: { coachId: true } });
    if (!current) return res.status(404).json({ error: "The athlete no longer exists." });
    if (transfer.fromCoachId === null && current.coachId !== null) {
      return res.status(409).json({ error: "This athlete now has a coach. The request can no longer be approved." });
    }
    if (transfer.fromCoachId !== null && current.coachId !== transfer.fromCoachId) {
      return res.status(409).json({ error: "This athlete is no longer under the requesting coach." });
    }

    await prisma.$transaction(async (tx) => {
      await tx.athlete.update({ where: { id: transfer.athleteId }, data: { coachId: transfer.toCoachId } });
      await tx.athleteCoachHistory.create({
        data: {
          athleteId: transfer.athleteId,
          coachId: transfer.toCoachId,
          assignedBy: userId,
          reason: transfer.fromCoachId === null ? "Claimed from uncoached and approved by administrator" : "Transferred via coach request",
        },
      });
      await tx.athleteTransfer.update({
        where: { id },
        data: { status: "approved", decidedBy: userId, decisionNote: note, decidedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: transfer.fromCoachId === null ? "claim_approved" : "transfer_approved",
          entityType: "athlete",
          entityId: transfer.athleteId,
          description: `Approved request for athlete ${transfer.athlete.athleteCode} to coach #${transfer.toCoachId}`,
        },
      });
    });

    await notifyCoach({
      coach: transfer.toCoach,
      subject: "Athlete added to your roster",
      message: `The request for ${transfer.athlete.firstName} ${transfer.athlete.lastName} (${transfer.athlete.athleteCode}) was approved. They are now part of your roster.`,
    });
    if (transfer.fromCoachId !== null) {
      await notifyCoach({
        coach: transfer.fromCoach,
        subject: "Athlete transfer approved",
        message: `Your transfer request for ${transfer.athlete.firstName} ${transfer.athlete.lastName} (${transfer.athlete.athleteCode}) was approved by ${transfer.toCoach.firstName} ${transfer.toCoach.lastName}.`,
      });
    }
    return res.status(200).json({ success: true, status: "approved", message: "Request approved. The athlete has been assigned." });
  }

  if (decision === "rejected") {
    await prisma.$transaction([
      prisma.athleteTransfer.update({
        where: { id },
        data: { status: "rejected", decidedBy: userId, decisionNote: note, decidedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId,
          action: transfer.fromCoachId === null ? "claim_rejected" : "transfer_rejected",
          entityType: "athlete",
          entityId: transfer.athleteId,
          description: `Rejected request for athlete ${transfer.athlete.athleteCode}${note ? `: ${note}` : ""}`,
        },
      }),
    ]);

    if (transfer.fromCoachId !== null) {
      await notifyCoach({
        coach: transfer.fromCoach,
        subject: "Athlete transfer request rejected",
        message: `Your transfer request for ${transfer.athlete.firstName} ${transfer.athlete.lastName} (${transfer.athlete.athleteCode}) was rejected${note ? `: ${note}` : "."}`,
      });
    } else {
      await notifyCoach({
        coach: transfer.toCoach,
        subject: "Uncoached athlete request rejected",
        message: `Your request to add ${transfer.athlete.firstName} ${transfer.athlete.lastName} (${transfer.athlete.athleteCode}) was rejected by the administrator${note ? `: ${note}` : "."}`,
      });
    }
    return res.status(200).json({ success: true, status: "rejected", message: "Request rejected." });
  }

  await prisma.$transaction([
    prisma.athleteTransfer.update({
      where: { id },
      data: { status: "cancelled", decidedBy: userId, decisionNote: note, decidedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        userId,
        action: "transfer_cancelled",
        entityType: "athlete",
        entityId: transfer.athleteId,
        description: `Cancelled request for athlete ${transfer.athlete.athleteCode}${note ? `: ${note}` : ""}`,
      },
    }),
  ]);

  if (transfer.fromCoachId !== null) {
    await notifyCoach({
      coach: transfer.toCoach,
      subject: "Athlete transfer request cancelled",
      message: `The transfer request for ${transfer.athlete.firstName} ${transfer.athlete.lastName} (${transfer.athlete.athleteCode}) was cancelled.`,
    });
  } else {
    await notifyCoach({
      coach: transfer.toCoach,
      subject: "Uncoached athlete request cancelled",
      message: `Your request to add ${transfer.athlete.firstName} ${transfer.athlete.lastName} (${transfer.athlete.athleteCode}) was cancelled.`,
    });
  }
  return res.status(200).json({ success: true, status: "cancelled", message: "Request cancelled." });
}