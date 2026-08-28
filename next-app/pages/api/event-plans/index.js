import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method === "GET") {
    return res.status(200).json(
      await prisma.eventPlan.findMany({ orderBy: { startDate: "asc" }, include: { sports: { include: { sport: true } }, applications: true, participants: { where: { status: "active" } } } })
    );
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireRole(session, "admin", res)) return;
  if (!requireCsrf(req, res)) return;

  const body = req.body || {};
  const eventName = text(body.eventName, 191, true);
  const startDate = text(body.startDate, 10, true);
  const venue = text(body.venue, 191, true);
  const sportIds = Array.isArray(body.sportIds) ? [...new Set(body.sportIds.map(validId).filter(Boolean))] : [];

  if (!eventName || !startDate || !venue || sportIds.length === 0 || sportIds.length > 50) {
    return res.status(400).json({ error: "Event name, date, venue, and at least one sport are required." });
  }

  const sports = await prisma.sport.findMany({ where: { id: { in: sportIds }, status: "active" }, select: { id: true } });
  if (sports.length !== sportIds.length) return res.status(400).json({ error: "One or more selected sports are invalid." });

  const plan = await prisma.$transaction(async (tx) => {
    const created = await tx.eventPlan.create({
      data: {
        eventName,
        description: text(body.description, 2000) || null,
        startDate: new Date(startDate),
        endDate: text(body.endDate, 10) ? new Date(body.endDate) : null,
        venue,
        status: ["draft", "open", "closed", "cancelled"].includes(body.status) ? body.status : "draft",
        programFlow: text(body.programFlow, 10000) || null,
        createdBy: Number(session.user.id),
        sports: { create: sportIds.map((sportId) => ({ sportId })) },
      },
      include: { sports: true },
    });
    await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "event_plan", entityId: created.id, description: `Created event plan ${created.eventName}` } });
    return created;
  });
  return res.status(201).json(plan);
}