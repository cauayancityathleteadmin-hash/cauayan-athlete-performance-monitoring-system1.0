import { prisma } from "../../../../lib/prisma";
import { requireSession, setSecurityHeaders, validId } from "../../../../lib/api-security";
import { canManageAthleteDocuments } from "../../../../lib/document-access";
import { evaluateCompliance } from "../../../../lib/compliance";

/**
 * GET /api/athletes/:id/eligibility
 *
 * Single eligibility source for the whole app. Returns the athlete's document
 * compliance: { required, validUploaded, missing[], expiring[], expired[],
 * complete, percent }. Any surface that needs "is this athlete clear to play"
 * (Athletes list strip, Events readiness gate, Reports) calls this instead of
 * re-implementing the rule. The rule itself lives in lib/compliance.js.
 *
 * Access: admin, or the athlete's own coach (same rule as their documents).
 */
export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const athleteId = validId(req.query.id);
  if (!athleteId) return res.status(400).json({ error: "A valid athlete id is required." });

  const allowed = await canManageAthleteDocuments(session, athleteId);
  if (!allowed) {
    return res.status(403).json({ error: "You do not have permission to view this athlete's eligibility." });
  }

  try {
    const [documents, requiredTypes] = await Promise.all([
      prisma.athleteDocument.findMany({
        where: { athleteId },
        select: { documentTypeId: true, expiresAt: true },
      }),
      prisma.documentType.findMany({
        where: { status: "active", isRequired: true },
        select: { id: true, name: true, hasExpiry: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    const eligibility = evaluateCompliance(documents, requiredTypes);
    return res.status(200).json({ ok: true, athleteId, eligibility });
  } catch (error) {
    console.error("Eligibility lookup failed", error);
    return res.status(500).json({ error: "Eligibility could not be computed." });
  }
}
