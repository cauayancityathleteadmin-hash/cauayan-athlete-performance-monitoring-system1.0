import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

// Allowed sport categories (mirrors the SportCategory enum in schema.prisma).
const SPORT_CATEGORIES = ["individual", "team", "racket", "combat", "aquatics", "dance"];

// Deactivation is only allowed on these models. `kind` arrives from the client,
// so it must never be used directly as a Prisma model name (that would let a
// caller target any model, e.g. users).
const DEACTIVATABLE_KINDS = ["sport", "event", "school", "metric"];

const METRIC_DATA_TYPES = ["decimal", "integer", "text"];
const METRIC_DIRECTIONS = ["higher", "lower", "neutral"];

function optionalNumber(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

// Validates a full metric definition (existing values merged with the request).
// Returns an error string, or null when the definition is usable.
function validateMetricDefinition(metric) {
  if (!METRIC_DATA_TYPES.includes(metric.dataType)) return "Data type must be decimal, integer, or text.";
  if (!METRIC_DIRECTIONS.includes(metric.betterDirection)) return "Better result must be higher, lower, or neutral.";
  if (!Number.isInteger(metric.decimalPlaces) || metric.decimalPlaces < 0 || metric.decimalPlaces > 6) {
    return "Decimal places must be a whole number from 0 to 6.";
  }
  const hasMin = metric.minimumValue !== null && metric.minimumValue !== undefined;
  const hasMax = metric.maximumValue !== null && metric.maximumValue !== undefined;
  if (metric.dataType === "text") {
    if (hasMin || hasMax) return "Text metrics cannot have a numeric minimum or maximum.";
    return null;
  }
  if (hasMin && !Number.isFinite(Number(metric.minimumValue))) return "Minimum value must be a number.";
  if (hasMax && !Number.isFinite(Number(metric.maximumValue))) return "Maximum value must be a number.";
  if (hasMin && hasMax && Number(metric.minimumValue) > Number(metric.maximumValue)) {
    return "Minimum value cannot be greater than the maximum value.";
  }
  return null;
}

// Fields that change how an already-recorded result must be interpreted.
const INTERPRETATION_FIELDS = ["eventId", "metricName", "unit", "dataType", "betterDirection", "decimalPlaces", "minimumValue", "maximumValue"];

function sameValue(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (typeof a === "object" || typeof b === "object") return String(a) === String(b);
  return a === b;
}

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
      const category = SPORT_CATEGORIES.includes(req.body?.category) ? req.body.category : undefined;
      const result = await updateCatalogItem(res, session, "sport", id, { sportName, description: text(req.body?.description, 2000) || null, category: category ?? undefined, status: status ?? undefined });
      if (result) return result;
    } else if (kind === "event") {
      const eventName = text(req.body?.eventName, 150, true);
      const sportId = validId(req.body?.sportId);
      if (!eventName) return res.status(400).json({ error: "Event name is required." });
      const status = ["active", "inactive"].includes(req.body?.status) ? req.body.status : undefined;
      const eventCategory = ["individual", "smallTeam", "largeTeam"].includes(req.body?.eventCategory) ? req.body.eventCategory : undefined;
      const data = { eventName, description: text(req.body?.description, 2000) || null, status: status ?? undefined, eventCategory: eventCategory ?? undefined };
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
    } else if (kind === "metric") {
      const existing = await prisma.performanceMetric.findUnique({
        where: { id },
        include: { _count: { select: { results: true } } },
      });
      if (!existing) return res.status(404).json({ error: "Metric not found." });

      const next = {
        eventId: req.body?.eventId !== undefined ? validId(req.body.eventId) : existing.eventId,
        metricName: req.body?.metricName !== undefined ? text(req.body.metricName, 150, true) : existing.metricName,
        unit: req.body?.unit !== undefined ? text(req.body.unit, 50) || null : existing.unit,
        dataType: req.body?.dataType !== undefined ? req.body.dataType : existing.dataType,
        betterDirection: req.body?.betterDirection !== undefined ? req.body.betterDirection : existing.betterDirection,
        decimalPlaces: req.body?.decimalPlaces !== undefined ? Number(req.body.decimalPlaces) : existing.decimalPlaces,
        minimumValue: req.body?.minimumValue !== undefined ? optionalNumber(req.body.minimumValue) : existing.minimumValue,
        maximumValue: req.body?.maximumValue !== undefined ? optionalNumber(req.body.maximumValue) : existing.maximumValue,
        isRequired: req.body?.isRequired !== undefined ? (req.body.isRequired === true || req.body.isRequired === "true") : existing.isRequired,
        status: req.body?.status !== undefined ? req.body.status : existing.status,
      };

      if (!next.eventId) return res.status(400).json({ error: "The selected event is invalid." });
      if (!next.metricName) return res.status(400).json({ error: "Metric name is required." });
      if (!["active", "inactive"].includes(next.status)) return res.status(400).json({ error: "Status must be active or inactive." });
      if (next.dataType === "text") next.decimalPlaces = 0;
      if (Number.isNaN(next.minimumValue) || Number.isNaN(next.maximumValue)) {
        return res.status(400).json({ error: "Minimum and maximum must be numbers." });
      }
      const invalid = validateMetricDefinition(next);
      if (invalid) return res.status(400).json({ error: invalid });

      const event = await prisma.event.findUnique({ where: { id: next.eventId }, select: { id: true } });
      if (!event) return res.status(400).json({ error: "The selected event is invalid." });

      // Historical protection: once results exist, redefining the metric would
      // silently change what those results mean. Only status and "required"
      // may change; everything else requires a new metric definition.
      if (existing._count.results > 0) {
        const changed = INTERPRETATION_FIELDS.filter((field) => {
          if (field === "decimalPlaces" && next.dataType === "text") return false;
          return !sameValue(existing[field], next[field]);
        });
        if (changed.length) {
          return res.status(409).json({
            error: `This metric already has ${existing._count.results} recorded result(s), so its definition cannot be changed. Deactivate it and create a new metric instead.`,
          });
        }
      }

      const result = await updateCatalogItem(res, session, "performanceMetric", id, {
        eventId: next.eventId,
        metricName: next.metricName,
        unit: next.unit,
        dataType: next.dataType,
        betterDirection: next.betterDirection,
        decimalPlaces: next.decimalPlaces,
        minimumValue: next.minimumValue,
        maximumValue: next.maximumValue,
        isRequired: next.isRequired,
        status: next.status,
      }, "metric");
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
    if (!DEACTIVATABLE_KINDS.includes(kind)) {
      return res.status(400).json({ error: "Unsupported catalog item." });
    }
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
    const category = SPORT_CATEGORIES.includes(req.body?.category) ? req.body.category : "individual";
    try {
      const sport = await prisma.sport.create({ data: { sportName, description: text(req.body?.description, 2000) || null, category } });
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
    const eventCategory = ["individual", "smallTeam", "largeTeam"].includes(req.body?.eventCategory) ? req.body.eventCategory : undefined;
    try {
      const event = await prisma.event.create({ data: { sportId, eventName, description: text(req.body?.description, 2000) || null, eventCategory } });
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
    const dataType = req.body?.dataType ?? "decimal";
    const betterDirection = req.body?.betterDirection ?? "neutral";
    const decimalPlaces = Number(req.body?.decimalPlaces ?? 0);
    const minimumValue = optionalNumber(req.body?.minimumValue);
    const maximumValue = optionalNumber(req.body?.maximumValue);
    if (Number.isNaN(minimumValue) || Number.isNaN(maximumValue)) {
      return res.status(400).json({ error: "Minimum and maximum must be numbers." });
    }
    const definition = {
      dataType,
      betterDirection,
      decimalPlaces: dataType === "text" ? 0 : decimalPlaces,
      minimumValue,
      maximumValue,
    };
    const invalid = validateMetricDefinition(definition);
    if (invalid) return res.status(400).json({ error: invalid });
    const unit = text(req.body?.unit, 50) || null;
    const isRequired = req.body?.isRequired === true || req.body?.isRequired === "true";
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) return res.status(400).json({ error: "The selected event is invalid." });
    try {
      const metric = await prisma.performanceMetric.create({
        data: {
          eventId,
          metricName,
          unit,
          dataType: definition.dataType,
          betterDirection: definition.betterDirection,
          decimalPlaces: definition.decimalPlaces,
          minimumValue: definition.minimumValue,
          maximumValue: definition.maximumValue,
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

async function updateCatalogItem(res, session, kind, id, data, entityType = kind) {
  try {
    const updated = await prisma[kind].update({ where: { id }, data });
    await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "update", entityType, entityId: id, description: `Updated ${entityType} #${id}` } });
    return res.status(200).json(updated);
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ error: "Catalog item not found." });
    if (error.code === "P2002") return res.status(409).json({ error: "A catalog item with that name already exists." });
    throw error;
  }
}