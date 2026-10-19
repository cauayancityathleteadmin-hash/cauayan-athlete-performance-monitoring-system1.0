import { prisma } from "../../../lib/prisma";
import { requireSession, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { computeAchievementPoints, medalCounts, MEDAL_ORDER } from "../../../lib/points";

function parseDate(value, endOfDay = false) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return isNaN(d.getTime()) ? null : d;
}

// GET /api/reports/accomplishments?from=YYYY-MM-DD&to=YYYY-MM-DD
// Period-scoped accomplishments for the Accomplishments tab (lean endpoint).
export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:GET:accomplishments`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const isAdmin = session.user.role === "admin";
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to, true);
  const hasPeriod = !!(from || to);

  const scopeWhere = isAdmin ? {} : { coach: { userId: Number(session.user.id) } };
  const dateWhere = hasPeriod ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;

  const [athletes, achievements, meets, assessmentCount] = await Promise.all([
    prisma.athlete.findMany({
      where: scopeWhere,
      select: { id: true, sportId: true, schoolId: true, coachId: true, dateRegistered: true },
    }),
    prisma.achievement.findMany({
      where: {
        ...(scopeWhere.coach ? { athlete: scopeWhere } : {}),
        ...(dateWhere ? { achievementDate: dateWhere } : {}),
      },
      orderBy: { achievementDate: "desc" },
      select: {
        id: true,
        achievementTitle: true,
        achievementDate: true,
        medal: true,
        level: true,
        isRecord: true,
        sport: { select: { sportName: true } },
        event: { select: { eventName: true, eventCategory: true } },
        eventPlan: { select: { eventName: true, startDate: true } },
        athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true, school: { select: { schoolName: true } } } },
      },
    }),
    prisma.eventPlan.findMany({
      where: dateWhere ? { startDate: dateWhere } : {},
      orderBy: { startDate: "desc" },
      take: 100,
      select: { id: true, eventName: true, startDate: true, venue: true, status: true },
    }),
    prisma.assessment.count({
      where: {
        ...(scopeWhere.coach ? { athlete: scopeWhere } : {}),
        ...(dateWhere ? { assessmentDate: dateWhere } : {}),
      },
    }),
  ]);

  const athleteIds = new Set(athletes.map((a) => a.id));
  const scoped = achievements.filter((a) => athleteIds.has(a.athlete.id));

  // Medal + level tallies, per-sport tally, top athletes — all server-computed
  const medalTally = medalCounts(scoped);
  const levelTally = {};
  const sportTally = {};
  const byAthlete = new Map();

  for (const a of scoped) {
    const points = computeAchievementPoints(a);
    if (a.level) levelTally[a.level] = (levelTally[a.level] || 0) + 1;

    const sportName = a.sport?.sportName || "—";
    if (!sportTally[sportName]) sportTally[sportName] = { sport: sportName, count: 0, points: 0, medals: medalCounts([]) };
    sportTally[sportName].count += 1;
    sportTally[sportName].points += points;
    if (a.medal && sportTally[sportName].medals[a.medal] !== undefined) sportTally[sportName].medals[a.medal] += 1;

    const key = a.athlete.id;
    if (!byAthlete.has(key)) {
      byAthlete.set(key, {
        athleteId: key,
        athleteCode: a.athlete.athleteCode,
        name: `${a.athlete.lastName}, ${a.athlete.firstName}`,
        school: a.athlete.school?.schoolName || null,
        points: 0,
        count: 0,
        medals: medalCounts([]),
        mostRecent: null,
      });
    }
    const row = byAthlete.get(key);
    row.points += points;
    row.count += 1;
    if (a.medal && row.medals[a.medal] !== undefined) row.medals[a.medal] += 1;
    const d = a.achievementDate ? new Date(a.achievementDate).getTime() : 0;
    if (!row.mostRecent || d > row.mostRecent) row.mostRecent = d;
  }

  const topAthletes = [...byAthlete.values()]
    .sort((x, y) => y.points - x.points || y.medals.gold - x.medals.gold || y.medals.silver - x.medals.silver)
    .slice(0, 15)
    .map((r) => ({ ...r, mostRecent: r.mostRecent ? new Date(r.mostRecent).toISOString() : null }));

  const records = scoped
    .filter((a) => a.isRecord)
    .map((a) => ({
      title: a.achievementTitle,
      athlete: `${a.athlete.lastName}, ${a.athlete.firstName}`,
      athleteCode: a.athlete.athleteCode,
      sport: a.sport?.sportName || null,
      level: a.level,
      medal: a.medal,
      date: a.achievementDate?.toISOString() || null,
    }));

  const registeredInRange = hasPeriod
    ? athletes.filter((a) => {
        const d = new Date(a.dateRegistered).getTime();
        return (!from || d >= from.getTime()) && (!to || d <= to.getTime());
      }).length
    : null;

  return res.status(200).json({
    period: {
      from: (req.query.from || "").slice(0, 10) || null,
      to: (req.query.to || "").slice(0, 10) || null,
      allTime: !hasPeriod,
    },
    counts: {
      achievements: scoped.length,
      points: scoped.reduce((sum, a) => sum + computeAchievementPoints(a), 0),
      athletesWithAchievements: byAthlete.size,
      athletesRegistered: registeredInRange,
      meetsHeld: meets.length,
      assessments: assessmentCount,
      schools: new Set(athletes.map((a) => a.schoolId).filter(Boolean)).size,
      sports: new Set(athletes.map((a) => a.sportId).filter(Boolean)).size,
      athletesInScope: athletes.length,
    },
    medalTally,
    levelTally,
    sportTally: Object.values(sportTally).sort((x, y) => y.points - x.points),
    topAthletes,
    records,
    meets,
    medalOrder: MEDAL_ORDER,
    scope: isAdmin ? "all" : "coach",
    generatedAt: new Date().toISOString(),
  });
}
