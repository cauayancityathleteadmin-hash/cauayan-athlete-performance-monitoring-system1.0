/* ============================================================================
   ATHLETE DOCUMENT TYPES — single source of truth for the starter catalog.

   Admins can add / edit / reorder / deactivate types on the fly via
   Admin → Document types; the rows below are the DEFAULT seed (idempotent
   upserts in prisma/seed.js and the one-off live seed). "Other" is a flag on
   a type (coach supplies a custom label at upload time), not a special row.

   Based on real DepEd/Palarong Pambansa athlete eligibility screening requirements.
   ========================================================================== */

export const DOCUMENT_TYPE_SEED = [
  // Core eligibility screening documents (required by DepEd/Palaro)
  { name: "PSA/NSO Birth Certificate", isRequired: true, isOther: false, sortOrder: 10, hasExpiry: false, expiryMonths: null, description: "Original + photocopy; identity & age eligibility. Foreign-born: original BC from country of birth + valid passport." },
  { name: "AR-1 (Athlete's Record)", isRequired: true, isOther: false, sortOrder: 20, hasExpiry: false, expiryMonths: null, description: "Official form signed by athlete, coach, Sports Division Supervisor." },
  { name: "Medical Certificate", isRequired: true, isOther: false, sortOrder: 30, hasExpiry: true, expiryMonths: 3, description: "Signed by licensed physician, fit to compete. Combative sports require separate detailed form. Valid 3 months." },
  { name: "Dental Certificate", isRequired: true, isOther: false, sortOrder: 40, hasExpiry: true, expiryMonths: 6, description: "Signed by licensed dentist. Valid 6 months." },
  { name: "ID Photo (1.5\"×1.5\", white bg)", isRequired: true, isOther: false, sortOrder: 50, hasExpiry: false, expiryMonths: null, description: "Required alongside AR-1 and Dental Certificate submissions." },

  // School records (required for enrollment/academic standing)
  { name: "Form 137 (Permanent Record)", isRequired: true, isOther: false, sortOrder: 60, hasExpiry: false, expiryMonths: null, description: "Standard basic education record for enrollment/academic standing." },
  { name: "Form 138 (Report Card)", isRequired: true, isOther: false, sortOrder: 70, hasExpiry: false, expiryMonths: null, description: "Standard basic education record for enrollment/academic standing." },

  // Supporting documents
  { name: "School ID", isRequired: true, isOther: false, sortOrder: 80, hasExpiry: false, expiryMonths: null, description: "Common identity requirement." },
  { name: "Parent/Guardian Consent Form", isRequired: true, isOther: false, sortOrder: 90, hasExpiry: false, expiryMonths: null, description: "Required for minor athletes." },
  { name: "Barangay Certificate", isRequired: false, isOther: false, sortOrder: 100, hasExpiry: false, expiryMonths: null, description: "Local program may require (e.g., Cauayan City-specific)." },

  // "Other" type — flag for free-form label at upload time
  { name: "Other", isRequired: false, isOther: true, sortOrder: 990, hasExpiry: false, expiryMonths: null, description: "Free-form label supplied by coach at upload." },
];

// Allowed upload types — scanned documents / IDs. PDF, JPG, PNG only.
export const ALLOWED_DOCUMENT_MIMES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const DOCUMENT_LABEL_MAX = 60; // free label for "Other"
export const DOCUMENT_NOTES_MAX = 500;
export const DOCUMENT_FILENAME_MAX = 191;

/**
 * Magic-byte sniffing so a renamed .txt can't pass as a document.
 * Returns "pdf" | "jpg" | "png" | null for the detected signature.
 */
export function detectDocumentKind(buf) {
  if (!buf || buf.length < 8) return null;
  // PDF: %PDF-
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf";
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return "png";
  return null;
}

/**
 * Sanitizes an original filename: strips path components and control chars,
 * keeps a printable base name with extension.
 */
export function cleanFileName(raw) {
  if (typeof raw !== "string") return "";
  const base = raw
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .trim();
  return base.slice(0, DOCUMENT_FILENAME_MAX);
}