import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validateEmail, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (!["GET", "PUT"].includes(req.method)) return res.status(405).json({ error: "Method not allowed." });

  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const id = validId(req.query?.id);
  if (!id) return res.status(400).json({ error: "Invalid athlete ID." });
  if (req.method === "PUT" && !requireCsrf(req, res)) return;

  const basic = await prisma.athlete.findUnique({ where: { id }, select: { id: true, coachId: true } });
  if (!basic) return res.status(404).json({ error: "Athlete not found." });

  if (session.user.role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || basic.coachId !== coach.id) {
      return res.status(403).json({ error: "You do not have access to this athlete." });
    }
  }

  if (req.method === "PUT") {
    return await updateAthlete(req, res, session, id);
  }

  const athlete = await prisma.athlete.findUnique({
    where: { id },
    include: {
      sport: true,
      event: true,
      school: true,
      coach: { select: { id: true, coachCode: true, firstName: true, middleName: true, lastName: true, school: true } },
      assessments: {
        orderBy: { assessmentDate: "asc" },
        include: { results: { include: { metric: true } } },
      },
      statusHistory: { orderBy: { changedAt: "asc" }, include: { changer: { select: { email: true } } } },
      coachHistory: { orderBy: { startedAt: "asc" }, include: { coach: { select: { firstName: true, lastName: true, coachCode: true } }, assigner: { select: { email: true } } } },
      achievements: { orderBy: { achievementDate: "asc" } },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { username: true, email: true, coach: { select: { firstName: true, lastName: true } } } } },
      },
      participants: {
        where: { status: "active" },
        include: { eventPlan: { select: { id: true, eventName: true, startDate: true, endDate: true, status: true } }, sport: { select: { sportName: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return res.status(200).json({ athlete: JSON.parse(JSON.stringify(athlete)) });
}

async function updateAthlete(req, res, session, id) {
  const body = req.body || {};
  const firstName = text(body.firstName, 100);
  const lastName = text(body.lastName, 100);
  const batch = session.user.role === "admin" ? Number(body.coachId) : undefined;
  const sportId = Number(body.sportId);
  const eventId = body.eventId === "" || body.eventId === null || body.eventId === undefined ? null : Number(body.eventId);
  const schoolId = validId(body.schoolId);
  const status = ["active", "inactive"].includes(body.status) ? body.status : undefined;

  if (!firstName || !lastName || !Number.isInteger(sportId) || (eventId !== null && !Number.isInteger(eventId))) {
    return res.status(400).json({ error: "Provide valid first name, last name, and sport." });
  }

  if (body.birthdate !== undefined && (String(body.birthdate).length !== 10 || Number.isNaN(Date.parse(body.birthdate)))) {
    return res.status(400).json({ error: "Provide a valid birthdate (YYYY-MM-DD)." });
  }

  const [sport, event, coach] = await Promise.all([
    prisma.sport.findUnique({ where: { id: sportId }, select: { id: true, status: true } }),
    eventId ? prisma.event.findUnique({ where: { id: eventId }, select: { id: true, sportId: true } }) : null,
    batch ? prisma.coach.findUnique({ where: { id: batch }, select: { id: true, status: true } }) : null,
  ]);
  if (!sport || sport.status !== "active") return res.status(400).json({ error: "The selected sport is invalid." });
  if (eventId && (!event || event.sportId !== sportId)) return res.status(400).json({ error: "The selected event does not belong to that sport." });
  if (batch && (!coach || coach.status !== "active")) return res.status(400).json({ error: "The selected coach is invalid." });

  let coachId;
  if (batch) {
    coachId = batch;
  } else {
    const mine = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    coachId = mine ? mine.id : null;
  }
  if (!coachId) return res.status(400).json({ error: "A coach assignment is required." });

  const updated = await prisma.$transaction(async (tx) => {
    const before = await tx.athlete.findUnique({ where: { id }, select: { coachId: true } });
    const result = await tx.athlete.update({
      where: { id },
      data: {
        firstName,
        lastName,
        middleName: body.middleName !== undefined ? (text(body.middleName, 100) || null) : undefined,
        suffix: body.suffix !== undefined ? (text(body.suffix, 20) || null) : undefined,
        birthdate: body.birthdate ? new Date(body.birthdate) : undefined,
        gender: body.gender !== undefined ? (["male", "female", "other", "prefer_not_to_say"].includes(body.gender) ? body.gender : undefined) : undefined,
        contactNumber: body.contactNumber !== undefined ? (text(body.contactNumber, 30) || null) : undefined,
        email: body.email !== undefined ? (validateEmail(body.email) || null) : undefined,
        address: body.address !== undefined ? (text(body.address, 2000) || null) : undefined,
        schoolId,
        sportId,
        eventId,
        coachId,
        status: status ?? undefined,
      },
    });
    if (before && before.coachId !== coachId && session.user.role === "admin") {
      await tx.athleteCoachHistory.create({ data: { athleteId: id, coachId, assignedBy: Number(session.user.id), reason: "Reassigned via profile edit" } });
    }
    await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "update", entityType: "athlete", entityId: id, description: `Updated athlete #${id}` } });
    return result;
  });
  return res.status(200).json({ athlete: JSON.parse(JSON.stringify(updated)) });
}
