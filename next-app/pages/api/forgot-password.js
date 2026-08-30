import crypto from "crypto";
import { prisma } from "../../lib/prisma";
import { requireCsrf, setSecurityHeaders, validateEmail } from "../../lib/api-security";
import { rateLimiters } from "../../lib/rate-limit";
import { checkRateLimitDb } from "../../lib/rate-limit-db";
import { sendPasswordResetLink } from "../../lib/email";
import { appBaseUrl } from "../../lib/app-url";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  setSecurityHeaders(res);
  if (!requireCsrf(req, res)) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (!rateLimiters.passwordReset(`forgot:${ip}`).allowed) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }
  const dbRate = await checkRateLimitDb({ scope: "forgot", key: `forgot:${ip}`, limit: 5, windowMs: 60 * 60 * 1000 });
  if (!dbRate.allowed) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const email = validateEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { coach: true },
  });

  if (user && user.status !== "inactive") {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      }),
    ]);

    const resetUrl = `${appBaseUrl()}/reset-password?token=${token}`;
    const name = user.coach ? `${user.coach.firstName} ${user.coach.lastName}`.trim() : user.username;
    try {
      await sendPasswordResetLink({ email, name, resetUrl });
    } catch (error) {
      console.error("Password reset email failed", error);
    }
  }

  return res.status(200).json({ success: true, message: "If that email belongs to an account, a password reset link has been sent." });
}
