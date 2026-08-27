import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth/next";
import { prisma } from "../../../lib/prisma";
import { authOptions } from "../auth/[...nextauth]";
import { requireCsrf } from "../../../lib/api-security";
import { checkPasswordStrength } from "../../../lib/password";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireCsrf(req, res)) return;
  const origin = req.headers.origin;
  const expectedOrigin = `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
  if (origin && origin !== expectedOrigin) return res.status(403).json({ error: "Request origin rejected." });
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: "Authentication required" });
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 200) return res.status(400).json({ error: "New password must be 12 to 200 characters." });

  const passwordStrength = checkPasswordStrength(newPassword);
  if (!passwordStrength.isValid) {
    return res.status(400).json({ error: "New password is too weak. Must meet at least 3 requirements: 12+ chars, uppercase, lowercase, number, special character." });
  }

  const user = await prisma.user.findUnique({ where: { id: Number(session.user.id) } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash.replace(/^\$2y\$/, "$2b$")))) return res.status(400).json({ error: "Current password is incorrect." });
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12), mustChangePassword: false, passwordChangedAt: new Date() } });
  return res.status(200).json({ ok: true });
}