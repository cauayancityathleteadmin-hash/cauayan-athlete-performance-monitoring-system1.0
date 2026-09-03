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

  if (req.method === "GET") {
    const achievements = await prisma.achievement.findMany({
      where: { athleteId },
      orderBy: { achievementDate: "asc" },
    });
    return res.status(200).json({ achievements: JSON.parse(JSON.stringify(achievements)) });
  }

  if (req.method === "POST") {
    if (!requireCsrf(req, res)) return;
    const title = text(req.body?.title, 150, true);
    const achievementType = text(req.body?.achievementType, 100);
    const organization = text(req.body?.organization, 191);
    const description = text(req.body?.description, 2000);
    const medal = text(req.body?.medal, 50);
    const level = text(req.body?.level, 50);
    const certificateUrl = text(req.body?.certificateUrl, 500);
    const sportId = validId(req.body?.sportId);
    const eventId = validId(req.body?.eventId);
    let achievementDate = null;
    if (req.body?.achievementDate) {
      const parsed = new Date(`${String(req.body.achievementDate).slice(0, 10)}T00:00:00Z`);
      if (!isNaN(parsed.getTime())) achievementDate = parsed;
    }
    if (!title) return res.status(400).json({ error: "Achievement title is required." });

    const achievement = await prisma.$transaction([
      prisma.achievement.create({
        data: {
          athleteId,
          achievementTitle: title,
          achievementType: achievementType || null,
          organization: organization || null,
          description: description || null,
          achievementDate,
          medal: medal || null,
          level: level || null,
          sportId: sportId || null,
          eventId: eventId || null,
          certificateUrl: certificateUrl || null,
        },
      }),
      prisma.auditLog.create({
        data: {
          action: "create",
          entityType: "achievement",
          entityId: 0,
          description: `Added achievement "${title}" for athlete #${athleteId}`,
        },
      }),
    ]);

    return res.status(201).json({ success: true, achievement: JSON.parse(JSON.stringify(achievement[0])) });
  }

  return res.status(405).json({ error: "Method not allowed." });
}
