// Server-side builders for the official report data.
//
// The /reports page and the finalize/archive API must produce IDENTICAL
// snapshots, so the Prisma includes and serializers live here and nowhere else.

import { prisma } from "./prisma";
import { computeAchievementPoints } from "./points";
import { classifyFitnessValue } from "./starter-metrics";
import { loadNormOverrides } from "./fitness-norms";
import { buildTrainingDays, summarizeTrainingDays } from "./training-status";
import { FITNESS_LABEL } from "./report-labels";

export const ATHLETE_INCLUDE = {
  school: true,
  sport: true,
  event: true,
  coach: { select: { firstName: true, lastName: true, coachCode: true } },
  achievements: { orderBy: { achievementDate: "desc" }, include: { event: { select: { eventCategory: true } } }, take: 500 },
  notes: { orderBy: { createdAt: "desc" }, take: 20 },
  trainingAssessments: { orderBy: { assessmentDate: "desc" }, include: { plan: { select: { planName: true } } }, take: 20 },
  healthLogs: { orderBy: { reportedAt: "desc" }, include: { reporter: { select: { email: true } }, resolver: { select: { email: true } } }, take: 50 },
  coachHistory: { orderBy: { startedAt: "desc" }, include: { coach: { select: { firstName: true, lastName: true, coachCode: true } } }, take: 50 },
  statusHistory: { orderBy: { changedAt: "desc" }, take: 50 },
  trainingPerformances: { orderBy: { recordedAt: "desc" }, include: { exercise: { select: { exerciseName: true, category: true } }, recorder: { select: { email: true } } }, take: 100 },
  trainingPlans: { include: { plan: { include: { sport: true } } }, take: 50 },
  participants: { where: { status: "active" }, orderBy: { createdAt: "desc" }, include: { eventPlan: { select: { eventName: true, venue: true, status: true, startDate: true } }, sport: true }, take: 100 },
  _count: { select: { assessments: true, achievements: true, healthLogs: true } },
  assessments: { orderBy: { assessmentDate: "desc" }, include: { recorder: { select: { email: true, username: true } }, results: { include: { metric: true } } }, take: 500 },
};

export const COACH_INCLUDE = {
  school: true,
  sports: { include: { sport: true } },
  athletes: { select: { id: true, athleteCode: true, firstName: true, middleName: true, lastName: true, suffix: true, gender: true, birthdate: true, status: true, sport: { select: { sportName: true } }, event: { select: { eventName: true } } } },
  performances: { orderBy: { createdAt: "desc" }, include: { evaluator: { select: { username: true, email: true } } }, take: 50 },
  trainingPlans: { include: { sport: true, athletes: { select: { athleteId: true } } }, take: 50 },
  trainingSessions: { orderBy: { sessionDate: "desc" }, include: { sport: true }, take: 100 },
  applications: { orderBy: { appliedAt: "desc" }, include: { eventPlan: { select: { eventName: true, venue: true, status: true, startDate: true } } }, take: 100 },
  participants: { where: { status: "active" }, orderBy: { createdAt: "desc" }, include: { eventPlan: { select: { eventName: true, venue: true, status: true, startDate: true } }, sport: true, athlete: { select: { firstName: true, lastName: true, athleteCode: true } } }, take: 100 },
  _count: { select: { athletes: true, performances: true, trainingPlans: true, trainingSessions: true, applications: true, participants: { where: { status: "active" } } } },
};

function loggedResultValueRep(activity, log) {
  if (!activity || !log) return null;
  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  switch (activity.metricType) {
    case "time": return toNum(log.timeSec);
    case "distance": return toNum(log.distanceDone);
    case "load": return toNum(log.loadUsed);
    case "reps": return toNum(log.repsDone);
    case "sets": return toNum(log.setsDone);
    case "quantity": return toNum(log.quantityDone);
    default: return toNum(log.quantityDone);
  }
}

// Loads the plan-activity context needed by the athlete serializer. Only the
// athletes in `athleteIds` are queried, so finalizing one record stays cheap.
async function buildAthleteContext(athleteIds) {
  const [activityCounts, logCounts, normOverrides, activityLogs] = await Promise.all([
    athleteIds.length ? prisma.planActivity.groupBy({ by: ["athleteId"], where: { athleteId: { in: athleteIds } }, _count: { _all: true } }) : [],
    athleteIds.length ? prisma.planActivityLog.groupBy({ by: ["athleteId", "status"], where: { athleteId: { in: athleteIds } }, _count: { _all: true } }) : [],
    loadNormOverrides(),
    athleteIds.length ? prisma.planActivityLog.findMany({ where: { athleteId: { in: athleteIds } }, include: { activity: { select: { fitnessType: true, metricType: true } } }, orderBy: { performedAt: "asc" } }) : [],
  ]);
  const activityCountMap = new Map(activityCounts.map((x) => [x.athleteId, x._count._all]));
  const logCountMap = new Map();
  for (const row of logCounts) {
    if (!logCountMap.has(row.athleteId)) logCountMap.set(row.athleteId, { done: 0, partial: 0, missed: 0 });
    const entry = logCountMap.get(row.athleteId);
    if (["done", "partial", "missed"].includes(row.status)) entry[row.status] += row._count._all;
  }
  const logsByAthlete = new Map();
  for (const log of activityLogs) {
    if (!logsByAthlete.has(log.athleteId)) logsByAthlete.set(log.athleteId, []);
    logsByAthlete.get(log.athleteId).push(log);
  }

  const buildFitnessProfile = (athlete) => {
    const byType = new Map();
    for (const log of logsByAthlete.get(athlete.id) || []) {
      if (!log.activity?.fitnessType) continue;
      const value = loggedResultValueRep(log.activity, log);
      if (value == null) continue;
      const cls = classifyFitnessValue(log.activity.fitnessType, athlete.gender, athlete.birthdate, value, normOverrides);
      if (!cls) continue;
      const key = log.activity.fitnessType;
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key).push({ cls, performedAt: log.performedAt });
    }
    const result = [];
    for (const [fitnessType, items] of byType) {
      const sorted = items.sort((a, b) => new Date(a.performedAt) - new Date(b.performedAt));
      const latest = sorted[sorted.length - 1].cls;
      const first = sorted[0].cls;
      result.push({
        fitnessType,
        label: FITNESS_LABEL[fitnessType] || fitnessType,
        tierLabel: latest.label,
        rank: latest.rank,
        value: latest.value,
        unit: latest.unit,
        test: latest.test,
        date: sorted[sorted.length - 1].performedAt.toISOString(),
        nextTierLabel: latest.nextTierLabel,
        nextValue: latest.nextValue,
        unverified: latest.unverified,
        sourceNote: latest.sourceNote,
        delta: latest.rank - first.rank,
        count: sorted.length,
      });
    }
    return result.sort((x, y) => y.rank - x.rank);
  };

  return { activityCountMap, logCountMap, logsByAthlete, buildFitnessProfile };
}

export function serializeAthlete(athlete, ctx) {
  const { activityCountMap, logCountMap, buildFitnessProfile } = ctx;
  const fitnessProfile = buildFitnessProfile(athlete);
  const achievements = athlete.achievements.map((a) => ({
    title: a.achievementTitle,
    type: a.achievementType || null,
    medal: a.medal || null,
    level: a.level || null,
    date: a.achievementDate?.toISOString() || null,
    organization: a.organization || null,
    description: a.description || null,
    points: computeAchievementPoints(a),
  }));
  const completionLog = logCountMap.get(athlete.id) || { done: 0, partial: 0, missed: 0 };
  const planned = activityCountMap.get(athlete.id) || 0;
  const trainingDays = buildTrainingDays(ctx.logsByAthlete?.get(athlete.id) || []);
  const trainingStatus = summarizeTrainingDays(trainingDays);
  return {
    id: athlete.id,
    athleteCode: athlete.athleteCode,
    firstName: athlete.firstName,
    middleName: athlete.middleName,
    lastName: athlete.lastName,
    suffix: athlete.suffix || null,
    birthdate: athlete.birthdate.toISOString(),
    gender: athlete.gender,
    contactNumber: athlete.contactNumber || null,
    email: athlete.email || null,
    address: athlete.address || null,
    school: athlete.school?.schoolName || null,
    sport: athlete.sport.sportName,
    event: athlete.event?.eventName || null,
    coach: athlete.coach ? `${athlete.coach.lastName}, ${athlete.coach.firstName}` : null,
    coachCode: athlete.coach?.coachCode || null,
    status: athlete.status,
    height: athlete.height?.toString?.() || null,
    weight: athlete.weight?.toString?.() || null,
    healthStatus: athlete.healthStatus,
    healthNotes: athlete.healthNotes || null,
    dateRegistered: athlete.dateRegistered?.toISOString() || null,
    updatedAt: athlete.updatedAt?.toISOString() || null,
    assessmentCount: athlete._count.assessments,
    achievementCount: athlete._count.achievements,
    achievements,
    pointsTotal: achievements.reduce((s, a) => s + a.points, 0),
    notes: athlete.notes.map((n) => ({ note: n.note, author: n.author?.email || null, date: n.createdAt.toISOString() })),
    trainingAssessments: athlete.trainingAssessments.map((t) => ({ rating: t.rating, fitness: t.fitnessDimension || "general", dates: t.assessmentDate.toISOString(), plan: t.plan?.planName || null, comments: t.comments || null })),
    assessments: athlete.assessments.map((assessment) => ({
      id: assessment.id,
      assessmentDate: assessment.assessmentDate.toISOString(),
      assessmentType: assessment.assessmentType,
      remarks: assessment.remarks || null,
      recorder: assessment.recorder?.username || assessment.recorder?.email || null,
      results: assessment.results.map((result) => ({ metricName: result.metric.metricName, unit: result.metric.unit, valueDecimal: result.valueDecimal?.toString() || null, valueText: result.valueText || null, notes: result.notes || null })),
    })),
    healthLogs: athlete.healthLogs.map((h) => ({ status: h.status, description: h.description || null, reportedAt: h.reportedAt.toISOString(), reportedBy: h.reporter?.email || null, resolvedAt: h.resolvedAt?.toISOString() || null, resolvedBy: h.resolver?.email || null })),
    coachHistory: athlete.coachHistory.map((h) => ({ coachName: h.coach ? `${h.coach.lastName}, ${h.coach.firstName}` : null, coachCode: h.coach?.coachCode || null, startedAt: h.startedAt.toISOString(), endedAt: h.endedAt?.toISOString() || null, reason: h.reason || null })),
    statusHistory: athlete.statusHistory.map((s) => ({ from: s.oldStatus || null, to: s.newStatus, changedAt: s.changedAt.toISOString(), reason: s.reason || null })),
    trainingDays: trainingDays.map((d) => ({ day: d.day, status: d.status, reason: d.reason, counts: d.counts })),
    trainingStatus,
    exercisePerformances: athlete.trainingPerformances.map((p) => ({
      exerciseName: p.exercise.exerciseName,
      category: p.exercise.category,
      score: p.score?.toString() || null,
      rpe: p.rpe ?? null,
      sets: p.setsCompleted ?? null,
      reps: p.repsCompleted ?? null,
      load: p.loadUsed?.toString() || null,
      duration: p.durationSec ?? null,
      distance: p.distanceCovered?.toString() || null,
      notes: p.notes || null,
      recordedAt: p.recordedAt.toISOString(),
      recordedBy: p.recorder?.email || null,
    })),
    plans: athlete.trainingPlans.map((t) => ({ planName: t.plan.planName, sport: t.plan.sport.sportName, status: t.plan.status, startDate: t.plan.startDate?.toISOString() || null, endDate: t.plan.endDate?.toISOString() || null })),
    participants: athlete.participants.map((p) => ({ eventName: p.eventPlan.eventName, venue: p.eventPlan.venue, status: p.eventPlan.status, startDate: p.eventPlan.startDate?.toISOString() || null, sport: p.sport.sportName })),
    completion: {
      planned,
      done: completionLog.done,
      partial: completionLog.partial,
      missed: completionLog.missed,
      open: planned - (completionLog.done + completionLog.partial + completionLog.missed),
      percent: planned ? Math.round(((completionLog.done + completionLog.partial) / planned) * 100) : null,
    },
    fitnessProfile,
  };
}

export function serializeCoach(coach) {
  return {
    id: coach.id,
    coachCode: coach.coachCode,
    firstName: coach.firstName,
    middleName: coach.middleName,
    lastName: coach.lastName,
    suffix: coach.suffix || null,
    birthdate: coach.birthdate.toISOString(),
    email: coach.email,
    contactNumber: coach.contactNumber || null,
    school: coach.school?.schoolName || null,
    status: coach.status,
    dateRegistered: coach.dateRegistered.toISOString(),
    updatedAt: coach.updatedAt?.toISOString() || null,
    sports: coach.sports.map((s) => s.sport.sportName),
    athleteCount: coach._count.athletes,
    evalCount: coach._count.performances,
    planCount: coach._count.trainingPlans,
    sessionCount: coach._count.trainingSessions,
    applicationCount: coach._count.applications,
    participantCount: coach._count.participants,
    athletes: coach.athletes.map((a) => ({
      athleteCode: a.athleteCode,
      name: `${a.lastName}, ${a.firstName}${a.middleName ? ` ${a.middleName}` : ""}${a.suffix ? ` ${a.suffix}` : ""}`,
      sport: a.sport.sportName,
      event: a.event?.eventName || null,
      status: a.status,
      gender: a.gender,
      birthdate: a.birthdate?.toISOString() || null,
    })),
    performances: coach.performances.map((p) => ({
      periodStart: p.periodStart.toISOString(),
      periodEnd: p.periodEnd.toISOString(),
      sessionPlanning: p.sessionPlanning,
      exerciseSelection: p.exerciseSelection,
      technicalInstruction: p.technicalInstruction,
      athleteDevelopment: p.athleteDevelopment,
      communication: p.communication,
      safetyCompliance: p.safetyCompliance,
      trainingImplementation: p.trainingImplementation,
      overallScore: p.overallScore.toString(),
      strengths: p.strengths || null,
      areasForImprovement: p.areasForImprovement || null,
      actionPlan: p.actionPlan || null,
      evaluator: p.evaluator?.username || p.evaluator?.email || null,
    })),
    trainingPlans: coach.trainingPlans.map((p) => ({ title: p.planName, sport: p.sport.sportName, status: p.status, startDate: p.startDate?.toISOString() || null, endDate: p.endDate?.toISOString() || null, athleteCount: p.athletes.length })),
    trainingSessions: coach.trainingSessions.map((s) => ({ sessionDate: s.sessionDate.toISOString(), sessionType: s.sessionType, sport: s.sport.sportName, venue: s.venue || null, notes: s.notes || null })),
    applications: coach.applications.map((a) => ({ eventName: a.eventPlan.eventName, venue: a.eventPlan.venue, status: a.eventPlan.status, startDate: a.eventPlan.startDate?.toISOString() || null, appliedAt: a.appliedAt.toISOString() })),
    participants: coach.participants.map((p) => ({ eventName: p.eventPlan.eventName, venue: p.eventPlan.venue, status: p.eventPlan.status, startDate: p.eventPlan.startDate?.toISOString() || null, sport: p.sport.sportName, athlete: p.athlete ? `${p.athlete.lastName}, ${p.athlete.firstName}${p.athlete.athleteCode ? ` (${p.athlete.athleteCode})` : ""}` : null })),
  };
}

// Full report payload for /reports (admin: every athlete and coach; coach: own athletes).
export async function loadReportData({ isAdmin, userId }) {
  let athletes = [];
  let coaches = [];
  if (isAdmin) {
    [athletes, coaches] = await Promise.all([
      prisma.athlete.findMany({ orderBy: { lastName: "asc" }, include: ATHLETE_INCLUDE }),
      prisma.coach.findMany({ orderBy: { lastName: "asc" }, include: COACH_INCLUDE }),
    ]);
  } else {
    athletes = await prisma.athlete.findMany({
      where: { coach: { userId: Number(userId) } },
      orderBy: { lastName: "asc" },
      include: ATHLETE_INCLUDE,
    });
  }
  const ctx = await buildAthleteContext(athletes.map((a) => a.id));
  return {
    athletes: athletes.map((a) => serializeAthlete(a, ctx)),
    coaches: coaches.map(serializeCoach),
  };
}

// Rebuilds exactly one athlete snapshot from current data (used by finalize).
export async function loadAthleteReportSubject(athleteId) {
  const athlete = await prisma.athlete.findUnique({ where: { id: Number(athleteId) }, include: ATHLETE_INCLUDE });
  if (!athlete) return null;
  const ctx = await buildAthleteContext([athlete.id]);
  return serializeAthlete(athlete, ctx);
}

// Rebuilds exactly one coach snapshot from current data (used by finalize).
export async function loadCoachReportSubject(coachId) {
  const coach = await prisma.coach.findUnique({ where: { id: Number(coachId) }, include: COACH_INCLUDE });
  return coach ? serializeCoach(coach) : null;
}
