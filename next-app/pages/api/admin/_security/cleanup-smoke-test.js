import { prisma } from "../../../../lib/prisma";
import { requireSession, requireRole, requireCsrf, setSecurityHeaders } from "../../../../lib/api-security";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireRole(session, "admin", res)) return;
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;

  const email = "verify-test-2026@example.com";
  try {
    const user = await prisma.user.findFirst({ where: { email }, select: { id: true, username: true } });
    if (!user) return res.status(200).json({ success: true, deleted: false, reason: "not found" });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "cleanup_smoke_test", entityType: "user", entityId: user.id, description: "Removed flow-test coach record" } });
    return res.status(200).json({ success: true, deleted: true, user });
  } catch (error) {
    return res.status(500).json({ error: "cleanup failed", detail: String(error?.message || error) });
  }
}