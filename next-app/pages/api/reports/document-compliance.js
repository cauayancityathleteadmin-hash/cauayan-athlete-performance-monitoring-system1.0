import { prisma } from "../../../lib/prisma";
import { requireSession, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { evaluateCompliance } from "../../../lib/compliance";

// GET /api/reports/document-compliance?schoolId=&sportId=&incomplete=1
// Lean per-need endpoint for the Compliance tab (admin: all athletes, coach: own).
export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:GET:document-compliance`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const isAdmin = session.user.role === "admin";
  const schoolId = Number(req.query.schoolId) > 0 ? Number(req.query.schoolId) : null;
  const sportId = Number(req.query.sportId) > 0 ? Number(req.query.sportId) : null;
  const incompleteOnly = req.query.incomplete === "1";

  const scopeWhere = isAdmin ? {} : { coach: { userId: Number(session.user.id) } };

  const [requiredTypes, allAthletes, schools, sports] = await Promise.all([
    prisma.documentType.findMany({
      where: { status: "active", isRequired: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, hasExpiry: true },
    }),
    prisma.athlete.findMany({
      where: scopeWhere,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        athleteCode: true,
        firstName: true,
        middleName: true,
        lastName: true,
        status: true,
        schoolId: true,
        sportId: true,
        school: { select: { schoolName: true } },
        sport: { select: { sportName: true } },
        coach: { select: { firstName: true, lastName: true } },
        documents: { select: { documentTypeId: true, expiresAt: true } },
      },
    }),
    prisma.school.findMany({ where: { athletes: { some: scopeWhere } }, orderBy: { schoolName: "asc" }, select: { id: true, schoolName: true } }),
    prisma.sport.findMany({ where: { athletes: { some: scopeWhere } }, orderBy: { sportName: "asc" }, select: { id: true, sportName: true } }),
  ]);

  let rows = allAthletes.map((a) => {
    const c = evaluateCompliance(a.documents, requiredTypes);
    return {
      athleteId: a.id,
      athleteCode: a.athleteCode,
      name: `${a.lastName}, ${a.firstName}${a.middleName ? ` ${a.middleName}` : ""}`,
      schoolId: a.schoolId,
      school: a.school?.schoolName || null,
      sportId: a.sportId,
      sport: a.sport?.sportName || null,
      coach: a.coach ? `${a.coach.lastName}, ${a.coach.firstName}` : null,
      status: a.status,
      required: c.required,
      validUploaded: c.validUploaded,
      missing: c.missing,
      expiring: c.expiring,
      expired: c.expired,
      percent: c.percent,
      complete: c.complete,
    };
  });

  if (schoolId) rows = rows.filter((r) => r.schoolId === schoolId);
  if (sportId) rows = rows.filter((r) => r.sportId === sportId);
  if (incompleteOnly) rows = rows.filter((r) => !r.complete);

  const completeCount = rows.filter((r) => r.complete).length;
  const requiredCount = requiredTypes.length;
  const overallSlots = rows.length * (requiredCount || 0);
  const filledSlots = rows.reduce((sum, r) => sum + r.validUploaded, 0);

  // Per-school summary computed on the FULL scope (not the filtered rows) so the
  // school chips always show honest totals; then narrowed to selected filters.
  const baseRows = allAthletes.map((a) => ({ schoolId: a.schoolId, ...evaluateCompliance(a.documents, requiredTypes) }));
  const schoolSummaries = schools
    .map((s) => {
      const group = baseRows.filter((r) => r.schoolId === s.id);
      const done = group.filter((r) => r.complete).length;
      return { schoolId: s.id, name: s.schoolName, total: group.length, complete: done, incomplete: group.length - done };
    })
    .filter((s) => s.total > 0);

  return res.status(200).json({
    requiredTypes,
    filters: { schools, sports },
    rows,
    schoolSummaries,
    summary: {
      athletes: rows.length,
      complete: completeCount,
      incomplete: rows.length - completeCount,
      percent: overallSlots ? Math.round((filledSlots / overallSlots) * 100) : null,
      percentCompleteAthletes: rows.length ? Math.round((completeCount / rows.length) * 100) : 0,
    },
    scope: isAdmin ? "all" : "coach",
    generatedAt: new Date().toISOString(),
  });
}
