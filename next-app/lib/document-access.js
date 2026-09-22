import { prisma } from "./prisma";

/**
 * Only the athlete's own coach or an admin may view/manage an athlete's
 * official documents. Every document API route re-checks this server-side —
 * the Athlete Profile page alone is never the access control.
 */
export async function canManageAthleteDocuments(session, athleteId) {
  if (!session?.user?.role) return false;
  if (session.user.role === "admin") return true;
  if (session.user.role !== "coach") return false;
  const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
  if (!coach) return false;
  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { coachId: true } });
  return athlete ? athlete.coachId === coach.id : false;
}