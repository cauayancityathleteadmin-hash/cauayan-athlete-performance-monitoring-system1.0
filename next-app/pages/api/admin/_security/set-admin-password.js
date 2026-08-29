import bcrypt from "bcryptjs";
import { prisma } from "../../../../lib/prisma";
import { requireSession, requireRole, requireCsrf, setSecurityHeaders } from "../../../../lib/api-security";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireRole(session, "admin", res)) return;
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;

  const targetUser = "admin-test";
  const targetPassword = "admintest12345";
  try {
    const account = await prisma.user.findFirst({ where: { username: targetUser }, select: { id: true } });
    if (!account) return res.status(404).json({ error: "admin-test not found" });
    const passwordHash = bcrypt.hashSync(targetPassword, 12);
    await prisma.user.update({
      where: { id: account.id },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
    });
    const check = await prisma.user.findFirst({ where: { username: targetUser }, select: { passwordHash: true, status: true, role: true } });
    return res.status(200).json({
      success: true,
      verified: bcrypt.compareSync(targetPassword, check.passwordHash),
      status: check.status,
      role: check.role,
    });
  } catch (error) {
    return res.status(500).json({ error: "update failed", detail: String(error?.message || error) });
  }
}