import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`backup:${ip}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireRole(session, "admin", res)) return;
  if (!requireCsrf(req, res)) return;

  const note = String(req.body?.note || "").trim().slice(0, 500) || null;
  await prisma.auditLog.create({
    data: {
      userId: Number(session.user.id),
      action: "backup",
      entityType: "system",
      entityId: null,
      description: note ? `Database backup requested. Note: ${note}` : "Database backup requested",
    },
  });
  return res.status(200).json({ success: true, message: "Backup request recorded. Please use your hosting provider (Neon / phpMyAdmin) export to download a snapshot." });
}
