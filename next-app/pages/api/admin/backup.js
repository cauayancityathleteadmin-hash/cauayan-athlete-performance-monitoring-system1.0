import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, setSecurityHeaders, text } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { buildSystemSnapshot, getSetting, setSetting } from "../../../lib/backup";
import { blobEnabled, saveBackupBlob, listSystemBackups } from "../../../lib/blob-store";

export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`backup:${ip}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });
  if (!requireRole(session, "admin", res)) return;

  if (req.method === "GET") {
    const snapshots = await listSystemBackups();
    const schedule = await getSetting(prisma, "backup_schedule");
    return res.status(200).json({ snapshots, schedule: schedule || "monthly" });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const action = req.body?.action || "save";
  const note = text(req.body?.note, 500) || null;

  if (action === "save") {
    try {
      const snapshot = await buildSystemSnapshot(prisma);
      const stored = await saveBackupBlob({ kind: "system", payload: JSON.stringify(snapshot) });
      let url = null;
      if (!stored) {
        url = "/api/admin/backup?action=download";
      }
      await setSetting(prisma, "last_backup_at", new Date().toISOString()).catch(() => {});
      await prisma.auditLog.create({
        data: {
          userId: Number(session.user.id),
          action: "backup",
          entityType: "system",
          entityId: null,
          description: `Full-system backup created. Total records: ${snapshot.counts ? Object.values(snapshot.counts).reduce((a, b) => a + b, 0) : 0}.${note ? ` Note: ${note}` : ""}`,
        },
      });
      return res.status(200).json({
        success: true,
        message: stored ? "A full-system backup was saved off-site. Old backups beyond the last 20 are removed automatically." : "A full-system backup file was generated for download (off-site storage is not configured).",
        url: stored ? stored.url : url,
        counts: snapshot.counts,
        stored: Boolean(stored),
        lastBackupAt: snapshot.createdAt,
      });
    } catch (error) {
      console.error("Backup failed:", error);
      return res.status(500).json({ error: "The backup could not be created.", detail: String((error && error.message) || error) });
    }
  }

  if (action === "download") {
    try {
      const snapshot = await buildSystemSnapshot(prisma);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="system-backup-${new Date().toISOString().slice(0, 19).replace(/[:]/g, "-")}.json"`);
      res.send(JSON.stringify(snapshot));
      return;
    } catch (error) {
      console.error("Backup download failed:", error);
      return res.status(500).json({ error: "The backup file could not be generated." });
    }
  }

  return res.status(400).json({ error: "Unknown action." });
}