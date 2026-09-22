import { prisma } from "../../../../../lib/prisma";
import { requireCsrf, requireSession, setSecurityHeaders, validId } from "../../../../../lib/api-security";
import { canManageAthleteDocuments } from "../../../../../lib/document-access";

// GET  /api/athletes/[id]/documents/[documentId]?inline=1
// DELETE /api/athletes/[id]/documents/[documentId]
// The ONLY endpoint that ever returns file bytes. Requires a valid session
// and ownership (own coach or admin). Default = download (attachment);
// ?inline=1 = print view (native PDF viewer / image view in a new tab).
export default async function handler(req, res) {
  setSecurityHeaders(res);

  const session = await requireSession(req, res);
  if (!session) return;

  const athleteId = validId(req.query.id);
  const documentId = validId(req.query.documentId);
  if (!athleteId || !documentId) {
    return res.status(400).json({ error: "A valid athlete id and document id are required." });
  }

  const ok = await canManageAthleteDocuments(session, athleteId);
  if (!ok) return res.status(403).json({ error: "You do not have permission to manage this document." });

  if (req.method === "DELETE") {
    if (!requireCsrf(req, res)) return;
    const existing = await prisma.athleteDocument.findFirst({
      where: { id: documentId, athleteId },
      select: { id: true, fileName: true },
    });
    if (!existing) return res.status(404).json({ error: "Document not found." });

    try {
      await prisma.athleteDocument.delete({ where: { id: documentId } });
      await prisma.auditLog.create({
        data: {
          userId: Number(session.user.id),
          action: "document_delete",
          entityType: "athlete_document",
          entityId: documentId,
          description: `Deleted document #${documentId} (${existing.fileName}) for athlete #${athleteId}.`,
        },
      });
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("Document delete failed", error);
      return res.status(500).json({ error: "The document could not be deleted.", detail: String((error && error.message) || error) });
    }
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const doc = await prisma.athleteDocument.findFirst({
    where: { id: documentId, athleteId },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, data: true },
  });
  if (!doc) return res.status(404).json({ error: "Document not found." });

  const ascii = doc.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "document";
  const utf8name = encodeURIComponent(doc.fileName).replace(/'/g, "%27");
  const inline = req.query.inline === "1";

  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("Content-Length", String(doc.sizeBytes));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${utf8name}`
  );
  res.end(doc.data);
}