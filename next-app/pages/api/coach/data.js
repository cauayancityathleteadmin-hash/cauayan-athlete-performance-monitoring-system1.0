import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { buildCoachSnapshot, restoreCoach } from "../../../lib/backup";
import { blobEnabled, saveBackupBlob } from "../../../lib/blob-store";

export const config = { api: { bodyParser: { sizeLimit: "25mb" }, responseLimit: false } };

async function getCoach(prismaClient, session) {
  return prismaClient.coach.findUnique({ where: { userId: Number(session.user.id) } });
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;
  if (session.user.role !== "coach") return res.status(403).json({ error: "Only coaches can export or restore their own data." });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`coach-data:${ip}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const coach = await getCoach(prisma, session);
  if (!coach) return res.status(404).json({ error: "Coach record not found." });

  if (req.method === "GET") {
    const snapshot = await buildCoachSnapshot(prisma, coach.id);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="coach-data-${coach.id}-${new Date().toISOString().slice(0, 19).replace(/[:]/g, "-")}.json"`);
    res.send(JSON.stringify(snapshot));
    return;
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const snapshot = req.body?.snapshot;
  if (!snapshot) return res.status(400).json({ error: "Attach your own data backup file to restore." });

  if (blobEnabled()) {
    try {
      const safety = await buildSystemSnapshot(prisma);
      await saveBackupBlob({ kind: "pre-restore", id: `coach-${coach.id}`, payload: JSON.stringify(safety) });
    } catch (error) {
      console.warn("Pre-restore safety snapshot skipped:", error && error.message);
    }
  }

  try {
    const summary = await restoreCoach(prisma, snapshot, coach.id);
    await prisma.auditLog.create({
      data: {
        userId: Number(session.user.id),
        action: "restore",
        entityType: "coach",
        entityId: coach.id,
        description: `Coach restored their own data from a backup (${summary.total} records).`,
      },
    });
    return res.status(200).json({ success: true, message: `Your data was restored (${summary.total} records). Only your own athletes, plans, logs, notes and sessions were affected.`, summary });
  } catch (error) {
    console.error("Coach restore failed:", error);
    return res.status(400).json({ error: String((error && error.message) || error) });
  }
}