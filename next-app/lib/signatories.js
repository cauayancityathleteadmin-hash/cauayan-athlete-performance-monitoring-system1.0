// Server-side signatory queries for official reports.
//
// Rules (also enforced by /api/admin/signatories):
// - A signatory belongs to exactly one report type and one signature role.
// - Only active rows inside their effective window are used.
// - If a report type has no configured rows, reports keep the legacy built-in
//   chain so existing output never breaks.
// - A printed name is configuration, never proof that a person signed.

import { prisma } from "./prisma";

export {
  REPORT_TYPES,
  SIGNATORY_ROLES,
  DISPLAY_MODES,
  REPORT_TYPE_KEYS,
  ROLE_KEYS,
  DISPLAY_MODE_KEYS,
  DEFAULT_SIGNATORIES,
  reportTypeLabel,
  roleLabel,
} from "./signatory-options";

/**
 * Active signatories grouped by report type, already filtered by effective date.
 * Returns plain JSON-safe rows.
 */
export async function loadSignatoriesByType(at = new Date()) {
  const rows = await prisma.signatory.findMany({
    where: { status: "active" },
    orderBy: [{ reportType: "asc" }, { displayOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      reportType: true,
      role: true,
      printedName: true,
      position: true,
      office: true,
      displayMode: true,
      displayOrder: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  });

  const byType = {};
  for (const row of rows) {
    if (row.effectiveFrom && new Date(row.effectiveFrom) > at) continue;
    if (row.effectiveTo && new Date(row.effectiveTo) < at) continue;
    (byType[row.reportType] ||= []).push(row);
  }
  return byType;
}
