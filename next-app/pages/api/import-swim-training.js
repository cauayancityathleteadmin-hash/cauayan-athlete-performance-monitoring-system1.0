import { prisma } from "../../lib/prisma";

export const config = { maxDuration: 60 };

const PLAN_NAME = "Swimming Training";

function dbLabel() {
  const m = (process.env.DATABASE_URL || "").match(/@([^/]+)\/([^?]+)/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function activity(def, week, athleteBias) {
  const pct = 1 + week * 0.15 + athleteBias * 0.15;
  return {
    activityName: def.name,
    fitnessType: def.type,
    targetQuantity: def.qty ? Math.round(def.qty * pct) : null,
    targetUnit: def.qty ? def.unit : null,
    targetSets: def.sets ? Math.round(def.sets * pct) : null,
    targetReps: def.reps ? Math.round(def.reps * pct) : null,
    targetDistance: def.dist ? Math.round(def.dist * pct) : null,
    targetLoad: null,
    instructions: def.notes,
  };
}

const BASE_DEFS = [
  { name: "Endurance Pull Set", type: "endurance", qty: 6, unit: "attempts", dist: 500, notes: "Pull with buoy; steady pace, focus on rotation." },
  { name: "Skill Drills", type: "skill_technique", qty: 12, unit: "drills", notes: "Body-position and catch drills." },
  { name: "Sprint Paddles", type: "power", sets: 6, reps: 10, notes: "Short sprints with paddles; max effort, full recovery." },
  { name: "Kick Set", type: "endurance", dist: 800, notes: "Kickboard only; maintain form." },
  { name: "Streamline Underwaters", type: "mobility", qty: 8, unit: "attempts", notes: "Work on dolphin kick underwater." },
  { name: "Freestyle Technique", type: "skill_technique", qty: 10, unit: "laps", notes: "200m easy, 200m drill, 100m build." },
  { name: "Speed Work", type: "speed_agility", sets: 5, reps: 8, notes: "Hard 25m sprints with full recovery." },
  { name: "Recovery Swim", type: "recovery", dist: 600, notes: "Easy continuous swimming, deep breathing." },
  { name: "Strength Circuit", type: "strength", sets: 3, reps: 12, notes: "Dryland: push-ups, med-ball throws, band pulls." },
];

function buildActivities(athleteIdx) {
  const acts = [];
  let order = 0;
  for (let week = 1; week <= 2; week++) {
    BASE_DEFS.forEach((def) => {
      acts.push({
        ...activity(def, week, athleteIdx % 2),
        dayIndex: order % 9,
        weekNumber: week,
        orderIndex: order,
      });
      order++;
    });
  }
  return acts;
}

async function inspect() {
  const coach = await prisma.coach.findUnique({
    where: { coachCode: "COA-000011" },
    include: { user: { select: { id: true, email: true, status: true } } },
  });
  if (!coach) return { error: "COA-000011 coach not found" };
  const swim = await prisma.sport.findFirst({ where: { sportName: { equals: "Swimming", mode: "insensitive" } } });
  const athletes = swim
    ? await prisma.athlete.findMany({ where: { coachId: coach.id, sportId: swim.id } })
    : [];
  const existing = await prisma.trainingPlan.findFirst({ where: { coachId: coach.id, planName: PLAN_NAME } });
  return {
    db: dbLabel(),
    coach: {
      id: coach.id,
      userId: coach.userId,
      code: coach.coachCode,
      name: `${coach.firstName} ${coach.middleName ? coach.middleName + " " : ""}${coach.lastName}${coach.suffix ? " " + coach.suffix : ""}`,
      email: coach.email,
      status: coach.user?.status,
    },
    swimming: swim ? { sportId: swim.id, name: swim.sportName } : null,
    swimmingAthletes: athletes.map((a) => ({ id: a.id, code: a.athleteCode, name: `${a.firstName} ${a.lastName}`, eventId: a.eventId })),
    existingPlan: existing ? { id: existing.id, name: existing.planName, status: existing.status } : null,
  };
}

async function doImport() {
  const coach = await prisma.coach.findUnique({ where: { coachCode: "COA-000011" } });
  if (!coach) throw new Error("COA-000011 coach not found");
  const swim = await prisma.sport.findFirst({ where: { sportName: { equals: "Swimming", mode: "insensitive" } } });
  if (!swim) throw new Error("Swimming sport not found");
  const athletes = await prisma.athlete.findMany({ where: { coachId: coach.id, sportId: swim.id, status: "active" } });
  if (!athletes.length) throw new Error("no active swimming athletes under COA-000011");

  const existing = await prisma.trainingPlan.findFirst({ where: { coachId: coach.id, planName: PLAN_NAME } });
  if (existing) {
    const count = await prisma.planActivity.count({ where: { planId: existing.id } });
    if (count > 0) {
      return { duplicate: true, planId: existing.id, planName: PLAN_NAME, activityCount: count };
    }
    await prisma.trainingPlan.delete({ where: { id: existing.id } });
  }

  const rowsByAthlete = athletes.map((a, i) => buildActivities(i).map((r) => ({ ...r, athleteId: a.id })));

  const plan = await prisma.$transaction(async (tx) => {
    const p = await tx.trainingPlan.create({
      data: {
        planName: PLAN_NAME,
        description: "Swimming training plan (test) - 2 weeks, all swimming athletes of COA-000011",
        sportId: swim.id,
        coachId: coach.id,
        frequency: "week",
        durationWeeks: 2,
        startDate: new Date("2026-09-14T00:00:00.000Z"),
        endDate: new Date("2026-09-27T23:59:59.999Z"),
        status: "active",
        isTemplate: false,
      },
    });
    for (let i = 0; i < athletes.length; i++) {
      await tx.trainingPlanAthlete.create({ data: { planId: p.id, athleteId: athletes[i].id } });
      await tx.planActivity.createMany({ data: rowsByAthlete[i].map((r) => ({ ...r, planId: p.id })) });
    }
    await tx.auditLog.create({
      data: {
        userId: coach.userId,
        action: "create_training_plan",
        entityType: "TrainingPlan",
        entityId: p.id,
        description: `Created '${PLAN_NAME}' for ${athletes.length} athlete(s) (${rowsByAthlete.reduce((n, r) => n + r.length, 0)} activities) via import tool`,
      },
    });
    return p;
  });

  const activityCount = rowsByAthlete.reduce((n, r) => n + r.length, 0);
  const lines = athletes.map((a, i) => `${a.firstName} ${a.lastName}: ${rowsByAthlete[i].length} activities`);
  return { duplicate: false, planId: plan.id, planName: PLAN_NAME, athleteCount: athletes.length, activityCount, athletes: lines };
}

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const expected = `Bearer ${process.env.TEMP_SWIM_IMPORT_KEY || ""}`;
      if (!process.env.TEMP_SWIM_IMPORT_KEY || (req.headers.authorization || "") !== expected) {
        return res.status(403).json({ error: "forbidden" });
      }
      return res.status(200).json({ ok: true, result: await doImport() });
    }
    return res.status(200).json(await inspect());
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}