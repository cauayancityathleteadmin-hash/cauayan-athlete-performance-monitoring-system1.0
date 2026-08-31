import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`participants:${ip}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method === "DELETE") {
    if (session.user.role === "admin") return res.status(403).json({ error: "Only coaches can manage athlete participation." });
    if (!requireCsrf(req, res)) return;

    const eventPlanId = validId(req.body?.eventPlanId);
    const athleteId = validId(req.body?.athleteId);
    if (!eventPlanId || !athleteId) return res.status(400).json({ error: "Event plan and athlete are required." });

    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) } });
    if (!coach || coach.status !== "active") return res.status(403).json({ error: "Active coach profile required." });

    const [plan, athlete] = await Promise.all([
      prisma.eventPlan.findUnique({ where: { id: eventPlanId }, select: { id: true, status: true } }),
      prisma.athlete.findUnique({ where: { id: athleteId }, select: { id: true, sportId: true, coachId: true } }),
    ]);
    if (!plan || plan.status !== "open") return res.status(400).json({ error: "You can only remove athletes from open event plans." });
    if (!athlete || athlete.coachId !== coach.id) return res.status(403).json({ error: "You can only manage your own athletes." });

    const participant = await prisma.eventParticipant.findUnique({
      where: { eventPlanId_coachId_athleteId_sportId: { eventPlanId, coachId: coach.id, athleteId: athlete.id, sportId: athlete.sportId } },
      select: { id: true, participantType: true },
    });

    if (!participant || participant.participantType !== "athlete" || !participant.id) {
      return res.status(404).json({ error: "That athlete is not in this event plan." });
    }

    const updated = await prisma.$transaction([
      prisma.eventParticipant.updateMany({ where: { id: participant.id, status: "active" }, data: { status: "removed" } }),
      prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "remove_participant", entityType: "event_participant", entityId: participant.id, description: `Removed athlete ${athleteId} from event plan ${eventPlanId}` } }),
    ]);
    const removed = updated[0].count > 0;
    return res.status(200).json({ success: true, removed });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (session.user.role === "admin") return res.status(403).json({ error: "Only coaches can nominate athletes for upcoming events." });
  if (!requireCsrf(req, res)) return;

  const eventPlanId = validId(req.body?.eventPlanId);
  const athleteId = validId(req.body?.athleteId);
  if (!eventPlanId || !athleteId) return res.status(400).json({ error: "Event plan and athlete are required." });

  const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) } });
  if (!coach || coach.status !== "active") return res.status(403).json({ error: "Active coach profile required." });

  const [plan, athlete, application] = await Promise.all([
    prisma.eventPlan.findUnique({ where: { id: eventPlanId }, select: { id: true, status: true } }),
    prisma.athlete.findUnique({ where: { id: athleteId }, select: { id: true, sportId: true, coachId: true } }),
    prisma.eventApplication.findUnique({ where: { eventPlanId_coachId: { eventPlanId, coachId: coach.id } }, select: { status: true } }),
  ]);

  if (!plan || plan.status !== "open") return res.status(400).json({ error: "You can only add athletes to open event plans." });
  if (!athlete || athlete.coachId !== coach.id) return res.status(403).json({ error: "You can only add athletes assigned to you." });
  if (!application || application.status !== "approved") return res.status(403).json({ error: "Your application to this event plan must be approved first." });

  const participant = await prisma.$transaction(async (tx) => {
    const saved = await tx.eventParticipant.upsert({
      where: { eventPlanId_coachId_athleteId_sportId: { eventPlanId, coachId: coach.id, athleteId: athlete.id, sportId: athlete.sportId } },
      update: { status: "active" },
      create: { eventPlanId, coachId: coach.id, athleteId: athlete.id, sportId: athlete.sportId, participantType: "athlete", addedBy: Number(session.user.id), status: "active" },
    });
    await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "add_participant", entityType: "event_participant", entityId: saved.id, description: `Added athlete ${athleteId} to event plan ${eventPlanId}` } });
    return saved;
  });
  return res.status(200).json({ success: true, participant });
}
