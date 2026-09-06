import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text } from "../../../lib/api-security";

export default async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session) return;
  if (req.method === "GET") return res.status(200).json(await prisma.athlete.findMany({ orderBy: { lastName: "asc" }, include: { school: true, sport: true, event: true, coach: true } }));
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;
  const body = req.body || {};
  const athleteCode = text(body.athleteCode, 20, true); const firstName = text(body.firstName, 100, true); const lastName = text(body.lastName, 100, true);
  const birthdate = text(body.birthdate, 10, true); const gender = body.gender; const sportId = Number(body.sportId); const eventId = body.eventId ? Number(body.eventId) : null; const schoolId = body.schoolId ? Number(body.schoolId) : null;
  if (!athleteCode || !firstName || !lastName || !birthdate || !["male", "female", "other", "prefer_not_to_say"].includes(gender) || !Number.isInteger(sportId) || (eventId !== null && !Number.isInteger(eventId))) return res.status(400).json({ error: "Complete the required athlete fields with valid values." });
  let coachId = Number(body.coachId);
  if (session.user.role === "coach") { const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) } }); if (!coach) return res.status(403).json({ error: "Coach profile not found." }); coachId = coach.id; }
  if (!Number.isInteger(coachId)) return res.status(400).json({ error: "A coach assignment is required." });
  const [sport, event, coach] = await Promise.all([prisma.sport.findUnique({ where: { id: sportId } }), eventId ? prisma.event.findUnique({ where: { id: eventId } }) : null, prisma.coach.findUnique({ where: { id: coachId } })]);
  if (!sport || sport.status !== "active" || !coach || coach.status !== "active" || (eventId && (!event || event.sportId !== sportId))) return res.status(400).json({ error: "The selected sport, event, or coach is invalid." });
  try {
    const athlete = await prisma.$transaction(async (tx) => {
      const created = await tx.athlete.create({ data: { athleteCode, firstName, middleName: text(body.middleName, 100) || null, lastName, suffix: text(body.suffix, 20) || null, birthdate: new Date(birthdate), gender, contactNumber: text(body.contactNumber, 30) || null, email: text(body.email, 191) || null, address: text(body.address, 2000) || null, schoolId, sportId, eventId, coachId, dateRegistered: new Date() } });
      await tx.athleteCoachHistory.create({ data: { athleteId: created.id, coachId, assignedBy: Number(session.user.id), reason: "Initial assignment" } });
      await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "athlete", entityId: created.id, description: `Created athlete ${created.athleteCode}` } });
      return created;
    });
    return res.status(201).json(athlete);
  } catch (error) { if (error.code === "P2002") return res.status(409).json({ error: "That athlete code is already registered." }); throw error; }
}