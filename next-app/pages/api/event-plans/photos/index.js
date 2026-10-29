import { put, del } from "@vercel/blob";
import { prisma } from "../../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../../lib/api-security";
import { rateLimiters } from "../../../../lib/rate-limit";
import { detectImage } from "../../../../lib/image-validation";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const MAX_BYTES = 2.5 * 1024 * 1024;
const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const CATEGORIES = ["winner", "event"];

/* Who may add or remove event documentation photos:
   - admin, always
   - a coach attached to that event (participating, or an approved applicant)
   Viewing is wider: any signed-in user, but drafts stay admin-only. */
async function canManageEvent(session, eventPlanId) {
  const plan = await prisma.eventPlan.findUnique({
    where: { id: eventPlanId },
    select: { id: true, status: true },
  });
  if (!plan) return null;
  if (session.user.role === "admin") return plan;

  const coach = await prisma.coach.findUnique({
    where: { userId: Number(session.user.id) },
    select: { id: true },
  });
  if (!coach) return false;

  const [participant, application] = await Promise.all([
    prisma.eventParticipant.findFirst({ where: { eventPlanId, coachId: coach.id }, select: { id: true } }),
    prisma.eventApplication.findFirst({ where: { eventPlanId, coachId: coach.id, status: "approved" }, select: { id: true } }),
  ]);
  return participant || application ? plan : false;
}

const PHOTO_SELECT = {
  id: true,
  eventPlanId: true,
  category: true,
  sportId: true,
  athleteId: true,
  caption: true,
  url: true,
  uploadedBy: true,
  createdAt: true,
  sport: { select: { sportName: true } },
  athlete: { select: { firstName: true, lastName: true, athleteCode: true } },
  uploader: { select: { username: true } },
};

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method === "GET") {
    const session = await requireSession(req, res);
    if (!session) return;
    const eventPlanId = validId(req.query.eventPlanId);
    if (!eventPlanId) return res.status(400).json({ error: "eventPlanId is required." });

    const plan = await prisma.eventPlan.findUnique({ where: { id: eventPlanId }, select: { id: true, status: true } });
    if (!plan) return res.status(404).json({ error: "Event plan not found." });
    if (plan.status === "draft" && session.user.role !== "admin") {
      return res.status(403).json({ error: "This event plan is still a draft." });
    }

    const category = text(req.query.category, 20);
    const where = { eventPlanId, ...(CATEGORIES.includes(category) ? { category } : {}) };
    const photos = await prisma.eventPhoto.findMany({
      where,
      select: PHOTO_SELECT,
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json({ photos });
  }

  if (req.method === "POST") {
    const session = await requireSession(req, res);
    if (!session) return;
    if (!requireCsrf(req, res)) return;

    const eventPlanId = validId(req.body?.eventPlanId);
    const category = text(req.body?.category, 20);
    const sportId = req.body?.sportId ? validId(req.body.sportId) : null;
    const athleteId = req.body?.athleteId ? validId(req.body.athleteId) : null;
    const caption = text(req.body?.caption, 300);
    if (!eventPlanId) return res.status(400).json({ error: "eventPlanId is required." });
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: "Choose a photo type." });
    if (category === "winner" && !sportId) return res.status(400).json({ error: "Winner photos need a sport." });

    const access = await canManageEvent(session, eventPlanId);
    if (access === null) return res.status(404).json({ error: "Event plan not found." });
    if (access === false) return res.status(403).json({ error: "You do not have permission to add photos to this event." });
    if (access.status === "cancelled") return res.status(400).json({ error: "This event is cancelled." });

    if (sportId) {
      const onPlan = await prisma.eventPlanSport.findFirst({ where: { eventPlanId, sportId }, select: { sportId: true } });
      if (!onPlan) return res.status(400).json({ error: "That sport is not part of this event." });
    }
    if (athleteId) {
      const enrolled = await prisma.eventParticipant.findFirst({ where: { eventPlanId, athleteId }, select: { id: true } });
      if (!enrolled) return res.status(400).json({ error: "That athlete is not part of this event." });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: "Image storage is not configured on the server." });

    const { base64, mime } = req.body || {};
    if (!base64 || !mime || !ALLOWED[mime]) return res.status(400).json({ error: "Attach a valid JPEG, PNG, or WEBP photo." });
    const buf = Buffer.from(base64, "base64");
    if (!buf.length || buf.length > MAX_BYTES) return res.status(400).json({ error: "The photo is empty or larger than 2.5 MB." });
    const detected = detectImage(buf);
    if (!detected) return res.status(400).json({ error: "The file content is not a valid JPEG, PNG, or WEBP image." });

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
    const rate = rateLimiters.api(`event-photos:${ip}`);
    if (!rate.allowed) return res.status(429).json({ error: "Too many uploads. Please try again later." });

    try {
      const { ext, mime: realMime } = detected;
      const name = `event-photos/p${eventPlanId}-${category}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const { url } = await put(name, buf, { access: "public", contentType: realMime });

      const row = await prisma.eventPhoto.create({
        data: {
          eventPlanId,
          category,
          sportId,
          athleteId,
          caption: caption || null,
          url,
          uploadedBy: Number(session.user.id),
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: Number(session.user.id),
          action: "event_photo_upload",
          entityType: "eventPhoto",
          entityId: row.id,
          description: `Uploaded ${category} photo #${row.id} for event plan #${eventPlanId}${sportId ? ` (sport #${sportId})` : ""}${athleteId ? ` (athlete #${athleteId})` : ""}.`,
        },
      });

      const photo = await prisma.eventPhoto.findUnique({ where: { id: row.id }, select: PHOTO_SELECT });
      return res.status(200).json({ ok: true, photo });
    } catch (error) {
      console.error("Event photo upload failed", error);
      return res.status(500).json({ error: "The photo could not be uploaded." });
    }
  }

  if (req.method === "DELETE") {
    const session = await requireSession(req, res);
    if (!session) return;
    if (!requireCsrf(req, res)) return;
    const id = validId(req.query.id);
    if (!id) return res.status(400).json({ error: "A valid photo id is required." });

    const row = await prisma.eventPhoto.findUnique({ where: { id }, select: { id: true, eventPlanId: true, url: true, category: true } });
    if (!row) return res.status(404).json({ error: "Photo not found." });

    const access = await canManageEvent(session, row.eventPlanId);
    if (access === null) return res.status(404).json({ error: "Event plan not found." });
    if (access === false) return res.status(403).json({ error: "You do not have permission to remove this photo." });

    try { await del(row.url); } catch (error) { console.error("Event photo blob delete failed", error); }
    await prisma.eventPhoto.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        userId: Number(session.user.id),
        action: "event_photo_delete",
        entityType: "eventPhoto",
        entityId: id,
        description: `Removed ${row.category} photo #${id} from event plan #${row.eventPlanId}.`,
      },
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed." });
}
