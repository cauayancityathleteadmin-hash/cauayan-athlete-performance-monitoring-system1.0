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
    const notes = await prisma.coachingNote.findMany({
      where: { athleteId },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { username: true, email: true, coach: { select: { firstName: true, lastName: true } } } } },
    });
    return res.status(200).json({ notes: JSON.parse(JSON.stringify(notes)) });
  }

  if (req.method === "POST") {
    if (!requireCsrf(req, res)) return;
    const note = text(req.body?.note, 5000, true);
    if (!note) return res.status(400).json({ error: "Note is required." });

    const created = await prisma.$transaction([
      prisma.coachingNote.create({
        data: {
          athleteId,
          authorId: Number(session.user.id),
          note,
        },
        include: { author: { select: { username: true, email: true, coach: { select: { firstName: true, lastName: true } } } } },
      }),
      prisma.auditLog.create({
        data: {
          userId: Number(session.user.id),
          action: "create",
          entityType: "coaching_note",
          entityId: 0,
          description: `Added coaching note for athlete #${athleteId}`,
          ipAddress: ip,
        },
      }),
    ]);

    return res.status(201).json({ success: true, note: JSON.parse(JSON.stringify(created[0])) });
  }

  return res.status(405).json({ error: "Method not allowed." });
}
