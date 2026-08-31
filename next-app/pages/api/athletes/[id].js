import { prisma } from "../../../lib/prisma";
import { requireSession, validId, setSecurityHeaders } from "../../../lib/api-security";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const session = await requireSession(req, res);
  if (!session) return;

  const id = validId(req.query?.id);
  if (!id) return res.status(400).json({ error: "Invalid athlete ID." });

  const athlete = await prisma.athlete.findUnique({
    where: { id },
    include: {
      sport: true,
      event: true,
      school: true,
      coach: { select: { id: true, coachCode: true, firstName: true, middleName: true, lastName: true, school: true } },
      assessments: {
        orderBy: { assessmentDate: "asc" },
        include: { results: { include: { metric: true } } },
      },
      statusHistory: { orderBy: { changedAt: "asc" }, include: { changer: { select: { email: true } } } },
      coachHistory: { orderBy: { startedAt: "asc" }, include: { coach: { select: { firstName: true, lastName: true, coachCode: true } }, assigner: { select: { email: true } } } },
      achievements: { orderBy: { achievementDate: "asc" } },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { username: true, email: true, coach: { select: { firstName: true, lastName: true } } } } },
      },
      participants: {
        where: { status: "active" },
        include: { eventPlan: { select: { id: true, eventName: true, startDate: true, endDate: true, status: true } }, sport: { select: { sportName: true } } },
        orderBy: { addedAt: "desc" },
      },
    },
  });

  if (!athlete) return res.status(404).json({ error: "Athlete not found." });

  if (session.user.role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || athlete.coachId !== coach.id) {
      return res.status(403).json({ error: "You do not have access to this athlete." });
    }
  }

  return res.status(200).json({ athlete: JSON.parse(JSON.stringify(athlete)) });
}
