import { prisma } from "../../../../lib/prisma";
import { requireCsrf, requireSession, setSecurityHeaders, text, validId } from "../../../../lib/api-security";
import { rateLimiters } from "../../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (!rateLimiters.api(`api:${ip}:${req.method}`).allowed) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const athleteId = validId(req.query?.id);
  if (!athleteId) return res.status(400).json({ error: "Invalid athlete ID." });

  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { id: true, coachId: true } });
  if (!athlete) return res.status(404).json({ error: "Athlete not found." });

  if (session.user.role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || athlete.coachId !== coach.id) {
      return res.status(403).json({ error: "You do not have access to this athlete." });
    }
  }

  function parseAchievementBody(body) {
    const title = text(body?.title, 150, true);
    const achievementType = text(body?.achievementType, 100);
    const organization = text(body?.organization, 191);
    const description = text(body?.description, 2000);
    const medal = text(body?.medal, 50);
    const level = text(body?.level, 50);
    const isRecord = body?.isRecord === true || body?.isRecord === "true";
    const certificateUrl = text(body?.certificateUrl, 500);
    const sportId = validId(body?.sportId);
    const eventId = validId(body?.eventId);
    const eventPlanId = validId(body?.eventPlanId);
    let achievementDate = null;
    if (body?.achievementDate) {
      const parsed = new Date(`${String(body.achievementDate).slice(0, 10)}T00:00:00Z`);
      if (!isNaN(parsed.getTime())) achievementDate = parsed;
    }
    return { title, achievementType, organization, description, medal, level, isRecord, certificateUrl, sportId, eventId, eventPlanId, achievementDate };
  }

  async function eventPlanExists(eventPlanId) {
    if (!eventPlanId) return true;
    const plan = await prisma.eventPlan.findUnique({ where: { id: eventPlanId }, select: { id: true } });
    return !!plan;
  }

  if (req.method === "GET") {
    const achievements = await prisma.achievement.findMany({
      where: { athleteId },
      orderBy: { achievementDate: "asc" },
    });
    return res.status(200).json({ achievements: JSON.parse(JSON.stringify(achievements)) });
  }

  if (req.method === "POST") {
    if (!requireCsrf(req, res)) return;
    const fields = parseAchievementBody(req.body);
    if (!fields.title) return res.status(400).json({ error: "Achievement title is required." });
    if (!(await eventPlanExists(fields.eventPlanId))) return res.status(400).json({ error: "Selected meet was not found." });

    const achievement = await prisma.$transaction([
      prisma.achievement.create({
        data: {
          athleteId,
          achievementTitle: fields.title,
          achievementType: fields.achievementType || null,
          organization: fields.organization || null,
          description: fields.description || null,
          achievementDate: fields.achievementDate,
          medal: fields.medal || null,
          level: fields.level || null,
          isRecord: fields.isRecord,
          sportId: fields.sportId || null,
          eventId: fields.eventId || null,
          eventPlanId: fields.eventPlanId || null,
          certificateUrl: fields.certificateUrl || null,
        },
      }),
      prisma.auditLog.create({
        data: {
          action: "create",
          entityType: "achievement",
          entityId: 0,
          description: `Added achievement "${fields.title}" for athlete #${athleteId}`,
        },
      }),
    ]);

    return res.status(201).json({ success: true, achievement: JSON.parse(JSON.stringify(achievement[0])) });
  }

  if (req.method === "PUT") {
    if (!requireCsrf(req, res)) return;
    const id = validId(req.body?.id);
    if (!id) return res.status(400).json({ error: "Invalid achievement ID." });

    const existing = await prisma.achievement.findFirst({ where: { id, athleteId }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: "Achievement not found." });

    const fields = parseAchievementBody(req.body);
    if (!fields.title) return res.status(400).json({ error: "Achievement title is required." });
    if (!(await eventPlanExists(fields.eventPlanId))) return res.status(400).json({ error: "Selected meet was not found." });

    const achievement = await prisma.$transaction([
      prisma.achievement.update({
        where: { id },
        data: {
          achievementTitle: fields.title,
          achievementType: fields.achievementType || null,
          organization: fields.organization || null,
          description: fields.description || null,
          achievementDate: fields.achievementDate,
          medal: fields.medal || null,
          level: fields.level || null,
          isRecord: fields.isRecord,
          sportId: fields.sportId || null,
          eventId: fields.eventId || null,
          eventPlanId: fields.eventPlanId || null,
          certificateUrl: fields.certificateUrl || null,
        },
      }),
      prisma.auditLog.create({
        data: {
          action: "update",
          entityType: "achievement",
          entityId: id,
          description: `Updated achievement "${fields.title}" for athlete #${athleteId}`,
        },
      }),
    ]);

    return res.status(200).json({ success: true, achievement: JSON.parse(JSON.stringify(achievement[0])) });
  }

  return res.status(405).json({ error: "Method not allowed." });
}
