// Redirected as part of the Progress → Training merge.
// All athlete-progress value now lives inside Training:
//   Training Detail (/training-plans/[id]) → athlete roster → "See progress"
//   → /training-plans/[id]/athletes/[athleteId]
// Old bookmarks land on the athlete's most recent training plan drill page
// (or the athlete profile if they have no plans), never on an error page.
import { getSession } from "next-auth/react";
import { prisma } from "../../../lib/prisma";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };

  const id = Number(context.query.id);
  if (!Number.isSafeInteger(id) || id <= 0) return { notFound: true };

  const athlete = await prisma.athlete.findUnique({
    where: { id },
    select: { id: true, coachId: true },
  });
  if (!athlete) return { notFound: true };

  if (session.user.role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || athlete.coachId !== coach.id) return { redirect: { destination: "/athletes", permanent: false } };
  }

  const membership = await prisma.trainingPlanAthlete.findFirst({
    where: { athleteId: id },
    orderBy: { plan: { startDate: "desc" } },
    select: { planId: true },
  });

  const destination = membership ? `/training-plans/${membership.planId}/athletes/${id}` : `/athletes/${id}`;
  return { redirect: { destination, permanent: false } };
}

// Next.js requires a default component export even for redirect-only routes.
export default function LegacyProgressRedirect() {
  return null;
}