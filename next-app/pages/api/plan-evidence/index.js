import { put, del } from "@vercel/blob";
import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const MAX_BYTES = 2.5 * 1024 * 1024;
const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function canAccessPlan(session, planId) {
  const plan = await prisma.trainingPlan.findUnique({ where: { id: planId }, select: { id: true, coachId: true } });
  if (!plan) return null;
  if (session.user.role === "admin") return plan;
  const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
  if (coach && plan.coachId === coach.id) return plan;
  return false;
}

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method === "GET") {
    const session = await requireSession(req, res);
    if (!session) return;
    const planId = validId(req.query.planId);
    const dateStr = text(req.query.date, 20);
    if (!planId || !dateStr) return res.status(400).json({ error: "planId and date are required." });

    const access = await canAccessPlan(session, planId);
    if (access === null) return res.status(404).json({ error: "Training plan not found." });
    if (access === false) return res.status(403).json({ error: "You do not have permission to view this plan." });

    const start = new Date(`${dateStr}T00:00:00.000Z`);
    if (isNaN(start)) return res.status(400).json({ error: "Invalid date." });
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 23, 59, 59, 999));

    const rows = await prisma.planEvidence.findMany({
      where: { planId, evidenceDate: { gte: start, lte: end } },
      select: { id: true, athleteId: true, evidenceDate: true, url: true, notes: true, uploadedBy: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json({ evidence: rows });
  }

  if (req.method === "POST") {
    const session = await requireSession(req, res);
    if (!session) return;
    if (!requireCsrf(req, res)) return;

    const planId = validId(req.body && req.body.planId);
    const athleteId = validId(req.body && req.body.athleteId);
    const dateStr = text(req.body && req.body.evidenceDate, 20);
    if (!planId || !athleteId || !dateStr) return res.status(400).json({ error: "planId, athleteId and evidenceDate are required." });

    const access = await canAccessPlan(session, planId);
    if (access === null) return res.status(404).json({ error: "Training plan not found." });
    if (access === false) return res.status(403).json({ error: "You do not have permission to upload evidence for this plan." });

    const onPlan = await prisma.trainingPlanAthlete.findFirst({ where: { planId, athleteId }, select: { id: true } });
    if (!onPlan) return res.status(400).json({ error: "The selected athlete is not part of this plan." });

    if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: "Image storage is not configured on the server." });

    const { base64, mime, notes } = req.body || {};
    if (!base64 || !mime || !ALLOWED[mime]) return res.status(400).json({ error: "Attach a valid JPEG, PNG, or WEBP photo." });
    const buf = Buffer.from(base64, "base64");
    if (!buf.length || buf.length > MAX_BYTES) return res.status(400).json({ error: "The photo is empty or larger than 2.5 MB." });

    const ip = req.headers["x-forwarded-for"] && req.headers["x-forwarded-for"].split(",")[0].trim() || "unknown";
    const rate = rateLimiters.api(`plan-evidence:${ip}`);
    if (!rate.allowed) return res.status(429).json({ error: "Too many uploads. Please try again later." });

    const evidenceDate = new Date(`${dateStr}T00:00:00.000Z`);
    if (isNaN(evidenceDate)) return res.status(400).json({ error: "Invalid date." });

    try {
      const ext = ALLOWED[mime];
      const name = `plan-evidence/p${planId}-a${athleteId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const { url } = await put(name, buf, { access: "public", contentType: mime });

      const notesClean = notes ? String(notes).slice(0, 500) : null;
      const existing = await prisma.planEvidence.findUnique({ where: { planId_athleteId_evidenceDate: { planId, athleteId, evidenceDate } } });
      if (existing && existing.url !== url) {
        try { await del(existing.url); } catch (e) { console.error("Old evidence blob delete failed", e); }
      }
      const row = await prisma.planEvidence.upsert({
        where: { planId_athleteId_evidenceDate: { planId, athleteId, evidenceDate } },
        update: { url, notes: notesClean, uploadedBy: Number(session.user.id) },
        create: { planId, athleteId, evidenceDate, url, notes: notesClean, uploadedBy: Number(session.user.id) },
      });

      await prisma.auditLog.create({
        data: { userId: Number(session.user.id), action: "evidence_upload", entityType: "planEvidence", entityId: row.id, description: `Uploaded training evidence photo for athlete #${athleteId} on plan #${planId} for ${dateStr}.` },
      });
      return res.status(200).json({ ok: true, id: row.id, url });
    } catch (error) {
      console.error("Plan evidence upload failed", error);
      return res.status(500).json({ error: "The photo could not be uploaded.", detail: String((error && error.message) || error) });
    }
  }

  if (req.method === "DELETE") {
    const session = await requireSession(req, res);
    if (!session) return;
    if (!requireCsrf(req, res)) return;
    const id = validId(req.query.id);
    if (!id) return res.status(400).json({ error: "A valid evidence id is required." });

    const row = await prisma.planEvidence.findUnique({ where: { id }, select: { id: true, planId: true, url: true } });
    if (!row) return res.status(404).json({ error: "Evidence not found." });

    const access = await canAccessPlan(session, row.planId);
    if (access === null) return res.status(404).json({ error: "Training plan not found." });
    if (access === false) return res.status(403).json({ error: "You do not have permission to remove this evidence." });

    try { await del(row.url); } catch (e) { console.error("Evidence blob delete failed", e); }
    await prisma.planEvidence.delete({ where: { id } });
    await prisma.auditLog.create({
      data: { userId: Number(session.user.id), action: "evidence_delete", entityType: "planEvidence", entityId: id, description: `Removed training evidence photo #${id} on plan #${row.planId}.` },
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed." });
}