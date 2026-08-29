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

  const rows = [["coach-001", "CoachTest2026A"], ["coach-002", "CoachTest2026B"], ["coach-003", "CoachTest2026C"]];
  const out = [];
  for (const [username, password] of rows) {
    const hash = bcrypt.hashSync(password, 12);
    const user = await prisma.user.findFirst({ where: { username }, select: { id: true } });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
    const ok = bcrypt.compareSync(password, (await prisma.user.findFirst({ where: { username }, select: { passwordHash: true } })).passwordHash);
    out.push({ username, set: true, verified: ok });
  }
  return res.status(200).json({ success: true, out });
}