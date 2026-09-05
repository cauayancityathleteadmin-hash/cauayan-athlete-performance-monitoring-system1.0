import { prisma } from "../../../lib/prisma";
import { requireRole, requireSession, setSecurityHeaders, text, validId } from "../../../lib/api-security";

const ACTIONS = [
  "login",
  "login_failed",
  "logout",
  "create",
  "update",
  "delete",
  "backup",
  "restore",
  "bulk_assess",
  "update_photo",
  "update_notification_prefs",
  "test_notification",
  "password_change",
  "register",
  "approve",
  "reject",
  "seed",
];

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session || !requireRole(session, "admin", res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  const where = {};
  const action = text(req.query.action, 100);
  if (action && ACTIONS.includes(action)) where.action = action;

  const entityType = text(req.query.entityType, 100);
  if (entityType) where.entityType = { contains: entityType, mode: "insensitive" };

  const actorEmail = text(req.query.actor, 191);
  if (actorEmail) where.user = { email: { contains: actorEmail, mode: "insensitive" } };

  const role = text(req.query.role, 50);
  if (role) where.user = { ...(where.user || {}), role };

  const q = text(req.query.q, 191);
  if (q) where.description = { contains: q, mode: "insensitive" };

  const from = new Date(String(req.query.from || ""));
  if (!isNaN(from.getTime())) where.createdAt = { ...(where.createdAt || {}), gte: from };
  const to = new Date(String(req.query.to || ""));
  if (!isNaN(to.getTime())) where.createdAt = { ...(where.createdAt || {}), lte: to };

  const fromId = validId(req.query.afterId);
  if (fromId) where.id = { gt: BigInt(fromId) };

  try {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * limit, take: limit, include: { user: { select: { email: true, role: true } } } }),
      prisma.auditLog.count({ where }),
    ]);
    const safeLogs = logs.map((log) => ({ ...log, id: log.id.toString() }));
    return res.status(200).json({ logs: safeLogs, total: Number(total), page, limit, actions: ACTIONS });
  } catch (error) {
    console.error("Audit logs error:", error);
    return res.status(500).json({ error: "Could not load audit logs." });
  }
}