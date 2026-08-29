import { prisma } from "../../../../lib/prisma";
import { requireSession, requireRole, requireCsrf, setSecurityHeaders } from "../../../../lib/api-security";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireRole(session, "admin", res)) return;
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;

  const usernames = ["coach-001", "coach-002", "coach-003"];
  try {
    const updated = [];
    for (const username of usernames) {
      const user = await prisma.user.findFirst({ where: { username }, select: { id: true, status: true } });
      if (!user) { updated.push({ username, ok: false, reason: "not found" }); continue; }
      await prisma.user.update({ where: { id: user.id }, data: { status: "active" } });
      const coach = await prisma.coach.findFirst({ where: { userId: user.id }, select: { id: true } });
      if (coach) await prisma.coach.update({ where: { id: coach.id }, data: { status: "active" } });
      updated.push({ username, ok: true, userId: user.id });
    }
    return res.status(200).json({ success: true, updated });
  } catch (error) {
    return res.status(500).json({ error: "reactivate failed", detail: String(error?.message || error) });
  }
}