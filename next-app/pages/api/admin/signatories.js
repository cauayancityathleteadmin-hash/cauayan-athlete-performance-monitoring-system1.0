import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, setSecurityHeaders, validId } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { DISPLAY_MODE_KEYS, REPORT_TYPE_KEYS, ROLE_KEYS } from "../../../lib/signatory-options";

const MAX_NAME = 150;
const MAX_POSITION = 150;
const MAX_OFFICE = 150;

function parseDate(value) {
  if (value === "" || value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// Keeps the raw (trimmed) value so validation can report an over-length field
// instead of silently blanking it.
function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(body, existing) {
  const base = existing || {
    reportType: "",
    role: "",
    printedName: "",
    position: "",
    office: null,
    displayMode: "name_position_line",
    displayOrder: 0,
    effectiveFrom: null,
    effectiveTo: null,
    status: "active",
    userId: null,
  };
  const pick = (field, value) => (value === undefined ? base[field] : value);

  const printedName = pick("printedName", body?.printedName === undefined ? undefined : trimmed(body.printedName));
  const position = pick("position", body?.position === undefined ? undefined : trimmed(body.position));
  const office = pick("office", body?.office === undefined ? undefined : trimmed(body.office) || null);

  return {
    reportType: pick("reportType", body?.reportType),
    role: pick("role", body?.role),
    printedName: typeof printedName === "string" ? printedName : "",
    position: typeof position === "string" ? position : "",
    office,
    displayMode: pick("displayMode", body?.displayMode),
    displayOrder: body?.displayOrder === undefined ? base.displayOrder : Number(body.displayOrder),
    effectiveFrom: body?.effectiveFrom === undefined ? base.effectiveFrom : parseDate(body.effectiveFrom),
    effectiveTo: body?.effectiveTo === undefined ? base.effectiveTo : parseDate(body.effectiveTo),
    status: pick("status", body?.status),
    userId: body?.userId === undefined ? base.userId : (validId(body.userId) || null),
  };
}

function validate(row) {
  if (!REPORT_TYPE_KEYS.includes(row.reportType)) return "Choose a valid report type.";
  if (!ROLE_KEYS.includes(row.role)) return "Choose a valid signature role.";
  if (!DISPLAY_MODE_KEYS.includes(row.displayMode)) return "Choose a valid display mode.";
  if (!["active", "inactive"].includes(row.status)) return "Status must be active or inactive.";
  if (!Number.isInteger(row.displayOrder) || row.displayOrder < 0 || row.displayOrder > 999) {
    return "Display order must be a whole number from 0 to 999.";
  }
  if (row.printedName.length > MAX_NAME) return `Printed name must be ${MAX_NAME} characters or fewer.`;
  if (row.position.length > MAX_POSITION) return `Position must be ${MAX_POSITION} characters or fewer.`;
  if ((row.office || "").length > MAX_OFFICE) return `Office must be ${MAX_OFFICE} characters or fewer.`;
  if (row.effectiveFrom === undefined || row.effectiveTo === undefined) return "Effective dates must be valid dates.";
  if (row.effectiveFrom && row.effectiveTo && row.effectiveFrom > row.effectiveTo) {
    return "The effective-from date cannot be after the effective-to date.";
  }
  const needsName = row.displayMode !== "line_only" && row.displayMode !== "designation_only";
  if (needsName && !row.printedName) return "Printed name is required for this display mode.";
  if (row.displayMode !== "line_only" && !row.position) return "Position or designation is required.";
  return null;
}

async function audit(session, action, id, description) {
  await prisma.auditLog.create({
    data: { userId: Number(session.user.id), action, entityType: "signatory", entityId: id, description },
  });
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireRole(session, "admin", res)) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`admin-signatories:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method === "GET") {
    const rows = await prisma.signatory.findMany({
      orderBy: [{ reportType: "asc" }, { displayOrder: "asc" }, { id: "asc" }],
    });
    return res.status(200).json({ signatories: rows });
  }

  if (req.method === "POST") {
    if (!requireCsrf(req, res)) return;
    const row = normalize(req.body, null);
    const invalid = validate(row);
    if (invalid) return res.status(400).json({ error: invalid });
    if (row.userId) {
      const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { id: true } });
      if (!user) return res.status(400).json({ error: "The linked user does not exist." });
    }
    const created = await prisma.signatory.create({
      data: { ...row, createdBy: Number(session.user.id) },
    });
    await audit(session, "create", created.id, `Added ${created.role} signatory for ${created.reportType}.`);
    return res.status(201).json(created);
  }

  if (req.method === "PUT") {
    if (!requireCsrf(req, res)) return;
    const id = validId(req.body?.id);
    if (!id) return res.status(400).json({ error: "A signatory id is required." });
    const existing = await prisma.signatory.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Signatory not found." });
    const row = normalize(req.body, existing);
    const invalid = validate(row);
    if (invalid) return res.status(400).json({ error: invalid });
    if (row.userId) {
      const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { id: true } });
      if (!user) return res.status(400).json({ error: "The linked user does not exist." });
    }
    const updated = await prisma.signatory.update({ where: { id }, data: row });
    await audit(session, "update", id, `Updated ${updated.role} signatory for ${updated.reportType}.`);
    return res.status(200).json(updated);
  }

  if (req.method === "DELETE") {
    if (!requireCsrf(req, res)) return;
    const id = validId(req.body?.id);
    if (!id) return res.status(400).json({ error: "A signatory id is required." });
    try {
      const updated = await prisma.signatory.update({ where: { id }, data: { status: "inactive" } });
      await audit(session, "deactivate", id, `Deactivated ${updated.role} signatory for ${updated.reportType}.`);
      return res.status(200).json({ success: true });
    } catch (error) {
      if (error.code === "P2025") return res.status(404).json({ error: "Signatory not found." });
      throw error;
    }
  }

  return res.status(405).json({ error: "Method not allowed." });
}
