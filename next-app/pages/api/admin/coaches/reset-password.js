import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../../../lib/prisma";
import { requireSession, requireRole, requireCsrf, setSecurityHeaders } from "../../../../lib/api-security";
import { rateLimiters } from "../../../../lib/rate-limit";
import { sendPasswordResetLink } from "../../../../lib/email";
import { appBaseUrl } from "../../../../lib/app-url";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).end();

  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (!requireRole(session, "admin", res)) return;
  if (!requireCsrf(req, res)) return;

  // Accept a single coachId (backward compatible) OR a coachIds array (group reset).
  const { coachId, coachIds } = req.body;
  let ids = [];
  if (Array.isArray(coachIds)) {
    ids = coachIds.filter((id) => Number.isInteger(id) && id > 0);
  } else if (typeof coachId === "number" && coachId > 0) {
    ids = [coachId];
  }
  ids = [...new Set(ids)].slice(0, 100);

  if (!ids.length) {
    return res.status(400).json({ error: "Select at least one coach to reset." });
  }

  try {
    const coaches = await prisma.coach.findMany({
      where: { id: { in: ids } },
      include: { user: true },
    });

    const results = [];
    let updated = 0;
    let emailed = 0;
    let skipped = 0;

    for (const coach of coaches) {
      if (!coach.user || coach.user.status !== "active") {
        skipped += 1;
        results.push({ coachId: coach.id, status: "skipped", reason: "Account is not active." });
        continue;
      }

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      // Invalidate prior unused tokens and create a fresh one.
      await prisma.$transaction([
        prisma.passwordResetToken.updateMany({
          where: { userId: coach.userId, usedAt: null },
          data: { usedAt: new Date() },
        }),
        prisma.passwordResetToken.create({
          data: { userId: coach.userId, tokenHash, expiresAt },
        }),
      ]);

      updated += 1;
      const resetUrl = `${appBaseUrl()}/reset-password?token=${token}`;
      const ok = await sendPasswordResetLink({
        email: coach.user.email,
        name: `${coach.firstName} ${coach.lastName}`,
        resetUrl,
      });
      if (ok) emailed += 1;
      results.push({ coachId: coach.id, status: ok ? "reset" : "reset_email_failed", email: coach.user.email });
    }

    await prisma.auditLog.create({
      data: {
        userId: Number(session.user.id),
        action: "coach_password_reset",
        entityType: "coach",
        entityId: ids[0],
        description: `Sent password reset links to ${updated} coach account(s).`,
      },
    });

    return res.status(200).json({
      success: true,
      updated,
      emailed,
      skipped,
      results,
      message: `Sent ${emailed} password reset link(s). Coaches can set a new password from the link.`,
    });
  } catch (error) {
    console.error("Coach password reset error:", error);
    return res.status(500).json({ error: "Could not reset the coach password(s)." });
  }
}
