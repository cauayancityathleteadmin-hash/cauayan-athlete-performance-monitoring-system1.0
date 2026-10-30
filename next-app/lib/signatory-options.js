// Client-safe signatory options and defaults (no database imports).
// Shared by the admin UI, the report renderer, and the API validation.

export const REPORT_TYPES = [
  { key: "athlete_record", label: "Athlete record" },
  { key: "coach_record", label: "Coach record" },
  { key: "compliance", label: "Document compliance" },
  { key: "accomplishments", label: "Accomplishments" },
  { key: "event_winners", label: "Event winners" },
];

export const SIGNATORY_ROLES = [
  { key: "prepared_by", label: "Prepared by" },
  { key: "reviewed_by", label: "Reviewed by" },
  { key: "certified_by", label: "Certified Correct" },
  { key: "noted_by", label: "Noted by" },
];

export const DISPLAY_MODES = [
  { key: "name_position_line", label: "Name, position, and signature line" },
  { key: "name_position", label: "Name and position" },
  { key: "designation_only", label: "Designation only" },
  { key: "line_only", label: "Blank signature line" },
];

export const REPORT_TYPE_KEYS = REPORT_TYPES.map((item) => item.key);
export const ROLE_KEYS = SIGNATORY_ROLES.map((item) => item.key);
export const DISPLAY_MODE_KEYS = DISPLAY_MODES.map((item) => item.key);

// Legacy chain used when a report type has no admin configuration. Positions are
// office designations, not names of real people; names stay blank unless the
// signed-in user prepares the report.
export const DEFAULT_SIGNATORIES = [
  { role: "prepared_by", position: "Authorized User, City Sports Development Office", displayMode: "name_position_line" },
  { role: "reviewed_by", position: "Head, Sports Development Division", displayMode: "name_position_line" },
  { role: "certified_by", position: "City Sports Development Officer", displayMode: "name_position_line" },
];

export function reportTypeLabel(key) {
  return REPORT_TYPES.find((item) => item.key === key)?.label || key;
}

export function roleLabel(key) {
  return SIGNATORY_ROLES.find((item) => item.key === key)?.label || key;
}
