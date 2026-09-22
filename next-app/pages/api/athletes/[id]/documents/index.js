import { prisma } from "../../../../../lib/prisma";
import { requireCsrf, requireSession, setSecurityHeaders, validId } from "../../../../../lib/api-security";
import { rateLimiters } from "../../../../../lib/rate-limit";
import { canManageAthleteDocuments } from "../../../../../lib/document-access";
import {
  ALLOWED_DOCUMENT_MIMES,
  MAX_DOCUMENT_BYTES,
  DOCUMENT_LABEL_MAX,
  DOCUMENT_NOTES_MAX,
  detectDocumentKind,
  cleanFileName,
} from "../../../../../lib/document-types";

export const config = { api: { bodyParser: { sizeLimit: "14mb" } } };

// Metadata projection for every response — file bytes (`data`) are ONLY ever
// served by the download/print endpoint, never by list/refresh payloads.
const DOC_SELECT = {
  id: true,
  documentTypeId: true,
  customLabel: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  notes: true,
  expiresAt: true,
  uploadedBy: true,
  createdAt: true,
  updatedAt: true,
  documentType: { select: { id: true, name: true, isRequired: true, isOther: true } },
  uploader: { select: { username: true, email: true } },
};

async function authorizeAthlete(req, res, session, athleteId) {
  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { id: true } });
  if (!athlete) {
    res.status(404).json({ error: "Athlete not found." });
    return null;
  }
  const ok = await canManageAthleteDocuments(session, athleteId);
  if (!ok) {
    res.status(403).json({ error: "You do not have permission to manage this athlete's documents." });
    return null;
  }
  return athlete;
}

function parseOptionalDate(value) {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  return isNaN(d) ? { ok: false } : { ok: true, value: d };
}

function cleanNotes(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v.slice(0, DOCUMENT_NOTES_MAX) : null;
}

function cleanCustomLabel(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v.slice(0, DOCUMENT_LABEL_MAX) : null;
}

// Validates an uploaded file payload; returns { error } or { buf, mime, ext, fileName }.
function validateFilePayload({ base64, mime, fileName }, fallbackExt) {
  if (typeof base64 !== "string" || !base64) return { error: "Attach the document file." };
  if (!ALLOWED_DOCUMENT_MIMES[mime]) return { error: "Attach a valid PDF, JPG, or PNG file." };
  const buf = Buffer.from(base64, "base64");
  if (!buf.length) return { error: "The document file is empty." };
  if (buf.length > MAX_DOCUMENT_BYTES) return { error: "The document is larger than the 10 MB limit." };
  const ext = ALLOWED_DOCUMENT_MIMES[mime];
  if (detectDocumentKind(buf) !== ext) return { error: "The file content does not match its declared type." };
  const clean = cleanFileName(fileName);
  return { buf, mime, ext, fileName: clean || `document.${fallbackExt || ext}` };
}

async function fetchActiveType(documentTypeId) {
  if (!validId(documentTypeId)) return null;
  return prisma.documentType.findFirst({ where: { id: documentTypeId, status: "active" } });
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST" && req.method !== "PUT" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed." });
  }
  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireCsrf(req, res)) return;

  const athleteId = validId(req.query.id);
  if (!athleteId) return res.status(400).json({ error: "A valid athlete id is required." });
  const athlete = await authorizeAthlete(req, res, session, athleteId);
  if (!athlete) return;

  if (req.method === "POST") {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
    const rate = rateLimiters.api(`documents:${ip}`);
    if (!rate.allowed) return res.status(429).json({ error: "Too many uploads. Please try again later." });

    const documentType = await fetchActiveType(req.body && req.body.documentTypeId);
    if (!documentType) return res.status(400).json({ error: "Select a valid document type." });

    const customLabel = cleanCustomLabel(req.body && req.body.customLabel);
    if (documentType.isOther && !customLabel) {
      return res.status(400).json({ error: "Enter a label for this Other document." });
    }
    const label = documentType.isOther ? customLabel : null;

    const file = validateFilePayload(req.body || {}, "pdf");
    if (file.error) return res.status(400).json({ error: file.error });

    const expiry = parseOptionalDate(req.body && req.body.expiresAt);
    if (!expiry.ok) return res.status(400).json({ error: "The expiry date is invalid." });

    try {
      const doc = await prisma.athleteDocument.create({
        data: {
          athleteId,
          documentTypeId: documentType.id,
          customLabel: label,
          fileName: file.fileName,
          mimeType: file.mime,
          sizeBytes: file.buf.length,
          data: file.buf,
          notes: cleanNotes(req.body && req.body.notes),
          expiresAt: expiry.value,
          uploadedBy: Number(session.user.id),
        },
        select: DOC_SELECT,
      });
      await prisma.auditLog.create({
        data: {
          userId: Number(session.user.id),
          action: "document_upload",
          entityType: "athlete_document",
          entityId: doc.id,
          description: `Uploaded ${doc.fileName} (${documentType.name}) for athlete #${athleteId}.`,
        },
      });
      return res.status(200).json({ ok: true, document: doc });
    } catch (error) {
      console.error("Document upload failed", error);
      return res.status(500).json({ error: "The document could not be saved.", detail: String((error && error.message) || error) });
    }
  }

  if (req.method === "PUT") {
    const id = validId(req.body && req.body.id);
    if (!id) return res.status(400).json({ error: "A valid document id is required." });
    const existing = await prisma.athleteDocument.findFirst({
      where: { id, athleteId },
      select: { id: true, fileName: true, documentTypeId: true, documentType: { select: { isOther: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Document not found." });

    const updateData = {};
    let targetType = existing.documentType;
    if (req.body && req.body.documentTypeId !== undefined && Number(req.body.documentTypeId) !== existing.documentTypeId) {
      const documentType = await fetchActiveType(req.body.documentTypeId);
      if (!documentType) return res.status(400).json({ error: "Select a valid document type." });
      targetType = documentType;
      updateData.documentTypeId = documentType.id;
    }
    // "Other" documents carry a free label; anything else clears it.
    const customLabel = cleanCustomLabel(req.body && req.body.customLabel);
    if (targetType.isOther && !customLabel) {
      return res.status(400).json({ error: "Enter a label for this Other document." });
    }
    updateData.customLabel = targetType.isOther ? customLabel : null;

    const notes = cleanNotes(req.body && req.body.notes);
    if (notes !== null || (req.body && req.body.notes !== undefined)) updateData.notes = notes;

    const expiry = parseOptionalDate(req.body && req.body.expiresAt);
    if (!expiry.ok) return res.status(400).json({ error: "The expiry date is invalid." });
    updateData.expiresAt = expiry.value;

    // Optional file replacement.
    if (req.body && req.body.base64) {
      const file = validateFilePayload(req.body, "pdf");
      if (file.error) return res.status(400).json({ error: file.error });
      updateData.fileName = file.fileName;
      updateData.mimeType = file.mime;
      updateData.sizeBytes = file.buf.length;
      updateData.data = file.buf;
    }

    try {
      const doc = await prisma.athleteDocument.update({
        where: { id },
        data: updateData,
        select: DOC_SELECT,
      });
      await prisma.auditLog.create({
        data: {
          userId: Number(session.user.id),
          action: "document_update",
          entityType: "athlete_document",
          entityId: id,
          description: `Updated document #${id} for athlete #${athleteId}.`,
        },
      });
      return res.status(200).json({ ok: true, document: doc });
    } catch (error) {
      console.error("Document update failed", error);
      return res.status(500).json({ error: "The document could not be updated.", detail: String((error && error.message) || error) });
    }
  }

  return res.status(405).json({ error: "Method not allowed." });
}