import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, requireRole, validId, setSecurityHeaders, text } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { notifyCoach } from "../../../lib/notify";

const MAX_BATCH = 500;

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireRole(session, "admin", res)) return;
  if (!requireCsrf(req, res)) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:transfer`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const targetCoachId = validId(req.body?.targetCoachId);
  if (!targetCoachId) return res.status(400).json({ error: "Choose a coach to transfer the athletes to." });

  const rawIds = Array.isArray(req.body?.athleteIds) ? req.body.athleteIds : [];
  const athleteIds = [...new Set(rawIds.map((v) => Number(v)).filter((v) => Number.isSafeInteger(v) && v > 0))];
  if (!athleteIds.length) return res.status(400).json({ error: "Select at least one athlete to transfer." });
  if (athleteIds.length > MAX_BATCH) return res.status(400).json({ error: `You can transfer at most ${MAX_BATCH} athletes at a time.` });

  const target = await prisma.coach.findUnique({ where: { id: targetCoachId }, include: { user: { select: { name: true } } } });
  if (!target || target.status !== "active") return res.status(400).json({ error: "The selected coach is not active." });

  const athletes = await prisma.athlete.findMany({
    where: { id: { in: athleteIds } },
    select: { id: true, firstName: true, lastName: true, athleteCode: true, coachId: true, coach: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!athletes.length) return res.status(404).json({ error: "No matching athletes found." });
  if (athletes.length !== athleteIds.length) {
    return res.status(400).json({ error: `Only ${athletes.length} of ${athleteIds.length} selected athletes still exist. Refresh and try again.` });
  }

  const type = text(req.body?.type, 50) || "transfer";

  const result = await prisma.$transaction(async (tx) => {
    let moved = 0;
    let skipped = 0;
    const updatedAthletes = [];
    for (const athlete of athletes) {
      if (athlete.coachId === targetCoachId) {
        skipped++;
        updatedAthletes.push({ ...athlete, alreadyAssigned: true });
        continue;
      }
      const oldCoachId = athlete.coachId;
      await tx.athlete.update({ where: { id: athlete.id }, data: { coachId: targetCoachId } });
      await tx.athleteCoachHistory.create({
        data: { athleteId: athlete.id, coachId: targetCoachId, assignedBy: Number(session.user.id), reason: `Transferred via bulk ${type}` },
      });
      moved++;
      updatedAthletes.push({ ...athlete, oldCoachId });
    }
    await tx.auditLog.create({
      data: {
        userId: Number(session.user.id),
        action: "transfer",
        entityType: "athlete",
        entityId: 0,
        description: `Transferred ${moved} athlete(s) to coach #${targetCoachId}${skipped ? ` (${skipped} already assigned)` : ""}`,
      },
    });
    return { moved, skipped, updatedAthletes };
  });

  if (result.moved) {
    const movedNames = result.updatedAthletes.filter((a) => !a.alreadyAssigned);
    const names = movedNames.map((a) => `${a.firstName} ${a.lastName} (${a.athleteCode})`);
    await notifyCoach({
      coach: target,
      subject: "New athletes added to your roster",
      message: `${names.length} athlete(s) were added to your roster by the administrator: ${names.join(", ")}.`,
    });
    const oldCoachIds = [...new Set(movedNames.map((a) => a.oldCoachId).filter(Boolean))];
    if (oldCoachIds.length) {
      const oldCoaches = await prisma.coach.findMany({ where: { id: { in: oldCoachIds } }, select: { id: true, firstName: true, lastName: true, notifySms: true, notifyEmail: true, contactNumber: true, email: true } });
      for (const old of oldCoaches) {
        await notifyCoach({
          coach: old,
          subject: "Athletes moved out of your roster",
          message: `${movedNames.filter((a) => a.oldCoachId === old.id).length} athlete(s) were transferred out of your roster by the administrator.`,
        });
      }
    }
  }

  return res.status(200).json({
    success: true,
    message: `Transferred ${result.moved} athlete${result.moved === 1 ? "" : "s"} to ${target.firstName} ${target.lastName}${result.skipped ? ` (${result.skipped} already assigned)` : ""}.`,
    moved: result.moved,
    skipped: result.skipped,
  });
}