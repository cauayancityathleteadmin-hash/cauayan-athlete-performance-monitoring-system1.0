import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../../../lib/prisma";
import { requireSession, requireRole, requireCsrf, setSecurityHeaders } from "../../../../lib/api-security";
import { rateLimiters } from "../../../../lib/rate-limit";
import { sendCoachPasswordResetEmail } from "../../../../lib/email";

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let password = "";
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(crypto.randomInt(chars.length));
  }
  return password;
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

  const { coachId } = req.body;
  if (!coachId || typeof coachId !== "number" || coachId <= 0) {
    return res.status(400).json({ error: "Invalid coach ID" });
  }

  try {
    const coach = await prisma.coach.findUnique({
      where: { id: coachId },
      include: { user: true },
    });

    if (!coach) {
      return res.status(404).json({ error: "Coach not found" });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: coach.userId },
        data: { passwordHash, mustChangePassword: true, passwordChangedAt: null },
      }),
      prisma.auditLog.create({
        data: {
          userId: Number(session.user.id),
          action: "coach_password_reset",
          entityType: "coach",
          entityId: coachId,
          description: `Reset password for coach ${coach.coachCode}`,
        },
      }),
    ]);

    const emailed = await sendCoachPasswordResetEmail({
      email: coach.user.email,
      name: `${coach.firstName} ${coach.lastName}`,
      coachCode: coach.coachCode,
      temporaryPassword: tempPassword,
    });

    if (emailed) {
      return res.status(200).json({ success: true, message: "Temporary password sent to the coach by email." });
    }
    return res.status(200).json({ success: true, temporaryPassword: tempPassword, message: "Could not email the coach. Temporary password shown below — share it securely." });
  } catch (error) {
    console.error("Coach password reset error:", error);
    return res.status(500).json({ error: "Could not reset the coach password." });
  }
}
