import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, text, validId } from "../../../lib/api-security";

export default async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session) return;
  if (req.method === "GET") {
    const [sports, events, metrics, schools] = await Promise.all([
      prisma.sport.findMany({ orderBy: { sportName: "asc" }, include: { events: true } }),
      prisma.event.findMany({ orderBy: { eventName: "asc" }, include: { sport: true, metrics: true } }),
      prisma.performanceMetric.findMany({ orderBy: { metricName: "asc" }, include: { event: true } }),
      prisma.school.findMany({ orderBy: { schoolName: "asc" } }),
    ]);
    return res.status(200).json({ sports, events, metrics, schools });
  }
  if (req.method !== "POST" || !requireRole(session, "admin", res)) return;
  if (!requireCsrf(req, res)) return;
  const kind = text(req.body?.kind, 20, true);
  if (kind === "sport") {
    const sportName = text(req.body?.sportName, 100, true);
    if (!sportName) return res.status(400).json({ error: "Sport name is required." });
    try { const sport = await prisma.sport.create({ data: { sportName, description: text(req.body?.description, 2000) || null } }); await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "sport", entityId: sport.id, description: `Created sport ${sport.sportName}` } }); return res.status(201).json(sport); } catch (error) { if (error.code === "P2002") return res.status(409).json({ error: "That sport already exists." }); throw error; }
  }
  if (kind === "event") {
    const sportId = validId(req.body?.sportId); const eventName = text(req.body?.eventName, 150, true);
    if (!sportId || !eventName) return res.status(400).json({ error: "Sport and event name are required." });
    try { const event = await prisma.event.create({ data: { sportId, eventName, description: text(req.body?.description, 2000) || null } }); await prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "event", entityId: event.id, description: `Created event ${event.eventName}` } }); return res.status(201).json(event); } catch (error) { if (error.code === "P2002") return res.status(409).json({ error: "That event already exists for the sport." }); throw error; }
  }
  return res.status(400).json({ error: "Unsupported catalog item." });
}