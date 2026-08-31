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

  if (req.method === "PUT") {
    if (!requireRole(session, "admin", res)) return;
    if (!requireCsrf(req, res)) return;
    const kind = text(req.body?.kind, 20, true);
    const id = validId(req.body?.id);
    if (!kind || !id) return res.status(400).json({ error: "Catalog item id and kind are required." });
    if (kind === "sport") {
      const sportName = text(req.body?.sportName, 100, true);
      if (!sportName) return res.status(400).json({ error: "Sport name is required." });
      const status = ["active", "inactive"].includes(req.body?.status) ? req.body.status : undefined;
      const result = await updateCatalogItem(res, session, "sport", id, { sportName, description: text(req.body?.description, 2000) || null, status: status ?? undefined });
      if (result) return result;
    } else if (kind === "event") {
      const eventName = text(req.body?.eventName, 150, true);
      const sportId = validId(req.body?.sportId);
      if (!eventName) return res.status(400).json({ error: "Event name is required." });
      const status = ["active", "inactive"].includes(req.body?.status) ? req.body.status : undefined;
      const data = { eventName, description: text(req.body?.description, 2000) || null, status: status ?? undefined };
      if (sportId) {
        const sport = await prisma.sport.findUnique({ where: { id: sportId }, select: { id: true } });
        if (!sport) return res.status(400).json({ error: "The selected sport is invalid." });
        data.sportId = sportId;
      }
      const result = await updateCatalogItem(res, session, "event", id, data);
      if (result) return result;
    } else if (kind === "school") {
      const schoolName = text(req.body?.schoolName, 191, true);
      if (!schoolName) return res.status(400).json({ error: "School name is required." });
      const status = ["active", "inactive"].includes(req.body?.status) ? req.body.status : undefined;
      const result = await updateCatalogItem(
        res,
        session,
        "school",
        id,
        (() => {
          const d = { schoolName };
          if (status) d.status = status;
          return d;
        })()
      );
      if (result) return result;
    } else {
      return res.status(400).json({ error: "Unsupported catalog item." });
    }
  }

  if (req.method === "DELETE") {
    if (!requireRole(session, "admin", res)) return;
    if (!requireCsrf(req, res)) return;
    const kind = text(req.body?.kind, 20, true);
    const id = validId(req.body?.id);
    if (!kind || !id) return res.status(400).json({ error: "Catalog item id and kind are required." });
    try {
      await prisma[kind].update({ where: { id }, data: { status: "inactive" } });
      await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "deactivate", entityType: kind, entityId: id, description: `Deactivated ${kind} #${id}` } });
      return res.status(200).json({ success: true });
    } catch (error) {
      if (error.code === "P2025") return res.status(404).json({ error: "Catalog item not found." });
      throw error;
    }
  }

  if (req.method === "GET") {
    const [sports, events, metrics, schools] = await Promise.all([
      prisma.sport.findMany({ orderBy: { sportName: "asc" }, include: { events: true } }),
      prisma.event.findMany({ orderBy: { eventName: "asc" }, include: { sport: true, metrics: true } }),
      prisma.performanceMetric.findMany({ orderBy: { metricName: "asc" }, include: { event: true } }),
      prisma.school.findMany({ orderBy: { schoolName: "asc" } }),
    ]);
    return res.status(200).json({ sports, events, metrics, schools });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireRole(session, "admin", res)) return;
  if (!requireCsrf(req, res)) return;

  const kind = text(req.body?.kind, 20, true);
  if (kind === "sport") {
    const sportName = text(req.body?.sportName, 100, true);
    if (!sportName) return res.status(400).json({ error: "Sport name is required." });
    try {
      const sport = await prisma.sport.create({ data: { sportName, description: text(req.body?.description, 2000) || null } });
      await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "sport", entityId: sport.id, description: `Created sport ${sport.sportName}` } });
      return res.status(201).json(sport);
    } catch (error) {
      if (error.code === "P2002") return res.status(409).json({ error: "That sport already exists." });
      throw error;
    }
  }
  if (kind === "event") {
    const sportId = validId(req.body?.sportId);
    const eventName = text(req.body?.eventName, 150, true);
    if (!sportId || !eventName) return res.status(400).json({ error: "Sport and event name are required." });
    try {
      const event = await prisma.event.create({ data: { sportId, eventName, description: text(req.body?.description, 2000) || null } });
      await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "event", entityId: event.id, description: `Created event ${event.eventName}` } });
      return res.status(201).json(event);
    } catch (error) {
      if (error.code === "P2002") return res.status(409).json({ error: "That event already exists for the sport." });
      throw error;
    }
  }
  if (kind === "school") {
    const schoolName = text(req.body?.schoolName, 191, true);
    if (!schoolName) return res.status(400).json({ error: "School name is required." });
    try {
      const school = await prisma.school.create({ data: { schoolName } });
      await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "school", entityId: school.id, description: `Created school ${school.schoolName}` } });
      return res.status(201).json(school);
    } catch (error) {
      if (error.code === "P2002") return res.status(409).json({ error: "That school already exists." });
      throw error;
    }
  }
  if (kind === "metric") {
    const eventId = validId(req.body?.eventId);
    const metricName = text(req.body?.metricName, 150, true);
    if (!eventId || !metricName) return res.status(400).json({ error: "Event and metric name are required." });
    const dataType = ["decimal", "integer", "text"].includes(req.body?.dataType) ? req.body.dataType : "decimal";
    const betterDirection = ["higher", "lower", "neutral"].includes(req.body?.betterDirection) ? req.body.betterDirection : "neutral";
    const unit = text(req.body?.unit, 50) || null;
    const decimalPlaces = Math.max(0, Math.min(6, Number(req.body?.decimalPlaces) || 0));
    const isRequired = req.body?.isRequired === true || req.body?.isRequired === "true";
    const minimumValue = req.body?.minimumValue !== "" && req.body?.minimumValue !== undefined && req.body?.minimumValue !== null ? Number(req.body.minimumValue) : null;
    const maximumValue = req.body?.maximumValue !== "" && req.body?.maximumValue !== undefined && req.body?.maximumValue !== null ? Number(req.body.maximumValue) : null;
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) return res.status(400).json({ error: "The selected event is invalid." });
    try {
      const metric = await prisma.performanceMetric.create({
        data: {
          eventId,
          metricName,
          unit,
          dataType,
          betterDirection,
          decimalPlaces,
          minimumValue: Number.isFinite(minimumValue) ? minimumValue : null,
          maximumValue: Number.isFinite(maximumValue) ? maximumValue : null,
          isRequired,
          status: "active",
        },
      });
      await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "metric", entityId: metric.id, description: `Created performance metric ${metric.metricName}` } });
      return res.status(201).json(metric);
    } catch (error) {
      if (error.code === "P2002") return res.status(409).json({ error: "That metric already exists for the event." });
      throw error;
    }
  }
  return res.status(400).json({ error: "Unsupported catalog item." });
}

async function updateCatalogItem(res, session, kind, id, data) {
  try {
    const updated = await prisma[kind].update({ where: { id }, data });
    await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "update", entityType: kind, entityId: id, description: `Updated ${kind} #${id}` } });
    return res.status(200).json(updated);
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ error: "Catalog item not found." });
    if (error.code === "P2002") return res.status(409).json({ error: "A catalog item with that name already exists." });
    throw error;
  }
}