import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

const SESSION_TYPES = ["regular", "conditioning", "technical", "tactical", "recovery", "competition_simulation", "tryout"];
const CATEGORIES = ["warmup", "mobility", "strength", "power", "speed_agility", "endurance", "skill_technique", "tactical", "cooldown", "recovery"];
const ATTENDANCE = ["present", "late", "absent", "excused"];

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method === "GET") {
    const userRole = session.user.role;
    let sessions;
    if (userRole === "admin") {
      sessions = await prisma.trainingSession.findMany({
        orderBy: { sessionDate: "desc" },
        include: { sport: { select: { id: true, sportName: true } }, coach: { select: { id: true, coachCode: true, firstName: true, lastName: true } }, exercises: true, attendances: { select: { id: true, status: true, athleteId: true } } },
      });
    } else {
      const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
      sessions = await prisma.trainingSession.findMany({
        where: coach ? { coachId: coach.id } : { coachId: -1 },
        orderBy: { sessionDate: "desc" },
        include: { sport: { select: { id: true, sportName: true } }, coach: { select: { id: true, coachCode: true, firstName: true, lastName: true } }, exercises: true, attendances: { select: { id: true, status: true, athleteId: true } } },
      });
    }
    return res.status(200).json(JSON.parse(JSON.stringify(sessions)));
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;
  if (!requireRole(session, "admin", res)) return;

  const body = req.body || {};
  const sessionDate = text(body.sessionDate, 10, true);
  if (!sessionDate) return res.status(400).json({ error: "Training date is required." });
  const sportId = validId(body.sportId);
  const coachId = validId(body.coachId);
  if (!sportId || !coachId) return res.status(400).json({ error: "A valid sport and coach are required." });
  const sport = await prisma.sport.findUnique({ where: { id: sportId, status: "active" }, select: { id: true } });
  if (!sport) return res.status(400).json({ error: "Selected sport is invalid." });
  const coach = await prisma.coach.findUnique({ where: { id: coachId, status: "active" }, select: { id: true } });
  if (!coach) return res.status(400).json({ error: "Selected coach is invalid." });

  const startParam = text(body.startTime, 10) || null;
  const endParam = text(body.endTime, 10) || null;

  const created = await prisma.$transaction(async (tx) => {
    const tr = await tx.trainingSession.create({
      data: {
        sessionDate: new Date(sessionDate),
        startTime: startParam ? new Date(`${sessionDate}T${startParam}:00`) : null,
        endTime: endParam ? new Date(`${sessionDate}T${endParam}:00`) : null,
        sessionType: SESSION_TYPES.includes(body.sessionType) ? body.sessionType : "regular",
        sportId,
        coachId,
        venue: text(body.venue, 191) || null,
        notes: text(body.notes, 2000) || null,
      },
      select: { id: true },
    });
    if (Array.isArray(body.exercises)) {
      const exercises = body.exercises.slice(0, 100).map((ex, index) => ({
        sessionId: tr.id,
        exerciseName: text(ex.exerciseName, 191, true),
        category: CATEGORIES.includes(ex.category) ? ex.category : "skill",
        description: text(ex.description, 2000) || null,
        orderIndex: index,
        targetSets: ex.targetSets === undefined || ex.targetSets === "" ? null : Number(ex.targetSets),
        targetReps: ex.targetReps === undefined || ex.targetReps === "" ? null : Number(ex.targetReps),
        targetDuration: ex.targetDuration === undefined || ex.targetDuration === "" ? null : Number(ex.targetDuration),
        targetLoad: ex.targetLoad === undefined || ex.targetLoad === "" ? null : Number(ex.targetLoad),
        targetDistance: ex.targetDistance === undefined || ex.targetDistance === "" ? null : Number(ex.targetDistance),
        targetHeartRate: ex.targetHeartRate === undefined || ex.targetHeartRate === "" ? null : Number(ex.targetHeartRate),
        equipment: text(ex.equipment, 191) || null,
      })).filter((ex) => ex.exerciseName);
      if (exercises.length) {
        await tx.trainingExercise.createMany({ data: exercises });
      }
    }
    if (Array.isArray(body.athleteIds)) {
      const athleteIds = [...new Set(body.athleteIds.map(validId).filter(Boolean))];
      if (athleteIds.length) {
        const athletes = await tx.athlete.findMany({ where: { id: { in: athleteIds }, status: "active" }, select: { id: true } });
        if (athletes.length) {
          await tx.trainingAttendance.createMany({ data: athletes.map((a) => ({ sessionId: tr.id, athleteId: a.id })) });
        }
      }
    }
    await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "trainingSession", entityId: tr.id, description: `Created a training session for ${new Date(sessionDate).toDateString()}` } });
    return tr.id;
  });

  const full = await prisma.trainingSession.findUnique({
    where: { id: created },
    include: { sport: { select: { id: true, sportName: true } }, coach: { select: { id: true, coachCode: true, firstName: true, lastName: true } }, exercises: { orderBy: { orderIndex: "asc" } }, attendances: { include: { athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } } } } },
  });
  return res.status(201).json(JSON.parse(JSON.stringify(full)));
}