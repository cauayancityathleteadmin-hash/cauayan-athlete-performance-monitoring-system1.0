/* Single source of truth for the athlete bulk-import template and parser.
   ==========================================================================
   KEEP THIS LIST IN SYNC WITH THE ATHLETE DATA MODEL. The import API
   (lib/athlete-import.js) validates against these names/order, and the
   "Download template (CSV)" button in pages/athletes.js builds the sample
   file from these same constants — so the template can never drift from what
   the importer expects.

   RULE (standing): any change to the athlete data model (added/renamed/
   removed field, changed format) MUST update this list in the SAME change,
   including the matching sample value in ATHLETE_IMPORT_SAMPLE.
   ========================================================================== */

export const ATHLETE_IMPORT_HEADERS = [
  "first_name",
  "middle_name",
  "last_name",
  "suffix",
  "birthdate",
  "gender",
  "contact_number",
  "email",
  "address",
  "school_name",
  "sport_name",
  "coach_identifier",
];

/* Headers exposed to a non-admin coach (coach_identifier is admin-only). */
export function athleteImportHeaders(isAdmin) {
  return isAdmin ? ATHLETE_IMPORT_HEADERS : ATHLETE_IMPORT_HEADERS.slice(0, -1);
}

/* Realistic example row, keyed by header name so it always matches order.
   Keep the sample values realistic and enum-valid (birthdate YYYY-MM-DD,
   gender male/female/other/prefer_not_to_say). */
export const ATHLETE_IMPORT_SAMPLE = {
  first_name: "Juan",
  middle_name: "Dela",
  last_name: "Cruz",
  suffix: "Jr.",
  birthdate: "2010-05-20",
  gender: "male",
  contact_number: "09171234567",
  email: "juan.cruz@example.com",
  address: "City Proper",
  school_name: "Burgos National High School",
  sport_name: "Basketball",
  coach_identifier: "COA-TEST01",
};

/* Build the CSV example data row in the same order as the headers. */
export function athleteImportExampleRow(isAdmin) {
  return athleteImportHeaders(isAdmin)
    .map((header) => (ATHLETE_IMPORT_SAMPLE[header] != null ? String(ATHLETE_IMPORT_SAMPLE[header]) : ""))
    .join(",");
}