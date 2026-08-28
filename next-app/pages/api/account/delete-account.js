import { prisma } from "../../../lib/prisma";
import { requireSession, requireCsrf, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import bcrypt from "bcryptjs";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.passwordReset(`password_reset:${ip}:${session.user.id}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (!requireCsrf(req, res)) return;

  const { password, confirm } = req.body || {};
  const userId = Number(session.user.id);

  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "Password is required to confirm account deletion." });
  }
  if (confirm !== "DELETE") {
    return res.status(400).json({ error: 'Type "DELETE" to confirm account deletion.' });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, role: true },
  });

  if (!user) return res.status(404).json({ error: "User not found." });

  function normalizeHash(hash) {
    return hash?.replace(/^\$2y\$/, "$2b$");
  }

  const valid = await bcrypt.compare(password, normalizeHash(user.passwordHash));
  if (!valid) return res.status(401).json({ error: "Incorrect password." });

  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        userId,
        action: "delete_account",
        entityType: "user",
        entityId: userId,
        description: `Account deleted: ${user.email}`,
      },
    }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  return res.status(200).json({ success: true, message: "Account deleted successfully." });
}