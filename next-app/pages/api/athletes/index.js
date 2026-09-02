import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validateEmail, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method === "GET") {
    try {
      let whereClause = undefined;
      if (session.user.role === "coach") {
        const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
        if (coach) whereClause = { coachId: coach.id };
      }
      const athletes = await prisma.athlete.findMany({ where: whereClause, orderBy: { lastName: "asc" }, include: { school: true, sport: true, event: true, coach: true } });
      return res.status(200).json(athletes);
    } catch (error) {
      console.error("Athletes GET error:", error);
      return res.status(500).json({ error: "Could not load athletes." });
    }
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const body = req.body || {};
  const firstName = text(body.firstName, 100, true);
  const lastName = text(body.lastName, 100, true);
  const birthdate = text(body.birthdate, 10, true);
  const gender = body.gender;
  const sportId = Number(body.sportId);
  const eventId = body.eventId ? Number(body.eventId) : null;
  const schoolName = text(body.school, 191);

  if (!firstName || !lastName || !birthdate || !["male", "female", "other", "prefer_not_to_say"].includes(gender) || !Number.isInteger(sportId) || (eventId !== null && !Number.isInteger(eventId))) {
    return res.status(400).json({ error: "Complete the required athlete fields with valid values." });
  }

  let coachId = Number(body.coachId);
  if (session.user.role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) } });
    if (!coach) return res.status(403).json({ error: "Coach profile not found." });
    coachId = coach.id;
  }
  if (!Number.isInteger(coachId)) return res.status(400).json({ error: "A coach assignment is required." });

  const [sport, event, coach, school] = await Promise.all([
    prisma.sport.findUnique({ where: { id: sportId } }),
    eventId ? prisma.event.findUnique({ where: { id: eventId } }) : null,
    prisma.coach.findUnique({ where: { id: coachId } }),
    schoolName ? prisma.school.findFirst({ where: { schoolName: { equals: schoolName, mode: "insensitive" }, status: "active" }, select: { id: true } }) : null,
  ]);

  if (!sport || sport.status !== "active" || !coach || coach.status !== "active" || (eventId && (!event || event.sportId !== sportId))) {
    return res.status(400).json({ error: "The selected sport, event, or coach is invalid." });
  }

  let schoolId = school?.id;
  if (schoolName && !schoolId) {
    const newSchool = await prisma.school.create({ data: { schoolName: schoolName, status: "active" }, select: { id: true } });
    schoolId = newSchool.id;
  }

  if (birthdate.length !== 10 || Number.isNaN(Date.parse(birthdate))) {
    return res.status(400).json({ error: "Provide a valid birthdate (YYYY-MM-DD)." });
  }

  try {
    const athlete = await prisma.$transaction(async (tx) => {
      const last = await tx.athlete.findFirst({ where: { athleteCode: { startsWith: "ATH-" } }, orderBy: { athleteCode: "desc" }, select: { athleteCode: true } });
      let nextNumber = 1;
      const match = last && last.athleteCode.match(/^ATH-(\d+)$/);
      if (match) nextNumber = Number(match[1]) + 1;
      const athleteCode = "ATH-" + String(nextNumber).padStart(6, "0");
      const created = await tx.athlete.create({
        data: {
          athleteCode,
          firstName,
          middleName: text(body.middleName, 100) || null,
          lastName,
          suffix: text(body.suffix, 20) || null,
          birthdate: new Date(birthdate),
          gender,
          contactNumber: text(body.contactNumber, 30) || null,
          email: validateEmail(body.email),
          address: text(body.address, 2000) || null,
          height: body.height !== undefined && body.height !== "" ? Number(body.height) : null,
          weight: body.weight !== undefined && body.weight !== "" ? Number(body.weight) : null,
          healthStatus: body.healthStatus !== undefined && ["healthy", "sick", "injured", "recovering", "inactive"].includes(body.healthStatus) ? body.healthStatus : "healthy",
          healthNotes: text(body.healthNotes, 2000) || null,
          schoolId,
          sportId,
          eventId,
          coachId,
          dateRegistered: new Date(),
        },
      });
      await tx.athleteCoachHistory.create({ data: { athleteId: created.id, coachId, assignedBy: Number(session.user.id), reason: "Initial assignment" } });
      await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "athlete", entityId: created.id, description: `Created athlete ${created.athleteCode}` } });
      return created;
    });
    return res.status(201).json(athlete);
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "That athlete code is already registered." });
    throw error;
  }
}