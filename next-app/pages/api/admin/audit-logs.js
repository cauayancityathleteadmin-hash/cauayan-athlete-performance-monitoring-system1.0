import { prisma } from "../../../lib/prisma";
import { requireRole, requireSession } from "../../../lib/api-security";

export default async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session || !requireRole(session, "admin", res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  try {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit, include: { user: { select: { email: true, role: true } } } }),
      prisma.auditLog.count(),
    ]);
    const safeLogs = logs.map((log) => ({ ...log, id: log.id.toString() }));
    return res.status(200).json({ logs: safeLogs, total: Number(total), page, limit });
  } catch (error) {
    console.error("Audit logs error:", error);
    return res.status(500).json({ error: "Could not load audit logs." });
  }
}
