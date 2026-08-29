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

  const out = [];
  for (const [username, candidate] of [["coach-001", "CoachTest2026A"], ["coach-002", "CoachTest2026B"], ["coach-003", "CoachTest2026C"]]) {
    const user = await prisma.user.findFirst({ where: { username }, include: { coach: true } });
    if (!user) { out.push({ username, missing: true }); continue; }
    out.push({
      username,
      userId: user.id,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      role: user.role,
      coachStatus: user.coach?.status ?? null,
      coachCode: user.coach?.coachCode ?? null,
      hashMatchesCandidate: bcrypt.compareSync(candidate, user.passwordHash),
      hashPrefix: user.passwordHash.slice(0, 7),
    });
  }
  return res.status(200).json({ success: true, rows: out });
}