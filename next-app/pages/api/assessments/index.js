import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const athleteId = Number(req.body?.athleteId);
  const assessmentDate = text(req.body?.assessmentDate, 10, true);
  const assessmentType = text(req.body?.assessmentType, 100) || "Regular Assessment";
  const results = req.body?.results;

  if (!Number.isInteger(athleteId) || !assessmentDate || !Array.isArray(results) || results.length === 0 || results.length > 100) {
    return res.status(400).json({ error: "Provide an athlete, date, and at least one metric result." });
  }

  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, include: { sport: true, coach: true } });
  if (!athlete) return res.status(404).json({ error: "Athlete not found." });

  const recorder = Number(session.user.id);
  if (session.user.role === "coach" && athlete.coach.userId !== recorder) {
    return res.status(403).json({ error: "Coaches may assess only athletes assigned to them." });
  }

  const metricIds = results.map((result) => Number(result.metricId));
  if (metricIds.some((id) => !Number.isInteger(id)) || new Set(metricIds).size !== metricIds.length) {
    return res.status(400).json({ error: "Metric results are invalid or duplicated." });
  }

  const metrics = await prisma.performanceMetric.findMany({ where: { id: { in: metricIds }, status: "active" }, include: { event: true } });
  if (metrics.length !== metricIds.length || metrics.some((metric) => metric.event.sportId !== athlete.sportId)) {
    return res.status(400).json({ error: "One or more metrics do not belong to this athlete's sport." });
  }

  try {
    const resultData = results.map((result) => {
      const metric = metrics.find((item) => item.id === Number(result.metricId));
      const raw = result.value;
      if (metric.dataType === "text") return { metricId: metric.id, valueText: text(raw, 255, metric.isRequired) || null, valueDecimal: null, notes: text(result.notes, 255) || null };
      const numeric = Number(raw);
      if (!Number.isFinite(numeric) || (metric.minimumValue !== null && numeric < Number(metric.minimumValue)) || (metric.maximumValue !== null && numeric > Number(metric.maximumValue))) {
        throw new Error(`Invalid value for ${metric.metricName}.`);
      }
      return { metricId: metric.id, valueDecimal: numeric, valueText: null, notes: text(result.notes, 255) || null };
    });

    const assessment = await prisma.$transaction(async (tx) => {
      const created = await tx.assessment.create({
        data: { athleteId, recordedBy: recorder, assessmentDate: new Date(assessmentDate), assessmentType, remarks: text(req.body?.remarks, 2000) || null, results: { create: resultData } },
      });
      await tx.auditLog.create({ data: { userId: recorder, action: "create", entityType: "assessment", entityId: created.id, description: `Recorded assessment for ${athlete.athleteCode}` } });
      return created;
    });
    return res.status(201).json(assessment);
  } catch (error) {
    if (error.message?.startsWith("Invalid value")) return res.status(400).json({ error: error.message });
    throw error;
  }
}