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

  if (req.method === "GET") return res.status(200).json(await prisma.athlete.findMany({ orderBy: { lastName: "asc" }, include: { school: true, sport: true, event: true, coach: true } }));
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const body = req.body || {};
  const athleteCode = text(body.athleteCode, 20, true);
  const firstName = text(body.firstName, 100, true);
  const lastName = text(body.lastName, 100, true);
  const birthdate = text(body.birthdate, 10, true);
  const gender = body.gender;
  const sportId = Number(body.sportId);
  const eventId = body.eventId ? Number(body.eventId) : null;
  const schoolName = text(body.school, 191);

  if (!athleteCode || !firstName || !lastName || !birthdate || !["male", "female", "other", "prefer_not_to_say"].includes(gender) || !Number.isInteger(sportId) || (eventId !== null && !Number.isInteger(eventId))) {
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

  try {
    const athlete = await prisma.$transaction(async (tx) => {
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