import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { notifyCoach } from "../../../lib/notify";

const MAX_BATCH = 50;

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:transfers:batch`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (!requireRole(session, "coach", res)) return;
  if (!requireCsrf(req, res)) return;

  const toCoachId = validId(req.body?.toCoachId);
  if (!toCoachId) return res.status(400).json({ error: "Choose the coach you want to send athletes to." });

  const rawIds = Array.isArray(req.body?.athleteIds) ? req.body.athleteIds : [];
  const ids = [...new Set(rawIds.map(validId).filter(Boolean))];
  if (!ids.length) return res.status(400).json({ error: "Select at least one athlete." });
  if (ids.length > MAX_BATCH) return res.status(400).json({ error: `You can send at most ${MAX_BATCH} athletes at a time.` });

  const coach = await prisma.coach.findUnique({
    where: { userId: Number(session.user.id) },
    select: { id: true, firstName: true, lastName: true, status: true },
  });
  if (!coach || coach.status !== "active") return res.status(403).json({ error: "Your coach account is not active." });

  const target = await prisma.coach.findUnique({
    where: { id: toCoachId },
    select: { id: true, firstName: true, lastName: true, email: true, contactNumber: true, notifySms: true, notifyEmail: true, status: true },
  });
  if (!target || target.status !== "active") return res.status(400).json({ error: "The target coach account is not active." });

  const athletes = await prisma.athlete.findMany({
    where: { id: { in: ids } },
    select: { id: true, athleteCode: true, firstName: true, lastName: true, coachId: true },
  });

  const pending = await prisma.athleteTransfer.findMany({
    where: { athleteId: { in: ids }, status: "pending" },
    select: { athleteId: true },
  });
  const pendingSet = new Set(pending.map((row) => row.athleteId));

  const valid = [];
  const skipped = [];
  const claims = new Set();
  for (const id of ids) {
    if (pendingSet.has(id)) {
      skipped.push({ athleteId: id, reason: "already_pending" });
      continue;
    }
    const athlete = athletes.find((a) => a.id === id);
    if (!athlete) {
      skipped.push({ athleteId: id, reason: "not_found" });
      continue;
    }
    if (athlete.coachId === null) {
      if (toCoachId !== coach.id) {
        skipped.push({ athleteId: id, reason: "claim_to_self" });
        continue;
      }
      claims.add(id);
      valid.push(athlete);
      continue;
    }
    if (athlete.coachId !== coach.id) {
      skipped.push({ athleteId: id, reason: "not_in_roster" });
      continue;
    }
    if (athlete.coachId === toCoachId) {
      skipped.push({ athleteId: id, reason: "same_coach" });
      continue;
    }
    valid.push(athlete);
  }

  if (!valid.length) {
    return res.status(400).json({
      success: false,
      created: 0,
      skipped,
      error: "Nothing to send. The selected athletes are either already pending a request, already with the target coach, or not part of your roster.",
    });
  }

  const claimCount = valid.filter((athlete) => claims.has(athlete.id)).length;
  const transferCount = valid.length - claimCount;
  const reason = text(req.body?.reason, 500) || null;
  const now = new Date();
  const operations = valid.map((athlete) =>
    prisma.athleteTransfer.create({
      data: {
        athleteId: athlete.id,
        fromCoachId: claims.has(athlete.id) ? null : coach.id,
        toCoachId,
        requestedBy: Number(session.user.id),
        reason,
        createdAt: now,
      },
    })
  );
  operations.push(
    prisma.auditLog.create({
      data: {
        userId: Number(session.user.id),
        action: claimCount === valid.length ? "batch_claim" : "batch_transfer_request",
        entityType: "athlete",
        description: `Requested batch ${claimCount === valid.length ? "claim" : "transfer"} of ${valid.length} athlete(s) to coach #${toCoachId}${skipped.length ? ` (${skipped.length} skipped)` : ""}`,
      },
    })
  );
  await prisma.$transaction(operations);

  const transferList = valid.filter((athlete) => !claims.has(athlete.id)).map((athlete) => `${athlete.firstName} ${athlete.lastName} (${athlete.athleteCode})`).join(", ");
  if (transferCount > 0) {
    await notifyCoach({
      coach: target,
      subject: "Batch athlete transfer request",
      message: `${coach.firstName} ${coach.lastName} requested to transfer ${transferCount} athlete(s) to your roster: ${transferList}`,
    });
  }

  const parts = [];
  if (transferCount) parts.push(`${transferCount} transfer request${transferCount === 1 ? "" : "s"}`);
  if (claimCount) parts.push(`${claimCount} claim${claimCount === 1 ? "" : "s"} for admin approval`);
  return res.status(201).json({
    success: true,
    created: valid.length,
    skipped,
    message: `Sent ${parts.join(" and ")}.${skipped.length ? ` ${skipped.length} athlete${skipped.length === 1 ? "" : "s"} skipped.` : ""}`,
  });
}