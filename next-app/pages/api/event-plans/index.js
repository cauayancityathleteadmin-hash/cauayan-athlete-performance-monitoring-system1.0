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
  if (req.method === "PUT") {
    if (!requireRole(session, "admin", res)) return;
    if (!requireCsrf(req, res)) return;
    const planId = validId(req.body?.id);
    if (!planId) return res.status(400).json({ error: "Event plan id is required." });
    const existing = await prisma.eventPlan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: "Event plan not found." });

    const eventName = text(req.body?.eventName, 191, true);
    const startDate = text(req.body?.startDate, 10, true);
    const venue = text(req.body?.venue, 191, true);
    const body = req.body || {};
    const sportIds = Array.isArray(body.sportIds) ? [...new Set(body.sportIds.map(validId).filter(Boolean))] : [];
    if (!eventName || !startDate || !venue || sportIds.length === 0) {
      return res.status(400).json({ error: "Event name, date, venue, and at least one sport are required." });
    }
    const sports = await prisma.sport.findMany({ where: { id: { in: sportIds }, status: "active" }, select: { id: true } });
    if (sports.length !== sportIds.length) return res.status(400).json({ error: "One or more selected sports are invalid." });

    const updated = await prisma.$transaction(async (tx) => {
      const plan = await tx.eventPlan.update({
        where: { id: planId },
        data: {
          eventName,
          description: text(body.description, 2000) || null,
          startDate: new Date(startDate),
          endDate: text(body.endDate, 10) ? new Date(body.endDate) : null,
          venue,
          status: ["draft", "open", "closed", "cancelled"].includes(body.status) ? body.status : existing.status,
          programFlow: text(body.programFlow, 10000) || null,
        },
      });
      await tx.eventPlanSport.deleteMany({ where: { eventPlanId: planId } });
      await tx.eventPlanSport.createMany({ data: sportIds.map((sportId) => ({ eventPlanId: planId, sportId })) });
      await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "update", entityType: "event_plan", entityId: planId, description: `Updated event plan ${plan.eventName}` } });
      return plan;
    });
    return res.status(200).json(updated);
  }
  if (req.method === "DELETE") {
    if (!requireRole(session, "admin", res)) return;
    if (!requireCsrf(req, res)) return;
    const planId = validId(req.body?.id);
    if (!planId) return res.status(400).json({ error: "Event plan id is required." });
    const existing = await prisma.eventPlan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: "Event plan not found." });
    await prisma.eventPlan.update({ where: { id: planId }, data: { status: "cancelled" } });
    await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "cancel", entityType: "event_plan", entityId: planId, description: `Cancelled event plan #${planId}` } });
    return res.status(200).json({ success: true });
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