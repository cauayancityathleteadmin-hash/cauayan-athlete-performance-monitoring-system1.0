import { prisma } from "../../lib/prisma";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const url = process.env.DATABASE_URL || "";
  let host = null;
  let database = null;
  const m = url.match(/@([^/]+)\/([^?]+)/);
  if (m) {
    host = m[1];
    database = m[2];
  }
  let johng = false;
  let users = 0;
  let coaches = 0;
  try {
    johng = !!(await prisma.user.findFirst({ where: { email: "johngd004@gmail.com" }, select: { id: true } }));
    users = await prisma.user.count();
    coaches = await prisma.coach.count();
  } catch (e) {
    return res.status(500).json({ host, database, error: String(e.message || e) });
  }
  return res.status(200).json({ host, database, users, coaches, hasJohngd004: johng });
}