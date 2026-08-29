import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../../../lib/prisma";
import { sendCoachPasswordResetEmail } from "../../../../lib/email";
import { requireSession, requireRole, requireCsrf, setSecurityHeaders } from "../../../../lib/api-security";

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
  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireRole(session, "admin", res)) return;
  if (req.method !== "POST") return res.status(405).end();
  if (!requireCsrf(req, res)) return;

  const codes = ["COA-TEST01", "COA-TEST02", "COA-TEST03", ...(Array.isArray(req.body?.codes) ? req.body.codes.filter((c) => typeof c === "string").map((c) => c.trim().toUpperCase()).filter(Boolean) : [])];
  const emails = Array.isArray(req.body?.emails) ? req.body.emails.filter((e) => typeof e === "string").map((e) => e.trim().toLowerCase()).filter(Boolean) : [];
  const reproCoachId = Number(req.body?.reproCoachId);

  const results = [];
  try {
    const coaches = await prisma.coach.findMany({
      where: { OR: [{ coachCode: { in: codes } }, { email: { in: emails } }] },
      include: { user: true },
    });
    const hash = await bcrypt.hash(crypto.randomBytes(24).toString("base64"), 12);
    for (const coach of coaches) {
      await prisma.user.update({ where: { id: coach.userId }, data: { status: "inactive", passwordHash: hash, mustChangePassword: true, passwordChangedAt: null } });
      await prisma.coach.update({ where: { id: coach.id }, data: { status: "inactive" } });
      await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "deactivate_test_account", entityType: "coach", entityId: coach.id, description: `Deactivated test coach ${coach.coachCode}` } });
      results.push(`${coach.coachCode} (${coach.email}): user ${coach.user.username} ${coach.user.status} -> inactive`);
    }

    let repro = null;
    if (reproCoachId) {
      const step = [];
      let coach = null;
      try {
        step.push("findUnique");
        coach = await prisma.coach.findUnique({ where: { id: reproCoachId }, include: { user: true } });
        if (!coach) throw new Error("coach not found");
        step.push("bcrypt.hash");
        const passwordHash = await bcrypt.hash(generateTempPassword(), 12);
        step.push("$transaction");
        await prisma.$transaction([
          prisma.user.update({ where: { id: coach.userId }, data: { passwordHash, mustChangePassword: true, passwordChangedAt: null } }),
          prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "coach_password_reset", entityType: "coach", entityId: coach.id, description: `Reset password for coach ${coach.coachCode}` } }),
        ]);
        step.push("done");
        repro = { ok: true, step };
      } catch (e) {
        repro = { ok: false, step, name: e?.name, code: e?.code, message: String(e?.message || e) };
      }
      if (coach) {
        step.push("email.call");
        try {
          const emailed = await sendCoachPasswordResetEmail({ email: coach.user.email, name: "Diag", coachCode: coach.coachCode, temporaryPassword: "Diag12345!" });
          step.push(`email.returned=${emailed}`);
          if (repro && repro.ok) repro.step = step;
        } catch (e) {
          step.push(`email.throw=${String(e?.message || e)}`);
        }
      }
    }

    const admin = await prisma.user.findFirst({ where: { username: "admin-test" }, select: { id: true, username: true, status: true, role: true, mustChangePassword: true } });
    return res.status(200).json({ success: true, results, repro, adminTest: admin });
  } catch (error) {
    return res.status(500).json({ error: "deactivate failed", detail: String(error?.message || error), results });
  }
}