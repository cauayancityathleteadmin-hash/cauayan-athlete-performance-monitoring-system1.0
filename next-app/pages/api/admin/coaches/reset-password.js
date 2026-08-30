import bcrypt from "bcryptjs";
import { prisma } from "../../../../lib/prisma";
import { requireSession, requireRole, requireCsrf, setSecurityHeaders } from "../../../../lib/api-security";
import { rateLimiters } from "../../../../lib/rate-limit";
import { sendCoachPasswordResetEmail } from "../../../../lib/email";

// Default but strong password: configurable via env so it can be rotated without a deploy.
function getDefaultPassword() {
  return process.env.DEFAULT_RESET_PASSWORD || "Cauayan!City2026@Isabela";
}

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
  // Trim to a sensible batch limit to protect against abuse.
  ids = [...new Set(ids)].slice(0, 100);

  if (!ids.length) {
    return res.status(400).json({ error: "Select at least one coach to reset." });
  }

  const defaultPassword = getDefaultPassword();
  const passwordHash = await bcrypt.hash(defaultPassword, 12);

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
      // Only reset active coaches; do not email pending/rejected/inactive accounts.
      if (!coach.user || coach.user.status !== "active") {
        skipped += 1;
        results.push({ coachId: coach.id, status: "skipped", reason: "Account is not active." });
        continue;
      }

      await prisma.user.update({
        where: { id: coach.userId },
        data: { passwordHash, mustChangePassword: true, passwordChangedAt: null },
      });

      updated += 1;
      const ok = await sendCoachPasswordResetEmail({
        email: coach.user.email,
        name: `${coach.firstName} ${coach.lastName}`,
        coachCode: coach.coachCode,
        temporaryPassword: defaultPassword,
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
        description: `Reset password for ${updated} coach account(s) to the default.`,
      },
    });

    return res.status(200).json({
      success: true,
      updated,
      emailed,
      skipped,
      results,
      message: `Reset ${updated} coach account(s). Password change required on next login.`,
    });
  } catch (error) {
    console.error("Coach password reset error:", error);
    return res.status(500).json({ error: "Could not reset the coach password(s)." });
  }
}
