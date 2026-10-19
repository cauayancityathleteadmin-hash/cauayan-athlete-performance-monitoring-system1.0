import { prisma } from "../../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, setSecurityHeaders, validId } from "../../../../lib/api-security";
import { rateLimiters } from "../../../../lib/rate-limit";
import { LEVEL_ORDER, MEDAL_ORDER } from "../../../../lib/points";

// §7 Events results: an admin records a placement per participant. Saving a
// medal auto-creates (or updates) the linked achievement so Standing stays in
// sync without double entry. Clearing the medal removes the linked achievement.
export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (!rateLimiters.api(`event-results:${ip}:${req.method}`).allowed) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  if (!requireRole(session, "admin", res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const participantId = validId(req.body?.participantId);
  if (!participantId) return res.status(400).json({ error: "Participant is required." });

  const rawMedal = req.body?.medal;
  const medal = rawMedal === null || rawMedal === "" ? null : String(rawMedal);
  if (medal !== null && !MEDAL_ORDER.includes(medal)) return res.status(400).json({ error: "Invalid result medal." });

  const participant = await prisma.eventParticipant.findUnique({
    where: { id: participantId },
    include: {
      sport: { select: { id: true, sportName: true } },
      eventPlan: { select: { id: true, eventName: true, venue: true, startDate: true, endDate: true, eventLevel: true } },
    },
  });
  if (!participant) return res.status(404).json({ error: "Participant not found." });
  if (participant.participantType !== "athlete" || participant.athleteId === null) {
    return res.status(400).json({ error: "Results can only be recorded for athletes." });
  }

  const plan = participant.eventPlan;
  const athleteId = participant.athleteId;
  const sportId = participant.sportId;

  const result = await prisma.$transaction(async (tx) => {
    await tx.eventParticipant.update({
      where: { id: participantId },
      data: { resultMedal: medal, resultRecordedAt: medal ? new Date() : null },
    });

    // The achievement this result maps to (same plan + athlete + sport).
    const existing = await tx.achievement.findFirst({
      where: { eventPlanId: plan.id, athleteId, sportId },
      orderBy: { id: "asc" },
    });

    if (!medal) {
      if (existing) await tx.achievement.delete({ where: { id: existing.id } });
      await tx.auditLog.create({
        data: { userId: Number(session.user.id), action: "clear_result", entityType: "event_participant", entityId: participantId, description: `Cleared result for participant #${participantId}` },
      });
      return { cleared: true };
    }

    const data = {
      achievementTitle: plan.eventName,
      achievementType: "Event result",
      organization: plan.venue || null,
      description: `${participant.sport.sportName} result recorded from event plan.`,
      achievementDate: plan.endDate || plan.startDate || null,
      medal,
      level: LEVEL_ORDER.includes(plan.eventLevel) ? plan.eventLevel : null,
      sportId,
      eventPlanId: plan.id,
    };

    const saved = existing
      ? await tx.achievement.update({ where: { id: existing.id }, data })
      : await tx.achievement.create({ data: { athleteId, ...data } });

    await tx.auditLog.create({
      data: { userId: Number(session.user.id), action: existing ? "update_result" : "record_result", entityType: "achievement", entityId: saved.id, description: `Recorded ${medal} result for athlete #${athleteId} in ${plan.eventName}` },
    });
    return { achievement: saved };
  });

  return res.status(200).json({ success: true, ...result });
}
