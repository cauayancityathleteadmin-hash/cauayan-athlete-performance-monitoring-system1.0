import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, setSecurityHeaders } from "../../../lib/api-security";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const session = await requireSession(req, res);
  if (!session) return;
  if (session.user.role !== "coach") return res.status(403).json({ error: "Only coaches manage their notification settings." });
  if (!requireCsrf(req, res)) return;

  const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) } });
  if (!coach) return res.status(404).json({ error: "Coach record not found." });

  const nextSms = typeof req.body?.notifySms === "boolean" ? req.body.notifySms : coach.notifySms;
  const nextEmail = typeof req.body?.notifyEmail === "boolean" ? req.body.notifyEmail : coach.notifyEmail;

  await prisma.coach.update({
    where: { id: coach.id },
    data: { notifySms: nextSms, notifyEmail: nextEmail },
  });

  await prisma.auditLog.create({
    data: {
      userId: Number(session.user.id),
      action: "update_notification_prefs",
      entityType: "coach",
      entityId: coach.id,
      description: `Updated notification preferences (SMS: ${nextSms ? "on" : "off"}, email: ${nextEmail ? "on" : "off"}).`,
    },
  });

  return res.status(200).json({ success: true, notifySms: nextSms, notifyEmail: nextEmail, message: "Notification settings saved." });
}