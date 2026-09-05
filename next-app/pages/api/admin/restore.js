import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { buildSystemSnapshot, restoreSystem } from "../../../lib/backup";
import { blobEnabled, saveBackupBlob, fetchBackupBlob } from "../../../lib/blob-store";

export const config = { api: { bodyParser: { sizeLimit: "25mb" }, responseLimit: false } };

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireRole(session, "admin", res)) return;
  if (!requireCsrf(req, res)) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`restore:${ip}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const source = req.body?.source || "file";
  let snapshot;
  try {
    if (source === "blob") {
      const url = String(req.body?.url || "");
      if (!/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.blob\.vercel-storage\.com\/db-backups\/system-[^/?#]+$/i.test(url))
        return res.status(400).json({ error: "Choose a stored full-system backup from the system backup storage to restore." });
      snapshot = await fetchBackupBlob(url);
    } else {
      snapshot = req.body?.snapshot;
      if (!snapshot) return res.status(400).json({ error: "Attach a full-system backup file to restore." });
    }
  } catch (error) {
    return res.status(400).json({ error: "The backup file could not be read.", detail: String((error && error.message) || error) });
  }

  let preBackupUrl = null;
  if (blobEnabled()) {
    try {
      const safety = await buildSystemSnapshot(prisma);
      const stored = await saveBackupBlob({ kind: "pre-restore", id: "system", payload: JSON.stringify(safety) });
      if (stored) preBackupUrl = stored.url;
    } catch (error) {
      console.warn("Pre-restore safety backup skipped:", error && error.message);
    }
  }

  try {
    const summary = await restoreSystem(prisma, snapshot);
    await prisma.auditLog.create({
      data: {
        userId: Number(session.user.id),
        action: "restore",
        entityType: "system",
        entityId: null,
        description: `Database restored from a full-system backup. Total records: ${summary.total}.`,
      },
    });
    return res.status(200).json({ success: true, message: `The database was restored from the backup (${summary.total} records). ${preBackupUrl ? "A safety backup was saved before restoring." : ""}`, summary, preBackupUrl });
  } catch (error) {
    console.error("Restore failed:", error);
    return res.status(500).json({ error: "The restore could not be completed. No changes were applied.", detail: String((error && error.message) || error) });
  }
}