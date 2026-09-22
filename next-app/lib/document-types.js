/* ============================================================================
   ATHLETE DOCUMENT TYPES — single source of truth for the starter catalog.

   Admins can add / edit / reorder / deactivate types on the fly via
   Admin -> Document types; the rows below are the DEFAULT seed (idempotent
   upserts in prisma/seed.js and the one-off live seed). "Other" is a flag on
   a type (coach supplies a custom label at upload time), not a special row.
   ========================================================================== */

export const DOCUMENT_TYPE_SEED = [
  { name: "PSA Birth Certificate", isRequired: true, isOther: false, sortOrder: 10 },
  { name: "School ID", isRequired: true, isOther: false, sortOrder: 20 },
  { name: "Form 137 (Permanent Record)", isRequired: true, isOther: false, sortOrder: 30 },
  { name: "Form 138 (Report Card)", isRequired: true, isOther: false, sortOrder: 40 },
  { name: "Medical Certificate", isRequired: false, isOther: false, sortOrder: 50 },
  { name: "Parent/Guardian Consent Form", isRequired: false, isOther: false, sortOrder: 60 },
  { name: "Barangay Certificate", isRequired: false, isOther: false, sortOrder: 70 },
  { name: "Other", isRequired: false, isOther: true, sortOrder: 90 },
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