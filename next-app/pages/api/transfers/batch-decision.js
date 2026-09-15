import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { notifyCoach } from "../../../lib/notify";

const MAX_BATCH = 50;

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:transfers:batch-decision`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (!requireCsrf(req, res)) return;

  const decision = req.body?.decision;
  if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "Invalid decision." });

  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ids = [...new Set(rawIds.map(validId).filter(Boolean))];
  if (!ids.length) return res.status(400).json({ error: "No requests selected." });
  if (ids.length > MAX_BATCH) return res.status(400).json({ error: `You can decide at most ${MAX_BATCH} requests at a time.` });

  const userId = Number(session.user.id);
  const isAdmin = session.user.role === "admin";

  const transfers = await prisma.athleteTransfer.findMany({
    where: { id: { in: ids } },
    include: {
      athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true, coachId: true } },
      fromCoach: { select: { id: true, firstName: true, lastName: true, email: true, contactNumber: true, notifySms: true, notifyEmail: true } },
      toCoach: { select: { id: true, firstName: true, lastName: true, email: true, contactNumber: true, notifySms: true, notifyEmail: true } },
    },
  });
  const byId = new Map(transfers.map((t) => [t.id, t]));

  const coach = isAdmin ? null : await prisma.coach.findUnique({ where: { userId }, select: { id: true } });

  const applied = [];
  const skipped = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (!t) {
      skipped.push({ id, reason: "not_found" });
      continue;
    }
    if (t.status !== "pending") {
      skipped.push({ id, reason: "not_pending" });
      continue;
    }
    const isClaim = t.fromCoachId === null;
    if (isClaim) {
      if (!isAdmin) {
        skipped.push({ id, reason: "no_permission" });
        continue;
      }
    } else if (!coach || coach.id !== t.toCoachId) {
      skipped.push({ id, reason: "no_permission" });
      continue;
    }
    if (decision === "approved") {
      const current = await prisma.athlete.findUnique({ where: { id: t.athleteId }, select: { coachId: true } });
      if (!current) {
        skipped.push({ id, reason: "athlete_missing" });
        continue;
      }
      if (isClaim && current.coachId !== null) {
        skipped.push({ id, reason: "athlete_has_coach" });
        continue;
      }
      if (!isClaim && current.coachId !== t.fromCoachId) {
        skipped.push({ id, reason: "athlete_changed" });
        continue;
      }
    }
    applied.push(t);
  }

  if (!applied.length) {
    return res.status(400).json({
      success: false,
      decision,
      applied: 0,
      skipped,
      error: "None of the selected requests could be decided (already decided, not yours to decide, or the athlete changed).",
    });
  }

  const now = new Date();
  const operations = [];
  const claimsApplied = applied.filter((t) => t.fromCoachId === null).length;
  for (const t of applied) {
    if (decision === "approved") {
      operations.push(
        prisma.athlete.update({ where: { id: t.athleteId }, data: { coachId: t.toCoachId } }),
        prisma.athleteCoachHistory.create({
          data: {
            athleteId: t.athleteId,
            coachId: t.toCoachId,
            assignedBy: userId,
            reason: t.fromCoachId === null ? "Claimed from uncoached and approved by administrator" : "Transferred via coach request",
          },
        }),
        prisma.athleteTransfer.update({
          where: { id: t.id },
          data: { status: "approved", decidedBy: userId, decisionNote: null, decidedAt: now },
        })
      );
    } else {
      operations.push(
        prisma.athleteTransfer.update({
          where: { id: t.id },
          data: { status: "rejected", decidedBy: userId, decisionNote: null, decidedAt: now },
        })
      );
    }
  }
  operations.push(
    prisma.auditLog.create({
      data: {
        userId,
        action: decision === "approved" ? "batch_transfer_approved" : "batch_transfer_rejected",
        entityType: "athlete",
        entityId: applied[0].athleteId,
        description: `${decision === "approved" ? "Approved" : "Rejected"} ${applied.length} request(s) in bulk (${claimsApplied} claim, ${applied.length - claimsApplied} transfer)${skipped.length ? `; ${skipped.length} skipped` : ""}`,
      },
    })
  );
  await prisma.$transaction(operations);

  const notified = new Map();
  for (const t of applied) {
    if (decision === "approved") {
      const toKey = t.toCoach ? `${t.toCoach.firstName} ${t.toCoach.lastName}` : "";
      const fromKey = t.fromCoach ? `${t.fromCoach.firstName} ${t.fromCoach.lastName}` : "";
      if (t.toCoach && toKey && !notified.has(toKey)) {
        notified.set(toKey, t.toCoach);
        await notifyCoach({
          coach: t.toCoach,
          subject: "Athletes added to your roster",
          message: `Approved request${applied.length > 1 ? "s" : ""} for ${applied.length} athlete(s). The approved athletes are now part of your roster.`,
        });
      }
      if (t.fromCoach && fromKey && !notified.has(fromKey)) {
        notified.set(fromKey, t.fromCoach);
        await notifyCoach({
          coach: t.fromCoach,
          subject: "Athlete transfer approved",
          message: `Your transfer request${applied.length > 1 ? "s" : ""} for ${applied.length} athlete(s) was approved by ${toKey || "the receiving coach"}.`,
        });
      }
    } else if (t.fromCoach) {
      const fromKey = `${t.fromCoach.firstName} ${t.fromCoach.lastName}`;
      if (!notified.has(fromKey)) {
        notified.set(fromKey, t.fromCoach);
        await notifyCoach({
          coach: t.fromCoach,
          subject: "Athlete transfer request was not accepted",
          message: `Your request(s) for ${applied.length} athlete(s) were not accepted.`,
        });
      }
    } else if (t.toCoach) {
      const toKey = `${t.toCoach.firstName} ${t.toCoach.lastName}`;
      if (!notified.has(toKey)) {
        notified.set(toKey, t.toCoach);
        await notifyCoach({
          coach: t.toCoach,
          subject: "Athlete requests were not accepted",
          message: `Your request(s) to add ${applied.length} athlete(s) to your roster were not accepted by the administrator.`,
        });
      }
    }
  }

  return res.status(200).json({
    success: true,
    decision,
    applied: applied.length,
    skipped,
    message: `${decision === "approved" ? "Approved" : "Rejected"} ${applied.length} request${applied.length === 1 ? "" : "s"}.${skipped.length ? ` ${skipped.length} skipped.` : ""}`,
  });
}