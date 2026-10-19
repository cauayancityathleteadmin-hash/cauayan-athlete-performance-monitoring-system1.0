// Document-compliance evaluation — single source of truth shared by
// GET /api/reports/document-compliance and the per-athlete checklist strip
// (components/AthleteDocuments.js). Keep both callers in sync with this logic.

export const EXPIRING_SOON_DAYS = 30;

// documents: [{ documentTypeId, expiresAt }]  (an athlete's uploads)
// requiredTypes: [{ id, name, hasExpiry }]   (active types with isRequired)
// Returns per-athlete compliance: a required type counts as satisfied only when
// it has at least one upload that is not expired.
export function evaluateCompliance(documents, requiredTypes, now = new Date()) {
  const byType = new Map();
  for (const doc of documents || []) {
    if (!byType.has(doc.documentTypeId)) byType.set(doc.documentTypeId, []);
    byType.get(doc.documentTypeId).push(doc);
  }

  const missing = [];
  const expiring = [];
  const expired = [];
  const todayMs = now.getTime();

  for (const type of requiredTypes || []) {
    const docs = byType.get(type.id) || [];
    if (!docs.length) {
      missing.push(type.name);
      continue;
    }
    if (type.hasExpiry) {
      const dates = docs
        .map((d) => (d.expiresAt ? new Date(d.expiresAt).getTime() : null))
        .filter((v) => v !== null && !isNaN(v));
      if (dates.length) {
        const latest = Math.max(...dates);
        if (latest < todayMs) expired.push({ name: type.name, expiresAt: new Date(latest).toISOString() });
        else if (latest - todayMs <= EXPIRING_SOON_DAYS * 86400000) expiring.push({ name: type.name, expiresAt: new Date(latest).toISOString() });
      }
    }
  }

  const required = (requiredTypes || []).length;
  const validUploaded = required - missing.length - expired.length;
  return {
    required,
    validUploaded: Math.max(0, validUploaded),
    missing,
    expiring,
    expired,
    complete: required > 0 && missing.length === 0 && expired.length === 0,
    percent: required > 0 ? Math.round((Math.max(0, validUploaded) / required) * 100) : null,
  };
}
