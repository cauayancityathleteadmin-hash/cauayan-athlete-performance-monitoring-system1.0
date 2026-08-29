import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

function buildResultData(results, metrics) {
  return results.map((result) => {
    const metric = metrics.find((item) => item.id === Number(result.metricId));
    const raw = result.value;
    if (metric.dataType === "text") return { metricId: metric.id, valueText: text(raw, 255, metric.isRequired) || null, valueDecimal: null, notes: text(result.notes, 255) || null };
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || (metric.minimumValue !== null && numeric < Number(metric.minimumValue)) || (metric.maximumValue !== null && numeric > Number(metric.maximumValue))) {
      throw new Error(`Invalid value for ${metric.metricName}.`);
    }
    return { metricId: metric.id, valueDecimal: numeric, valueText: null, notes: text(result.notes, 255) || null };
  });
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const entries = Array.isArray(req.body?.assessments) ? req.body.assessments : [req.body];
  if (entries.length === 0 || entries.length > 30) return res.status(400).json({ error: "Provide at least one assessment (max 30 per batch)." });

  const recorder = Number(session.user.id);
  const drafts = [];

  for (const entry of entries) {
    const athleteId = Number(entry?.athleteId);
    const assessmentDate = text(entry?.assessmentDate, 10, true);
    const assessmentType = text(entry?.assessmentType, 100) || "Regular Assessment";
    const results = entry?.results;

    if (!Number.isInteger(athleteId) || !assessmentDate || !Array.isArray(results) || results.length === 0 || results.length > 100) {
      return res.status(400).json({ error: "Each assessment needs an athlete, date, and at least one metric result." });
    }

    const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, include: { sport: true, coach: true } });
    if (!athlete) return res.status(404).json({ error: `Athlete #${athleteId} not found.` });
    if (session.user.role === "coach" && athlete.coach.userId !== recorder) {
      return res.status(403).json({ error: `Coaches may assess only athletes assigned to them (${athlete.athleteCode}).` });
    }

    const metricIds = results.map((result) => Number(result.metricId));
    if (metricIds.some((id) => !Number.isInteger(id)) || new Set(metricIds).size !== metricIds.length) {
      return res.status(400).json({ error: `Metric results are invalid or duplicated for ${athlete.athleteCode}.` });
    }

    const metrics = await prisma.performanceMetric.findMany({ where: { id: { in: metricIds }, status: "active" }, include: { event: true } });
    if (metrics.length !== metricIds.length || metrics.some((metric) => metric.event.sportId !== athlete.sportId)) {
      return res.status(400).json({ error: `One or more metrics do not belong to ${athlete.athleteCode}'s sport.` });
    }

    drafts.push({ athlete: athlete.athleteCode, athleteId, assessmentDate: new Date(assessmentDate), assessmentType, remarks: text(entry?.remarks, 2000) || null, resultData: buildResultData(results, metrics) });
  }

  try {
    const createdIds = await prisma.$transaction(async (tx) => {
      const ids = [];
      for (const draft of drafts) {
        const created = await tx.assessment.create({
          data: { athleteId: draft.athleteId, recordedBy: recorder, assessmentDate: draft.assessmentDate, assessmentType: draft.assessmentType, remarks: draft.remarks, results: { create: draft.resultData } },
        });
        await tx.auditLog.create({ data: { userId: recorder, action: "create", entityType: "assessment", entityId: created.id, description: `Recorded assessment for ${draft.athlete}` } });
        ids.push(created.id);
      }
      return ids;
    });
    return res.status(201).json({ count: createdIds.length, assessmentIds: createdIds });
  } catch (error) {
    if (error.message?.startsWith("Invalid value")) return res.status(400).json({ error: error.message });
    throw error;
  }
}