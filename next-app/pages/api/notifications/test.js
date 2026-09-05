import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { sendSms } from "../../../lib/sms";
import { sendNotificationEmail } from "../../../lib/email";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`notify-test:${ip}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });
  if (!requireCsrf(req, res)) return;

  const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) } });
  if (!coach) return res.status(404).json({ error: "Coach record not found." });

  const channels = req.body?.channels && Array.isArray(req.body.channels) ? req.body.channels : [];
  const results = { sms: false, email: false, smsSkipped: "", emailSkipped: "" };

  if (channels.includes("sms")) {
    if (!process.env.SEMAPHORE_API_KEY) {
      results.smsSkipped = "SMS is not configured on the server (SEMAPHORE_API_KEY missing).";
    } else if (!coach.contactNumber) {
      results.smsSkipped = "Add a contact number to your profile to receive SMS.";
    } else {
      results.sms = await sendSms({ to: coach.contactNumber, message: "Test SMS from the Cauayan City Athlete Performance Monitoring System. Your SMS notifications are working." });
    }
  }

  if (channels.includes("email")) {
    results.email = await sendNotificationEmail({ email: coach.email, name: `${coach.firstName} ${coach.lastName}`.trim(), subject: "Test notification from the athlete monitoring system", message: "This is a test email from the Cauayan City Athlete Performance Monitoring System. Your email notifications are working." });
  }

  await prisma.auditLog.create({
    data: {
      userId: Number(session.user.id),
      action: "test_notification",
      entityType: "coach",
      entityId: coach.id,
      description: `Sent a test notification (${channels.join(", ") || "none"}).`,
    },
  });

  return res.status(200).json({ success: true, results });
}