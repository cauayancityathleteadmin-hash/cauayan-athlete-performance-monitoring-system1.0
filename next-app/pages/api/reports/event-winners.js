import { prisma } from "../../../lib/prisma";
import { requireSession, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { computeAchievementPoints, medalCounts, MEDAL_ORDER } from "../../../lib/points";

const MEDAL_RANK = Object.fromEntries(MEDAL_ORDER.map((m, i) => [m, i]));

// GET /api/reports/event-winners                -> meet picker list
// GET /api/reports/event-winners?eventPlanId=X  -> full results for one meet
export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:GET:event-winners`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const isAdmin = session.user.role === "admin";
  const eventPlanId = Number(req.query.eventPlanId) > 0 ? Number(req.query.eventPlanId) : null;

  // 1. Meet picker: recent meets with winner counts
  if (!eventPlanId) {
    const plans = await prisma.eventPlan.findMany({
      where: isAdmin ? {} : { status: { in: ["open", "closed"] } },
      orderBy: { startDate: "desc" },
      take: 60,
      select: {
        id: true,
        eventName: true,
        startDate: true,
        endDate: true,
        venue: true,
        status: true,
        _count: { select: { achievements: true, participants: { where: { status: "active" } } } },
      },
    });
    const meets = plans.map((p) => ({
      id: p.id,
      eventName: p.eventName,
      startDate: p.startDate,
      endDate: p.endDate,
      venue: p.venue,
      status: p.status,
      winners: p._count.achievements,
      participants: p._count.participants,
    }));
    return res.status(200).json({ meets });
  }

  // 2. One meet's results
  const plan = await prisma.eventPlan.findUnique({ where: { id: eventPlanId } });
  if (!plan) return res.status(404).json({ error: "Event not found." });
  if (!isAdmin && plan.status === "draft") return res.status(403).json({ error: "This event is not published yet." });

  const achievements = await prisma.achievement.findMany({
    where: { eventPlanId: plan.id },
    select: {
      id: true,
      achievementTitle: true,
      achievementDate: true,
      medal: true,
      level: true,
      isRecord: true,
      sport: { select: { sportName: true } },
      event: { select: { eventName: true, eventCategory: true } },
      athlete: { select: { athleteCode: true, firstName: true, lastName: true, school: { select: { schoolName: true } } } },
    },
  });

  // Group by sport, sort by medal rank then points
  const groupsMap = new Map();
  for (const a of achievements) {
    const sportName = a.sport?.sportName || "Other";
    if (!groupsMap.has(sportName)) groupsMap.set(sportName, []);
    groupsMap.get(sportName).push({
      achievementId: a.id,
      title: a.achievementTitle,
      athlete: `${a.athlete.lastName}, ${a.athlete.firstName}`,
      athleteCode: a.athlete.athleteCode,
      school: a.athlete.school?.schoolName || null,
      discipline: a.event?.eventName || null,
      medal: a.medal,
      level: a.level,
      isRecord: a.isRecord,
      points: computeAchievementPoints(a),
      date: a.achievementDate?.toISOString() || null,
    });
  }
  const groups = [...groupsMap.entries()]
    .map(([sport, entries]) => ({
      sport,
      entries: entries.sort(
        (x, y) =>
          (MEDAL_RANK[x.medal] ?? MEDAL_ORDER.length) - (MEDAL_RANK[y.medal] ?? MEDAL_ORDER.length) ||
          y.points - x.points ||
          String(x.athlete).localeCompare(String(y.athlete))
      ),
      medals: medalCounts(entries),
    }))
    .sort((x, y) => x.sport.localeCompare(y.sport));

  // School delegation tally
  const tallyMap = new Map();
  for (const a of achievements) {
    const school = a.athlete.school?.schoolName || "—";
    if (!tallyMap.has(school)) tallyMap.set(school, { school, ...medalCounts([]), total: 0, points: 0 });
    const row = tallyMap.get(school);
    row.total += 1;
    row.points += computeAchievementPoints(a);
    if (a.medal && row[a.medal] !== undefined) row[a.medal] += 1;
  }
  const tally = [...tallyMap.values()].sort(
    (x, y) => y.gold - x.gold || y.silver - x.silver || y.bronze - x.bronze || y.points - x.points
  );

  return res.status(200).json({
    plan: {
      id: plan.id,
      eventName: plan.eventName,
      startDate: plan.startDate,
      endDate: plan.endDate,
      venue: plan.venue,
      status: plan.status,
    },
    groups,
    tally,
    summary: {
      entries: achievements.length,
      sports: groups.length,
      delegations: tally.length,
      records: achievements.filter((a) => a.isRecord).length,
      medalCounts: medalCounts(achievements),
    },
    generatedAt: new Date().toISOString(),
  });
}
