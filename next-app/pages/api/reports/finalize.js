import { requireCsrf, requireSession, setSecurityHeaders, validId } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { finalizeReport, parsePeriodDate, SUBJECT_TYPES } from "../../../lib/report-finalize";

// POST /api/reports/finalize
// Body: { subjectType: "athlete" | "coach", subjectId: number, from?: "YYYY-MM-DD", to?: "YYYY-MM-DD" }
// Freezes the subject snapshot and the resolved signature rows into an immutable
// ReportDocument. There is deliberately no update or delete endpoint.
export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`reports-finalize:${ip}:${session.user.id}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const subjectType = req.body?.subjectType;
  if (!SUBJECT_TYPES.includes(subjectType)) {
    return res.status(400).json({ error: "Choose a valid record type." });
  }
  const subjectId = validId(req.body?.subjectId);
  if (!subjectId) return res.status(400).json({ error: "A valid record id is required." });

  const from = parsePeriodDate(req.body?.from);
  const to = parsePeriodDate(req.body?.to);
  if (from.error || to.error) return res.status(400).json({ error: from.error || to.error });
  if (from.value && to.value && from.value > to.value) {
    return res.status(400).json({ error: "The start of the period cannot be after its end." });
  }

  try {
    const result = await finalizeReport({
      session,
      subjectType,
      subjectId,
      from: from.value ? req.body.from : "",
      to: to.value ? req.body.to : "",
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    return res.status(201).json({
      id: result.document.id,
      reference: result.document.reference,
      subjectType: result.document.subjectType,
      subjectName: result.document.subjectName,
      periodLabel: result.document.periodLabel,
      finalizedAt: result.document.finalizedAt,
      contentHash: result.document.contentHash,
    });
  } catch (error) {
    console.error("finalize report failed:", error);
    return res.status(500).json({ error: "Could not finalize the report. Please try again." });
  }
}
