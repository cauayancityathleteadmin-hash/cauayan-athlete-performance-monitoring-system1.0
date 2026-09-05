import crypto from "crypto";
import { prisma } from "../../../../lib/prisma";
import { setSecurityHeaders } from "../../../../lib/api-security";
import { buildSystemSnapshot } from "../../../../lib/backup";
import { blobEnabled, saveBackupBlob } from "../../../../lib/blob-store";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const expected = process.env.BACKUP_SECRET;
  const isVercelCron = String(req.headers["x-vercel-cron"] || "") === "1";
  if (!expected && !isVercelCron) return res.status(503).json({ error: "Automatic backup is not configured (BACKUP_SECRET missing)." });
  const provided = req.query?.key || "";
  let authorized = isVercelCron;
  if (!authorized && expected) {
    const a = Buffer.from(String(provided));
    const b = Buffer.from(expected);
    authorized = a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  if (!authorized) return res.status(401).json({ error: "Unauthorized." });

  if (!blobEnabled()) return res.status(503).json({ error: "Off-site backup storage is not configured (BLOB_READ_WRITE_TOKEN missing)." });

  const snapshot = await buildSystemSnapshot(prisma);
  const stored = await saveBackupBlob({ kind: "system", payload: JSON.stringify(snapshot) });
  if (!stored) return res.status(500).json({ error: "The backup could not be saved." });

  await prisma.auditLog.create({
    data: {
      userId: null,
      action: "backup",
      entityType: "system",
      entityId: null,
      description: "Automatic monthly backup created by the scheduler.",
    },
  });

  const total = snapshot.counts ? Object.values(snapshot.counts).reduce((a, b) => a + b, 0) : 0;
  return res.status(200).json({ success: true, message: "Automatic backup created.", url: stored.url, total, createdAt: snapshot.createdAt });
}