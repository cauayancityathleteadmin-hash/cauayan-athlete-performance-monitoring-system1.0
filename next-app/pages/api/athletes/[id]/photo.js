import { prisma } from "../../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../../lib/api-security";
import { rateLimiters } from "../../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "PUT") return res.status(405).json({ error: "Method not allowed." });

  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:photo`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });
  if (!requireCsrf(req, res)) return;

  const id = validId(req.query?.id);
  if (!id) return res.status(400).json({ error: "Invalid athlete ID." });

  const basic = await prisma.athlete.findUnique({ where: { id }, select: { id: true, coachId: true } });
  if (!basic) return res.status(404).json({ error: "Athlete not found." });

  if (session.user.role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || basic.coachId !== coach.id) {
      return res.status(403).json({ error: "You do not have access to this athlete." });
    }
  }

  const pictureUrl = text(req.body?.pictureUrl, 2000) || null;
  if (pictureUrl && !/^https?:\/\//.test(pictureUrl)) {
    return res.status(400).json({ error: "Provide a valid photo URL starting with http(s)://." });
  }

  const updated = await prisma.athlete.update({ where: { id }, data: { pictureUrl } });
  await prisma.auditLog.create({
    data: {
      userId: Number(session.user.id),
      action: "update_photo",
      entityType: "athlete",
      entityId: id,
      description: pictureUrl ? "Updated the athlete ID photo." : "Removed the athlete ID photo.",
    },
  });
  return res.status(200).json({ athlete: JSON.parse(JSON.stringify(updated)) });
}