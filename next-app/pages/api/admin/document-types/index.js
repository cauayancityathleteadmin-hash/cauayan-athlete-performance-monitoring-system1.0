import { prisma } from "../../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, setSecurityHeaders, text, validId } from "../../../../lib/api-security";

// Admin-only management of the document-type catalog (Phase 1 editable list).
// GET  -> list (all statuses, ordered) with real usage counts
// POST -> create a type
// PUT  -> rename / reorder / required / other flag / activate or deactivate
export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed." });
  }
  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireRole(session, "admin", res)) return;
  if (req.method !== "GET" && !requireCsrf(req, res)) return;

  if (req.method === "GET") {
    const types = await prisma.documentType.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { documents: true } } },
    });
    return res.status(200).json({ types: JSON.parse(JSON.stringify(types)) });
  }

  if (req.method === "POST") {
    const name = text(req.body && req.body.name, 100, true);
    if (!name) return res.status(400).json({ error: "A type name is required." });
    const sortOrder = Number(req.body && req.body.sortOrder);
    const isRequired = req.body && req.body.isRequired ? true : false;
    const isOther = req.body && req.body.isOther ? true : false;
    try {
      const type = await prisma.documentType.create({
        data: { name, isRequired, isOther, sortOrder: Number.isSafeInteger(sortOrder) ? sortOrder : 0 },
        include: { _count: { select: { documents: true } } },
      });
      await prisma.auditLog.create({
        data: { userId: Number(session.user.id), action: "document_type_create", entityType: "documentType", entityId: type.id, description: `Added document type "${name}".` },
      });
      return res.status(200).json({ ok: true, type: JSON.parse(JSON.stringify(type)) });
    } catch (error) {
      if (error && error.code === "P2002") return res.status(400).json({ error: "A document type with that name already exists." });
      console.error("Document type create failed", error);
      return res.status(500).json({ error: "The document type could not be added.", detail: String((error && error.message) || error) });
    }
  }

  if (req.method === "PUT") {
    const id = validId(req.body && req.body.id);
    if (!id) return res.status(400).json({ error: "A valid document type id is required." });
    const existing = await prisma.documentType.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Document type not found." });

    const data = {};
    const name = text(req.body && req.body.name, 100);
    if (req.body && req.body.name !== undefined && req.body.name !== null && req.body.name !== "") {
      if (!name) return res.status(400).json({ error: "The type name is too long or invalid." });
      data.name = name;
    }
    if (req.body && req.body.isRequired !== undefined) data.isRequired = req.body.isRequired ? true : false;
    if (req.body && req.body.isOther !== undefined) data.isOther = req.body.isOther ? true : false;
    if (req.body && req.body.sortOrder !== undefined) {
      const sortOrder = Number(req.body.sortOrder);
      if (!Number.isSafeInteger(sortOrder)) return res.status(400).json({ error: "The sort order must be a whole number." });
      data.sortOrder = sortOrder;
    }
    if (req.body && req.body.status !== undefined) {
      if (req.body.status !== "active" && req.body.status !== "inactive") {
        return res.status(400).json({ error: "Status must be active or inactive." });
      }
      data.status = req.body.status;
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Nothing to update." });

    try {
      const type = await prisma.documentType.update({
        where: { id },
        data,
        include: { _count: { select: { documents: true } } },
      });
      await prisma.auditLog.create({
        data: { userId: Number(session.user.id), action: "document_type_update", entityType: "documentType", entityId: id, description: `Updated document type #${id}.` },
      });
      return res.status(200).json({ ok: true, type: JSON.parse(JSON.stringify(type)) });
    } catch (error) {
      if (error && error.code === "P2002") return res.status(400).json({ error: "A document type with that name already exists." });
      console.error("Document type update failed", error);
      return res.status(500).json({ error: "The document type could not be updated.", detail: String((error && error.message) || error) });
    }
  }

  return res.status(405).json({ error: "Method not allowed." });
}