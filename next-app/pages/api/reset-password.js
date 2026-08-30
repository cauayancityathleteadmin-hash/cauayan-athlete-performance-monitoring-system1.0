import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { requireCsrf, setSecurityHeaders } from "../../lib/api-security";
import { checkPasswordStrength } from "../../lib/password";
import { rateLimiters } from "../../lib/rate-limit";
import { checkRateLimitDb } from "../../lib/rate-limit-db";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  setSecurityHeaders(res);
  if (!requireCsrf(req, res)) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (!rateLimiters.passwordReset(`reset:${ip}`).allowed) {
    return res.status(429).json({ error: "Too many attempts. Please try again later." });
  }
  const dbRate = await checkRateLimitDb({ scope: "reset", key: `reset:${ip}`, limit: 5, windowMs: 60 * 60 * 1000 });
  if (!dbRate.allowed) {
    return res.status(429).json({ error: "Too many attempts. Please try again later." });
  }

  const token = String(req.body?.token || "");
  const password = String(req.body?.password || "");
  if (!token || password.length < 12 || password.length > 200) {
    return res.status(400).json({ error: "Provide the reset link and a valid password." });
  }

  const strength = checkPasswordStrength(password);
  if (!strength.isValid) {
    return res.status(400).json({ error: "Password is too weak. Must meet at least 3 requirements: 12+ chars, uppercase, lowercase, number, special character." });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
  }
  if (record.user.status === "inactive") {
    return res.status(400).json({ error: "This account is not active. Please contact an administrator." });
  }

  const newHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: record.user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "password_reset",
        entityType: "user",
        entityId: record.user.id,
        description: "Password reset via self-service reset link",
      },
    }),
  ]);

  return res.status(200).json({ success: true, message: "Your password has been reset. You can now sign in." });
}
