import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from "recharts";
import { prisma } from "../lib/prisma";
import { gsspData } from "../lib/gssp-cache";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const isAdmin = session.user.role === "admin";

  let cacheKey = isAdmin ? "reports:a" : null;
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach) return { redirect: { destination: "/dashboard", permanent: false } };
    cacheKey = `reports:c:${coach.id}`;
  }

  const data = await gsspData(cacheKey, 30000, async () => {
    const athleteInclude = {
      school: true,
      sport: true,
      event: true,
      coach: { select: { firstName: true, lastName: true, coachCode: true } },
      achievements: { orderBy: { achievementDate: "desc" }, take: 500 },
      notes: { orderBy: { createdAt: "desc" }, take: 20 },
      trainingAssessments: { orderBy: { assessmentDate: "desc" }, include: { plan: { select: { planName: true } } }, take: 20 },
      healthLogs: { orderBy: { reportedAt: "desc" }, include: { reporter: { select: { email: true } }, resolver: { select: { email: true } } }, take: 50 },
      coachHistory: { orderBy: { startedAt: "desc" }, include: { coach: { select: { firstName: true, lastName: true, coachCode: true } } }, take: 50 },
      statusHistory: { orderBy: { changedAt: "desc" }, take: 50 },
      trainingAttendances: { orderBy: { session: { sessionDate: "desc" } }, include: { session: { select: { sessionDate: true, sessionType: true, sport: { select: { sportName: true } } } } }, take: 200 },
      trainingPerformances: { orderBy: { recordedAt: "desc" }, include: { exercise: { select: { exerciseName: true, category: true } }, recorder: { select: { email: true } } }, take: 100 },
      trainingPlans: { include: { plan: { include: { sport: true } } }, take: 50 },
      participants: { orderBy: { createdAt: "desc" }, include: { eventPlan: { select: { eventName: true, venue: true, status: true, startDate: true } }, sport: true }, take: 100 },
      _count: { select: { assessments: true, achievements: true, healthLogs: true, trainingAttendances: true } },
      assessments: { orderBy: { assessmentDate: "desc" }, include: { recorder: { select: { email: true, username: true } }, results: { include: { metric: true } } }, take: 500 },
    };

    let athletes = [];
    let coaches = [];
    if (isAdmin) {
      [athletes, coaches] = await Promise.all([
        prisma.athlete.findMany({ orderBy: { lastName: "asc" }, include: athleteInclude }),
        prisma.coach.findMany({
          orderBy: { lastName: "asc" },
          include: {
            school: true,
            sports: { include: { sport: true } },
            athletes: { select: { id: true, athleteCode: true, firstName: true, middleName: true, lastName: true, suffix: true, gender: true, birthdate: true, status: true, sport: { select: { sportName: true } }, event: { select: { eventName: true } } } },
            performances: { orderBy: { createdAt: "desc" }, include: { evaluator: { select: { username: true, email: true } } }, take: 50 },
            trainingPlans: { include: { sport: true, athletes: { select: { athleteId: true } } }, take: 50 },
            trainingSessions: { orderBy: { sessionDate: "desc" }, include: { sport: true, _count: { select: { attendances: true } } }, take: 100 },
            applications: { orderBy: { appliedAt: "desc" }, include: { eventPlan: { select: { eventName: true, venue: true, status: true, startDate: true } } }, take: 100 },
            participants: { orderBy: { createdAt: "desc" }, include: { eventPlan: { select: { eventName: true, venue: true, status: true, startDate: true } }, sport: true, athlete: { select: { firstName: true, lastName: true, athleteCode: true } } }, take: 100 },
            _count: { select: { athletes: true, performances: true, trainingPlans: true, trainingSessions: true, applications: true, participants: true } },
          },
        }),
      ]);
    } else {
      athletes = await prisma.athlete.findMany({
        where: { coach: { userId: Number(session.user.id) } },
        orderBy: { lastName: "asc" },
        include: athleteInclude,
      });
    }

    const athleteIds = athletes.map((a) => a.id);
    const [activityCounts, logCounts, attendanceCounts, pointsConfig] = await Promise.all([
      athleteIds.length ? prisma.planActivity.groupBy({ by: ["athleteId"], where: { athleteId: { in: athleteIds } }, _count: { _all: true } }) : [],
      athleteIds.length ? prisma.planActivityLog.groupBy({ by: ["athleteId", "status"], where: { athleteId: { in: athleteIds } }, _count: { _all: true } }) : [],
      athleteIds.length ? prisma.trainingAttendance.groupBy({ by: ["athleteId", "status"], where: { athleteId: { in: athleteIds } }, _count: { _all: true } }) : [],
      prisma.pointsConfig.findMany(),
    ]);
    const activityCountMap = new Map(activityCounts.map((x) => [x.athleteId, x._count._all]));
    const logCountMap = new Map();
    for (const row of logCounts) {
      if (!logCountMap.has(row.athleteId)) logCountMap.set(row.athleteId, { done: 0, partial: 0, missed: 0 });
      const entry = logCountMap.get(row.athleteId);
      if (["done", "partial", "missed"].includes(row.status)) entry[row.status] += row._count._all;
    }
    const attendanceMap = new Map();
    for (const row of attendanceCounts) {
      if (!attendanceMap.has(row.athleteId)) attendanceMap.set(row.athleteId, { present: 0, late: 0, excused: 0, absent: 0 });
      const entry = attendanceMap.get(row.athleteId);
      if (["present", "late", "excused", "absent"].includes(row.status)) entry[row.status] += row._count._all;
    }
    const pointsMap = new Map(pointsConfig.map((pc) => [`${(pc.medal || "").toLowerCase().trim()}|${(pc.level || "").toLowerCase().trim()}`, pc.points]));
    const achievementPoints = (a) => (a.medal && a.level ? pointsMap.get(`${a.medal.toLowerCase()}|${a.level.toLowerCase()}`) || 0 : 0);

    const serializeAthlete = (athlete) => {
      const achievements = athlete.achievements.map((a) => ({
        title: a.achievementTitle,
        type: a.achievementType || null,
        medal: a.medal || null,
        level: a.level || null,
        date: a.achievementDate?.toISOString() || null,
        organization: a.organization || null,
        description: a.description || null,
        points: achievementPoints(a),
      }));
      const completionLog = logCountMap.get(athlete.id) || { done: 0, partial: 0, missed: 0 };
      const planned = activityCountMap.get(athlete.id) || 0;
      const attendance = attendanceMap.get(athlete.id) || { present: 0, late: 0, excused: 0, absent: 0 };
      const attendanceEntries = athlete.trainingAttendances.map((ta) => ({ date: ta.session.sessionDate.toISOString(), type: ta.session.sessionType, sport: ta.session.sport.sportName }));
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
        attendance,
        attendanceCount: athlete._count.trainingAttendances,
        attendanceEntries,
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
      };
    };

    const serializeCoach = (coach) => ({
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
      trainingSessions: coach.trainingSessions.map((s) => ({ sessionDate: s.sessionDate.toISOString(), sessionType: s.sessionType, sport: s.sport.sportName, venue: s.venue || null, notes: s.notes || null, attendance: s._count.attendances })),
      applications: coach.applications.map((a) => ({ eventName: a.eventPlan.eventName, venue: a.eventPlan.venue, status: a.eventPlan.status, startDate: a.eventPlan.startDate?.toISOString() || null, appliedAt: a.appliedAt.toISOString() })),
      participants: coach.participants.map((p) => ({ eventName: p.eventPlan.eventName, venue: p.eventPlan.venue, status: p.eventPlan.status, startDate: p.eventPlan.startDate?.toISOString() || null, sport: p.sport.sportName, athlete: p.athlete ? `${p.athlete.lastName}, ${p.athlete.firstName}${p.athlete.athleteCode ? ` (${p.athlete.athleteCode})` : ""}` : null })),
    });

    return {
      athletes: athletes.map(serializeAthlete),
      coaches: coaches.map(serializeCoach),
    };
  });

  return {
    props: {
      session,
      isAdmin,
      ...data,
    },
  };
}

function formatDate(value) {
  const date = new Date(value);
  return isNaN(date) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value) {
  const date = new Date(value);
  return isNaN(date) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function computeAge(value) {
  const d = new Date(value);
  if (isNaN(d)) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

function bmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal weight";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

const GENDER_LABEL = { male: "Male", female: "Female", other: "Other", prefer_not_to_say: "Prefer not to say" };
const STATUS_LABEL = { active: "Active", inactive: "Inactive", pending: "Pending", draft: "Draft", open: "Open", closed: "Closed", cancelled: "Cancelled", approved: "Approved", rejected: "Rejected" };
const HEALTH_LABEL = { healthy: "Healthy", injured: "Injured", recovering: "Recovering", sick: "Sick", inactive: "Inactive" };
const ATTENDANCE_LABEL = { present: "Present", late: "Late", excused: "Excused", absent: "Absent" };
const SESSION_TYPE_LABEL = {
  regular: "Regular",
  conditioning: "Conditioning",
  technical: "Technical",
  tactical: "Tactical",
  recovery: "Recovery",
  competition_simulation: "Competition Simulation",
  tryout: "Tryout",
};
const FITNESS_LABEL = {
  endurance: "Endurance",
  strength: "Strength",
  power: "Power",
  speed_agility: "Speed / Agility",
  skill_technique: "Skill / Technique",
  mobility: "Mobility",
  recovery: "Recovery",
  general: "General",
};
const EXERCISE_CATEGORY_LABEL = {
  warmup: "Warm-up",
  mobility: "Mobility",
  strength: "Strength",
  power: "Power",
  speed_agility: "Speed / Agility",
  endurance: "Endurance",
  skill_technique: "Skill / Technique",
  tactical: "Tactical",
  cooldown: "Cool-down",
  recovery: "Recovery",
};

const ATH_SORT_COLS = {
  name: (a) => `${a.lastName}, ${a.firstName}`.toLowerCase(),
  code: (a) => a.athleteCode.toLowerCase(),
  sport: (a) => (a.sport || "").toLowerCase(),
  event: (a) => (a.event || "").toLowerCase(),
  coach: (a) => (a.coach || "").toLowerCase(),
  school: (a) => (a.school || "").toLowerCase(),
  status: (a) => (STATUS_LABEL[a.status] || a.status || "").toLowerCase(),
  registered: (a) => (a.dateRegistered || ""),
  assessments: (a) => a.assessmentCount,
};

function RdSection({ num, title, meta, children }) {
  return (
    <section>
      <div className="rd-section-title"><span className="rd-sec-no">{num}</span>{title}{meta ? <span>{meta}</span> : null}</div>
      {children}
    </section>
  );
}

function AthleteReportCard({ athlete, session, from, to, prefix }) {
  const windowed = athlete.assessments.filter((assessment) => (!from || assessment.assessmentDate >= new Date(from).toISOString()) && (!to || assessment.assessmentDate <= new Date(new Date(to).getTime() + 86400000).toISOString()));
  const last = athlete.assessments[0];
  const reportRef = `${prefix}${athlete.athleteCode}-${from || "all"}${to ? `-${to}` : ""}`;
  const issued = formatDate(new Date().toISOString());
  const periodLabel = `${from ? formatDate(new Date(from).toISOString()) : "earliest"} to ${to ? formatDate(new Date(to).toISOString()) : "latest"}`;
  const heightM = athlete.height ? Number(athlete.height) : null;
  const weightKg = athlete.weight ? Number(athlete.weight) : null;
  const bmi = heightM && weightKg ? Math.round((weightKg / (heightM * heightM)) * 10) / 10 : null;
  const bmiClass = bmiCategory(bmi);
  const age = computeAge(athlete.birthdate);
  const attendanceTotal = athlete.attendance ? athlete.attendance.present + athlete.attendance.late + athlete.attendance.excused + athlete.attendance.absent : 0;
  const attendanceRate = attendanceTotal
    ? Math.round(((athlete.attendance.present + athlete.attendance.late + athlete.attendance.excused) / attendanceTotal) * 100)
    : null;
  const activePlans = athlete.plans.filter((p) => p.status === "active");

  return (
    <article className="report-doc" key={athlete.id}>
      <header className="rd-header">
        <img src="/cauayan logo.png" alt="Official Seal of the City Government of Cauayan" className="rd-logo" />
        <div className="rd-header-text">
          <p className="rd-republic">Republic of the Philippines</p>
          <p className="rd-province">Province of Isabela</p>
          <h1 className="rd-lgu">City Government of Cauayan</h1>
          <p className="rd-office">City Sports Development Office</p>
          <p className="rd-address">Cauayan City, Isabela, Philippines</p>
        </div>
      </header>

      <h2 className="rd-title">Athlete Official Personnel Record</h2>
      <p className="rd-ref">Record No.: <span>{reportRef}</span> &nbsp;·&nbsp; Date Issued: <span>{issued}</span></p>

      <RdSection num="I." title="Personal Information">
        <table className="rd-info">
          <tbody>
            <tr>
              <th>Full Name</th>
              <td>{athlete.lastName}, {athlete.firstName}{athlete.middleName ? ` ${athlete.middleName}` : ""}{athlete.suffix ? ` ${athlete.suffix}` : ""}</td>
              <th>Athlete Code</th>
              <td>{athlete.athleteCode}</td>
            </tr>
            <tr>
              <th>Date of Birth</th>
              <td>{formatDate(athlete.birthdate)}</td>
              <th>Age / Sex</th>
              <td>{age != null ? `${age} years` : "—"} / {GENDER_LABEL[athlete.gender] || athlete.gender}</td>
            </tr>
            <tr>
              <th>Civil Status</th>
              <td colSpan="3">—</td>
            </tr>
            <tr>
              <th>Permanent Address</th>
              <td colSpan="3">{athlete.address || "—"}</td>
            </tr>
            <tr>
              <th>Contact No.</th>
              <td>{athlete.contactNumber || "—"}</td>
              <th>Email Address</th>
              <td>{athlete.email || "—"}</td>
            </tr>
            <tr>
              <th>Record Status</th>
              <td>{STATUS_LABEL[athlete.status] || athlete.status}</td>
              <th>Date Registered</th>
              <td>{athlete.dateRegistered ? formatDate(athlete.dateRegistered) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </RdSection>

      <RdSection num="II." title="Classification and Assignment">
        <table className="rd-info">
          <tbody>
            <tr>
              <th>Sport</th>
              <td>{athlete.sport || "—"}</td>
              <th>Event / Discipline</th>
              <td>{athlete.event || "—"}</td>
            </tr>
            <tr>
              <th>School / Institution</th>
              <td>{athlete.school || "—"}</td>
              <th>Head Coach</th>
              <td>{athlete.coach || "—"}</td>
            </tr>
          </tbody>
        </table>

        {athlete.coachHistory.length > 0 && (
          <>
            <div className="rd-sub-section">Coach Assignment History</div>
            <table className="rd-results">
              <thead><tr><th>Coach</th><th>Code</th><th>From</th><th>To</th><th>Reason / Remarks</th></tr></thead>
              <tbody>{athlete.coachHistory.slice(0, 20).map((h, i) => <tr key={i}><td>{h.coachName || "—"}</td><td>{h.coachCode || "—"}</td><td>{formatDate(h.startedAt)}</td><td>{h.endedAt ? formatDate(h.endedAt) : "Current"}</td><td>{h.reason || "—"}</td></tr>)}</tbody>
            </table>
          </>
        )}

        {athlete.statusHistory.length > 0 && (
          <>
            <div className="rd-sub-section">Status History</div>
            <table className="rd-results">
              <thead><tr><th>Changed From</th><th>Changed To</th><th>Date</th><th>Reason / Remarks</th></tr></thead>
              <tbody>{athlete.statusHistory.slice(0, 20).map((s, i) => <tr key={i}><td>{s.from ? STATUS_LABEL[s.from] || s.from : "—"}</td><td>{STATUS_LABEL[s.to] || s.to}</td><td>{formatDate(s.changedAt)}</td><td>{s.reason || "—"}</td></tr>)}</tbody>
            </table>
          </>
        )}
      </RdSection>

      <RdSection num="III." title="Physical and Health Profile">
        <table className="rd-info">
          <tbody>
            <tr>
              <th>Height</th>
              <td>{heightM ? `${heightM} m` : "—"}</td>
              <th>Weight</th>
              <td>{weightKg ? `${weightKg} kg` : "—"}</td>
            </tr>
            <tr>
              <th>Body Mass Index</th>
              <td>{bmi != null ? `${bmi} (${bmiClass})` : "—"}</td>
              <th>Health Status</th>
              <td>{HEALTH_LABEL[athlete.healthStatus] || athlete.healthStatus}</td>
            </tr>
            <tr>
              <th>Health Notes</th>
              <td colSpan="3">{athlete.healthNotes || "—"}</td>
            </tr>
          </tbody>
        </table>

        {athlete.healthLogs.length > 0 && (
          <>
            <div className="rd-sub-section">Health Log History</div>
            <table className="rd-results">
              <thead><tr><th>Date Reported</th><th>Status</th><th>Description</th><th>Date Resolved</th></tr></thead>
              <tbody>{athlete.healthLogs.slice(0, 30).map((h, i) => <tr key={i}><td>{formatDate(h.reportedAt)}</td><td>{HEALTH_LABEL[h.status] || h.status}</td><td>{h.description || "—"}</td><td>{h.resolvedAt ? formatDate(h.resolvedAt) : "Open"}</td></tr>)}</tbody>
            </table>
          </>
        )}
      </RdSection>

      <RdSection num="IV." title="Performance Record" meta={`Covering period: ${periodLabel} · ${windowed.length} assessment record(s)`}>
        {windowed.length ? windowed.map((assessment) => (
          <div className="rd-assessment" key={assessment.id}>
            <div className="rd-assessment-head">{formatDate(assessment.assessmentDate)} &mdash; {assessment.assessmentType}{assessment.recorder ? <small> &middot; Recorded by {assessment.recorder}</small> : null}</div>
            <table className="rd-results">
              <thead><tr><th>Metric</th><th>Result</th></tr></thead>
              <tbody>{assessment.results.length ? assessment.results.map((result, i) => <tr key={i}><td>{result.metricName}</td><td className="num"><strong>{result.valueDecimal !== null && result.valueDecimal !== undefined ? Number(result.valueDecimal) + (result.unit ? ` ${result.unit}` : "") : (result.valueText || "—")}</strong>{result.notes ? <p className="rd-empty" style={{ margin: "2px 0 0" }}>{result.notes}</p> : null}</td></tr>) : <tr><td colSpan="2" className="rd-empty">No results recorded.</td></tr>}</tbody>
            </table>
            {assessment.remarks ? <p className="rd-empty" style={{ marginTop: 6 }}>Remarks: {assessment.remarks}</p> : null}
          </div>
        )) : <p className="rd-empty">No assessments were found within the selected date window.</p>}
      </RdSection>

      {athlete.trainingAssessments.length > 0 && (
        <RdSection num="V." title="Training Assessments and Fitness Ratings" meta={`${athlete.trainingAssessments.length} record(s)`}>
          <table className="rd-results">
            <thead><tr><th>Training Plan</th><th>Date Assessed</th><th>Fitness Dimension</th><th>Rating</th><th>Comments</th></tr></thead>
            <tbody>{athlete.trainingAssessments.slice(0, 20).map((t, i) => <tr key={i}><td>{t.plan || "—"}</td><td>{formatDate(t.dates)}</td><td>{FITNESS_LABEL[t.fitness] || t.fitness}</td><td className="num">{t.rating}/10</td><td>{t.comments || "—"}</td></tr>)}</tbody>
          </table>
        </RdSection>
      )}

      <RdSection num="VI." title="Training Plans, Activities and Attendance">
        <div className="rd-grid">
          <div className="rd-grid-item">
            <div className="rd-kpi-label">Plan Activity Completion</div>
            <div className="rd-kpi-value">{athlete.completion.percent != null ? `${athlete.completion.percent}%` : "—"}</div>
            <div className="rd-kpi-note">{athlete.completion.planned} planned · {athlete.completion.done} done · {athlete.completion.partial} partial · {athlete.completion.missed} missed · {athlete.completion.open} open</div>
          </div>
          <div className="rd-grid-item">
            <div className="rd-kpi-label">Session Attendance Rate</div>
            <div className="rd-kpi-value">{attendanceRate != null ? `${attendanceRate}%` : "—"}</div>
            <div className="rd-kpi-note">{athlete.attendanceCount} sessions · {athlete.attendance.present} present · {athlete.attendance.late} late · {athlete.attendance.excused} excused · {athlete.attendance.absent} absent</div>
          </div>
        </div>

        {athlete.plans.length > 0 && (
          <>
            <div className="rd-sub-section">Assigned Training Plans {activePlans.length > 0 ? `(${activePlans.length} active)` : ""}</div>
            <table className="rd-results">
              <thead><tr><th>Plan</th><th>Sport</th><th>Status</th><th>Start Date</th><th>End Date</th></tr></thead>
              <tbody>{athlete.plans.map((p, i) => <tr key={i}><td>{p.planName}</td><td>{p.sport}</td><td>{STATUS_LABEL[p.status] || p.status}</td><td>{p.startDate ? formatDate(p.startDate) : "—"}</td><td>{p.endDate ? formatDate(p.endDate) : "—"}</td></tr>)}</tbody>
            </table>
          </>
        )}

        {athlete.attendanceEntries.length > 0 && (
          <>
            <div className="rd-sub-section">Recent Session Attendance</div>
            <table className="rd-results">
              <thead><tr><th>Date</th><th>Session Type</th><th>Sport</th></tr></thead>
              <tbody>{athlete.attendanceEntries.slice(0, 30).map((a, i) => <tr key={i}><td>{formatDate(a.date)}</td><td>{SESSION_TYPE_LABEL[a.type] || a.type}</td><td>{a.sport}</td></tr>)}</tbody>
            </table>
          </>
        )}
      </RdSection>

      {athlete.exercisePerformances.length > 0 && (
        <RdSection num="VII." title="Exercise Performance Log" meta={`${athlete.exercisePerformances.length} recent record(s)`}>
          <table className="rd-results">
            <thead><tr><th>Exercise</th><th>Category</th><th>Score</th><th>Sets / Reps</th><th>Load / Distance</th><th>RPE</th><th>Date</th></tr></thead>
            <tbody>{athlete.exercisePerformances.slice(0, 30).map((p, i) => <tr key={i}><td>{p.exerciseName}</td><td>{EXERCISE_CATEGORY_LABEL[p.category] || p.category}</td><td className="num">{p.score ?? "—"}</td><td className="num">{p.sets != null ? `${p.sets} / ${p.reps ?? "—"}` : "—"}</td><td className="num">{p.load ? `${p.load} kg` : p.distance ? `${p.distance} m` : "—"}</td><td className="num">{p.rpe ?? "—"}</td><td>{formatDate(p.recordedAt)}</td></tr>)}</tbody>
          </table>
        </RdSection>
      )}

      {athlete.achievements.length > 0 && (
        <RdSection num="VIII." title="Achievements and Awards" meta={`${athlete.achievementCount} total · ${athlete.pointsTotal} total points`}>
          <table className="rd-results">
            <thead><tr><th>Achievement</th><th>Type</th><th>Medal / Level</th><th>Points</th><th>Date</th><th>Organization</th></tr></thead>
            <tbody>{athlete.achievements.map((a, i) => <tr key={i}><td>{a.title}</td><td>{a.type || "—"}</td><td>{(a.medal ? a.medal.toUpperCase() : "—")}{a.level ? ` / ${a.level}` : ""}</td><td className="num">{a.points || "—"}</td><td>{a.date ? formatDate(a.date) : "—"}</td><td>{a.organization || "—"}</td></tr>)}</tbody>
          </table>
        </RdSection>
      )}

      {athlete.participants.length > 0 && (
        <RdSection num="IX." title="Event Participation" meta={`${athlete.participants.length} event(s)`}>
          <table className="rd-results">
            <thead><tr><th>Event</th><th>Sport</th><th>Venue</th><th>Start Date</th><th>Status</th></tr></thead>
            <tbody>{athlete.participants.map((p, i) => <tr key={i}><td>{p.eventName}</td><td>{p.sport}</td><td>{p.venue || "—"}</td><td>{p.startDate ? formatDate(p.startDate) : "—"}</td><td>{STATUS_LABEL[p.status] || p.status}</td></tr>)}</tbody>
          </table>
        </RdSection>
      )}

      {athlete.notes.length > 0 && (
        <RdSection num="X." title="Coaching Notes" meta={`${athlete.notes.length} note(s)`}>
          {athlete.notes.slice(0, 20).map((n, i) => (
            <div className="rd-assessment" key={i}>
              <div className="rd-assessment-head">{formatDate(n.date)}{n.author ? <small> &middot; {n.author}</small> : null}</div>
              <p className="rd-empty" style={{ margin: 0 }}>{n.note}</p>
            </div>
          ))}
        </RdSection>
      )}

      <div className="rd-cert"><strong>Certification</strong>This is to certify that the information contained herein is an accurate and complete record of the above-named athlete&apos;s registration, physical profile, performance, training, and achievements, as officially recorded and maintained in the database of the City Sports Development Office of the City Government of Cauayan, Isabela.</div>

      <div className="rd-signatures">
        <div className="rd-sig">
          <div className="rd-sig-label">Prepared by:</div>
          <div className="rd-sig-name">{session.user.name || session.user.email || ""}</div>
          <div className="rd-sig-pos">Authorized User, City Sports Development Office</div>
          <div className="rd-sig-note">Signature over Printed Name</div>
        </div>
        <div className="rd-sig">
          <div className="rd-sig-label">Certified Correct:</div>
          <div className="rd-sig-name"></div>
          <div className="rd-sig-pos">City Sports Development Officer</div>
          <div className="rd-sig-note">Signature over Printed Name</div>
        </div>
      </div>

      <footer className="rd-footer"><span>Generated by {session.user.name || session.user.email || "system"} on {issued}</span><span>Athlete since {athlete.dateRegistered ? formatDate(athlete.dateRegistered) : "—"} · Last assessment: {last ? formatDate(last.assessmentDate) : "none"} · Record updated: {athlete.updatedAt ? formatDateTime(athlete.updatedAt) : "—"}</span></footer>
    </article>
  );
}

function CoachReportCard({ coach, session, prefix }) {
  const issued = formatDate(new Date().toISOString());
  const reportRef = `${prefix}${coach.coachCode}`;
  const age = computeAge(coach.birthdate);
  const avg = coach.performances.length
    ? Math.round((coach.performances.reduce((sum, p) => sum + Number(p.overallScore), 0) / coach.performances.length) * 10) / 10
    : null;

  return (
    <article className="report-doc" key={coach.id}>
      <header className="rd-header">
        <img src="/cauayan logo.png" alt="Official Seal of the City Government of Cauayan" className="rd-logo" />
        <div className="rd-header-text">
          <p className="rd-republic">Republic of the Philippines</p>
          <p className="rd-province">Province of Isabela</p>
          <h1 className="rd-lgu">City Government of Cauayan</h1>
          <p className="rd-office">City Sports Development Office</p>
          <p className="rd-address">Cauayan City, Isabela, Philippines</p>
        </div>
      </header>

      <h2 className="rd-title">Coach Official Personnel Record</h2>
      <p className="rd-ref">Record No.: <span>{reportRef}</span> &nbsp;·&nbsp; Date Issued: <span>{issued}</span></p>

      <RdSection num="I." title="Personal Information">
        <table className="rd-info">
          <tbody>
            <tr>
              <th>Full Name</th>
              <td>{coach.lastName}, {coach.firstName}{coach.middleName ? ` ${coach.middleName}` : ""}{coach.suffix ? ` ${coach.suffix}` : ""}</td>
              <th>Coach Code</th>
              <td>{coach.coachCode}</td>
            </tr>
            <tr>
              <th>Date of Birth</th>
              <td>{formatDate(coach.birthdate)}</td>
              <th>Age</th>
              <td>{age != null ? `${age} years` : "—"}</td>
            </tr>
            <tr>
              <th>Contact No.</th>
              <td>{coach.contactNumber || "—"}</td>
              <th>Email Address</th>
              <td>{coach.email}</td>
            </tr>
            <tr>
              <th>School / Institution</th>
              <td>{coach.school || "—"}</td>
              <th>Record Status</th>
              <td>{STATUS_LABEL[coach.status] || coach.status}</td>
            </tr>
            <tr>
              <th>Date Registered</th>
              <td>{formatDate(coach.dateRegistered)}</td>
              <th>Sports Coached</th>
              <td>{(coach.sports && coach.sports.length) ? coach.sports.join(", ") : "—"}</td>
            </tr>
          </tbody>
        </table>
      </RdSection>

      <RdSection num="II." title="Assigned Athletes" meta={`${coach.athleteCount} total`}>
        {coach.athletes && coach.athletes.length ? (
          <table className="rd-results">
            <thead><tr><th>Code</th><th>Athlete</th><th>Sport</th><th>Event</th><th>Age</th><th>Sex</th><th>Status</th></tr></thead>
            <tbody>{coach.athletes.map((a, i) => <tr key={i}><td>{a.athleteCode}</td><td>{a.name}</td><td>{a.sport}</td><td>{a.event || "—"}</td><td>{computeAge(a.birthdate) != null ? computeAge(a.birthdate) : "—"}</td><td>{GENDER_LABEL[a.gender] || a.gender}</td><td>{STATUS_LABEL[a.status] || a.status}</td></tr>)}</tbody>
          </table>
        ) : <p className="rd-empty">No athletes currently assigned.</p>}
      </RdSection>

      <RdSection num="III." title="Training Sessions Conducted" meta={`${coach.sessionCount} session(s)`}>
        {coach.trainingSessions && coach.trainingSessions.length ? (
          <table className="rd-results">
            <thead><tr><th>Date</th><th>Session Type</th><th>Sport</th><th>Venue</th><th>Attendees</th><th>Notes</th></tr></thead>
            <tbody>{coach.trainingSessions.slice(0, 30).map((s, i) => <tr key={i}><td>{formatDate(s.sessionDate)}</td><td>{SESSION_TYPE_LABEL[s.sessionType] || s.sessionType}</td><td>{s.sport}</td><td>{s.venue || "—"}</td><td className="num">{s.attendance}</td><td>{s.notes || "—"}</td></tr>)}</tbody>
          </table>
        ) : <p className="rd-empty">No training sessions recorded.</p>}
      </RdSection>

      <RdSection num="IV." title="Training Plans" meta={`${coach.planCount} plan(s)`}>
        {coach.trainingPlans && coach.trainingPlans.length ? (
          <table className="rd-results">
            <thead><tr><th>Plan</th><th>Sport</th><th>Status</th><th>Start Date</th><th>End Date</th><th>Athletes Enrolled</th></tr></thead>
            <tbody>{coach.trainingPlans.map((p, i) => <tr key={i}><td>{p.title}</td><td>{p.sport}</td><td>{STATUS_LABEL[p.status] || p.status}</td><td>{p.startDate ? formatDate(p.startDate) : "—"}</td><td>{p.endDate ? formatDate(p.endDate) : "—"}</td><td className="num">{p.athleteCount}</td></tr>)}</tbody>
          </table>
        ) : <p className="rd-empty">No training plans recorded.</p>}
      </RdSection>

      <RdSection num="V." title="Performance Evaluation History" meta={`${coach.evalCount} evaluation(s)${avg ? ` · Overall average: ${avg}/10` : ""}`}>
        {coach.performances && coach.performances.length ? coach.performances.map((p, i) => (
          <div className="rd-assessment" key={i}>
            <div className="rd-assessment-head">{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}{p.evaluator ? <small> &middot; Evaluated by {p.evaluator}</small> : null}</div>
            <table className="rd-results">
              <thead><tr><th>Session Planning</th><th>Exercise Selection</th><th>Technical Instruction</th><th>Athlete Development</th><th>Communication</th><th>Safety Compliance</th><th>Training Implementation</th><th>Overall</th></tr></thead>
              <tbody><tr>{[p.sessionPlanning, p.exerciseSelection, p.technicalInstruction, p.athleteDevelopment, p.communication, p.safetyCompliance, p.trainingImplementation].map((v, j) => <td key={j} className="num">{v}/10</td>)}<td className="num"><strong>{Number(p.overallScore)}/10</strong></td></tr></tbody>
            </table>
            {p.strengths ? <p className="rd-empty" style={{ marginTop: 6 }}>Strengths: {p.strengths}</p> : null}
            {p.areasForImprovement ? <p className="rd-empty" style={{ margin: 4 }}>Areas for improvement: {p.areasForImprovement}</p> : null}
            {p.actionPlan ? <p className="rd-empty" style={{ margin: 4 }}>Action plan: {p.actionPlan}</p> : null}
          </div>
        )) : <p className="rd-empty">No evaluations recorded yet.</p>}
      </RdSection>

      {coach.applications.length > 0 && (
        <RdSection num="VI." title="Event Applications" meta={`${coach.applicationCount} application(s)`}>
          <table className="rd-results">
            <thead><tr><th>Event</th><th>Venue</th><th>Applied At</th><th>Start Date</th><th>Status</th></tr></thead>
            <tbody>{coach.applications.map((a, i) => <tr key={i}><td>{a.eventName}</td><td>{a.venue || "—"}</td><td>{formatDate(a.appliedAt)}</td><td>{a.startDate ? formatDate(a.startDate) : "—"}</td><td>{STATUS_LABEL[a.status] || a.status}</td></tr>)}</tbody>
          </table>
        </RdSection>
      )}

      {coach.participants.length > 0 && (
        <RdSection num="VII." title="Event Participation" meta={`${coach.participantCount} participant record(s)`}>
          <table className="rd-results">
            <thead><tr><th>Event</th><th>Sport</th><th>Venue</th><th>Start Date</th><th>Athlete / Group</th><th>Status</th></tr></thead>
            <tbody>{coach.participants.map((p, i) => <tr key={i}><td>{p.eventName}</td><td>{p.sport}</td><td>{p.venue || "—"}</td><td>{p.startDate ? formatDate(p.startDate) : "—"}</td><td>{p.athlete || "Coach delegation"}</td><td>{STATUS_LABEL[p.status] || p.status}</td></tr>)}</tbody>
          </table>
        </RdSection>
      )}

      <div className="rd-cert"><strong>Certification</strong>This is to certify that the information contained herein is an accurate and complete record of the above-named coach&apos;s profile, assigned athletes, training sessions, training plans, and performance evaluations, as officially recorded and maintained in the database of the City Sports Development Office of the City Government of Cauayan, Isabela.</div>

      <div className="rd-signatures">
        <div className="rd-sig">
          <div className="rd-sig-label">Prepared by:</div>
          <div className="rd-sig-name">{session.user.name || session.user.email || ""}</div>
          <div className="rd-sig-pos">Authorized User, City Sports Development Office</div>
          <div className="rd-sig-note">Signature over Printed Name</div>
        </div>
        <div className="rd-sig">
          <div className="rd-sig-label">Certified Correct:</div>
          <div className="rd-sig-name"></div>
          <div className="rd-sig-pos">City Sports Development Officer</div>
          <div className="rd-sig-note">Signature over Printed Name</div>
        </div>
      </div>

      <footer className="rd-footer"><span>Generated by {session.user.name || session.user.email || "system"} on {issued}</span><span>Coach since {formatDate(coach.dateRegistered)} · Record updated: {coach.updatedAt ? formatDateTime(coach.updatedAt) : "—"}</span></footer>
    </article>
  );
}

const SUMMARY_FITNESS_META = {
  endurance: "Endurance",
  strength: "Strength",
  power: "Power",
  speed_agility: "Speed / Agility",
  skill_technique: "Skill / Technique",
  mobility: "Mobility",
  recovery: "Recovery",
  general: "General",
};

function shortDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function ratingTone(r) {
  if (r == null) return { color: "#64748b" };
  if (r >= 8) return { color: "var(--accent)" };
  if (r >= 6) return { color: "#facc15" };
  return { color: "var(--danger)" };
}

function PerformanceSummary({ athlete }) {
  const sorted = React.useMemo(() => [...athlete.trainingAssessments].sort((a, b) => new Date(a.dates) - new Date(b.dates)), [athlete.trainingAssessments]);
  const trendData = sorted.map((t) => ({ when: shortDate(t.dates), rating: t.rating }));
  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  const latestRating = latest ? latest.rating : null;
  const delta = first && latest ? latest.rating - first.rating : null;

  const fitnessSummary = React.useMemo(() => {
    const byDim = new Map();
    for (const t of sorted) {
      const key = t.fitness || "general";
      if (!byDim.has(key)) byDim.set(key, []);
      byDim.get(key).push(t.rating);
    }
    return [...byDim.entries()].map(([key, ratings]) => ({
      key,
      label: SUMMARY_FITNESS_META[key] || key,
      latest: ratings[ratings.length - 1],
      avg: Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10,
      first: ratings[0],
      last: ratings[ratings.length - 1],
    })).sort((a, b) => b.latest - a.latest);
  }, [sorted]);

  const radarData = fitnessSummary.map((d) => ({ fitness: d.label, value: d.latest }));

  const completion = athlete.completion || { planned: 0, done: 0, partial: 0, missed: 0, open: 0, percent: null };
  const completionStack = [{ name: "Plan", done: completion.done, partial: completion.partial, missed: completion.missed, open: completion.open }];
  const medals = (athlete.achievements || []).filter((a) => a.medal);
  const tone = ratingTone(latestRating);

  const chartTooltip = { contentStyle: { background: "#06261e", border: "1px solid rgba(45,212,168,.35)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#e7f7f1", fontWeight: 700 }, itemStyle: { color: "#9db6c7" } };

  return (
    <section className={styles.panel} style={{ marginBottom: 24, pageBreakInside: "avoid" }}>
      <div className={styles.panelHeader}>
        <div><p className={styles.eyebrow}>1-page summary</p><h2>Performance Summary — {athlete.lastName}, {athlete.firstName}</h2></div>
        <span className={`${styles.badge} ${athlete.healthStatus === "healthy" ? styles.badgeActive : ["injured", "sick"].includes(athlete.healthStatus) ? styles.badgeRejected : styles.badgePending}`}>{String(athlete.healthStatus || "—").replace("_", " ")}</span>
      </div>

      <div className={styles.grid}>
        <div className={styles.detailPanel}>
          <h4>Latest training rating</h4>
          <div style={{ fontSize: 30, fontWeight: 800, color: tone.color }}>{latestRating != null ? `${latestRating}/10` : "—"}</div>
          <small style={{ color: "var(--muted)" }}>{sorted.length} assessment{sorted.length === 1 ? "" : "s"} on record</small>
        </div>
        <div className={styles.detailPanel}>
          <h4>Rating trend</h4>
          <div style={{ fontSize: 30, fontWeight: 800, color: delta > 0 ? "var(--accent)" : delta < 0 ? "var(--danger)" : "var(--muted)" }}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "→"} {delta != null ? Math.abs(delta) : "—"}
          </div>
          <small style={{ color: "var(--muted)" }}>{first && latest ? `${shortDate(first.dates)} → ${shortDate(latest.dates)}` : "Need 2+ assessments"}</small>
        </div>
        <div className={styles.detailPanel}>
          <h4>Plan completion rate</h4>
          <div style={{ fontSize: 30, fontWeight: 800, color: completion.percent == null ? "var(--muted)" : completion.percent >= 80 ? "var(--accent)" : completion.percent >= 50 ? "#facc15" : "var(--danger)" }}>
            {completion.percent != null ? `${completion.percent}%` : "—"}
          </div>
          <small style={{ color: "var(--muted)" }}>{completion.planned} planned activit{completion.planned === 1 ? "y" : "ies"}</small>
        </div>
        <div className={styles.detailPanel}>
          <h4>Medals</h4>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {medals.length ? medals.slice(0, 6).map((m, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700, textTransform: "capitalize", background: m.medal === "gold" ? "rgba(250,204,21,.16)" : m.medal === "silver" ? "rgba(203,213,225,.16)" : m.medal === "bronze" ? "rgba(217,119,6,.18)" : "rgba(100,116,139,.16)", color: m.medal === "gold" ? "#facc15" : m.medal === "silver" ? "#cbd5e1" : "var(--muted)" }}>
                {m.medal}
              </span>
            )) : <span style={{ color: "var(--muted)", fontSize: 14 }}>—</span>}
          </div>
          <small style={{ color: "var(--muted)" }}>{medals.length || 0} award{medals.length === 1 ? "" : "s"}</small>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.detailPanel}>
          <h4>Rating trend over time</h4>
          {trendData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(127,199,175,0.12)" strokeDasharray="3 3" />
                <XAxis dataKey="when" tick={{ fill: "#9db6c7", fontSize: 11 }} />
                <YAxis domain={[0, 10]} tick={{ fill: "#9db6c7", fontSize: 11 }} />
                <Tooltip {...chartTooltip} formatter={(v) => [`${v}/10`, "Rating"]} />
                <Line type="monotone" dataKey="rating" stroke="#2dd4a8" strokeWidth={2} dot={{ fill: "#2dd4a8", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>Not enough assessments to plot a trend yet.</p>}
        </div>

        <div className={styles.detailPanel}>
          <h4>Fitness balance <small style={{ color: "var(--muted)", fontWeight: 400 }}>(latest scores)</small></h4>
          {radarData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(127,199,175,0.2)" />
                <PolarAngleAxis dataKey="fitness" tick={{ fill: "#9db6c7", fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 10]} tick={{ fill: "#9db6c7", fontSize: 9 }} tickCount={5} />
                <Radar name="Score" dataKey="value" stroke="#2dd4a8" fill="#2dd4a8" fillOpacity={0.35} />
                <Tooltip {...chartTooltip} formatter={(v) => [`${v}/10`, "Score"]} />
              </RadarChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>No training assessments for a fitness breakdown yet.</p>}
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.detailPanel}>
          <h4>Plan activity completion</h4>
          {completion.planned > 0 ? (
            <ResponsiveContainer width="100%" height={90}>
              <BarChart data={completionStack} layout="vertical" margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip {...chartTooltip} formatter={(v, name) => [`${v}`, name]} cursor={{ fill: "rgba(45,212,168,0.08)" }} />
                <Bar dataKey="done" stackId="a" fill="#2dd4a8" name="Done" />
                <Bar dataKey="partial" stackId="a" fill="#facc15" name="Partial" />
                <Bar dataKey="missed" stackId="a" fill="#f87171" name="Missed" />
                <Bar dataKey="open" stackId="a" fill="#334155" name="Open" radius={[0, 4, 4, 0]} />
                <Legend iconType="circle" wrapperStyle={{ color: "#9db6c7", fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>No planned activities yet.</p>}
        </div>

        <div className={styles.detailPanel}>
          <h4>Before → now <small style={{ color: "var(--muted)", fontWeight: 400 }}>per fitness dimension</small></h4>
          {fitnessSummary.length ? (
            <div className={styles.infoList}>
              {fitnessSummary.map((d) => {
                const diff = d.last - d.first;
                const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "→";
                const cls = diff > 0 ? "var(--accent)" : diff < 0 ? "var(--danger)" : "var(--muted)";
                return (
                  <div key={d.key}>
                    <dt>{d.label}</dt>
                    <dd>
                      <span>{d.first} → {d.last}</span>
                      <span style={{ color: cls, marginLeft: 8 }}>{arrow} {Math.abs(diff)}</span>
                    </dd>
                  </div>
                );
              })}
            </div>
          ) : <p className={styles.empty}>No before/now comparison available yet.</p>}
        </div>
      </div>
    </section>
  );
}

export default function Reports({ session, isAdmin, athletes, coaches }) {
  const [type, setType] = React.useState("athlete");
  const [selected, setSelected] = React.useState([]);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [search, setSearch] = React.useState("");

  const [sortKey, setSortKey] = React.useState("name");
  const [sortDir, setSortDir] = React.useState("asc");

  const [cSearch, setCSearch] = React.useState("");
  const [cSortKey, setCSortKey] = React.useState("name");
  const [cSortDir, setCSortDir] = React.useState("asc");

  const list = type === "athlete" ? athletes : coaches;
  const SORT_COLS = type === "athlete" ? ATH_SORT_COLS : {
    name: (c) => `${c.lastName}, ${c.firstName}`.toLowerCase(),
    code: (c) => c.coachCode.toLowerCase(),
    sport: (c) => (c.sports && c.sports.join(", ").toLowerCase()),
    school: (c) => (c.school || "").toLowerCase(),
    assignments: (c) => c.athleteCount,
    registered: (c) => c.dateRegistered,
  };
  const sortKeyRef = type === "athlete" ? sortKey : cSortKey;
  const sortDirRef = type === "athlete" ? sortDir : cSortDir;
  const setSortKeyRef = type === "athlete" ? setSortKey : setCSortKey;
  const setSortDirRef = type === "athlete" ? setSortDir : setCSortDir;

  function toggle(id) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  function setSort(key) {
    if (sortKeyRef === key) setSortDirRef((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKeyRef(key);
      setSortDirRef("asc");
    }
  }

  function switchType(next) {
    setType(next);
    setSelected([]);
    setSearch("");
    setCSearch("");
  }

  const query = (type === "athlete" ? search : cSearch).trim().toLowerCase();
  const visible = list
    .filter((item) => {
      const fields = type === "athlete"
        ? [item.lastName, item.firstName, item.athleteCode, item.sport, item.event, item.coach, item.school]
        : [item.lastName, item.firstName, item.coachCode, item.email, item.school, ...(item.sports || [])];
      return !query || fields.some((value) => (value || "").toLowerCase().includes(query));
    })
    .slice()
    .sort((x, y) => {
      const xv = SORT_COLS[sortKeyRef](x);
      const yv = SORT_COLS[sortKeyRef](y);
      const cmp = xv < yv ? -1 : xv > yv ? 1 : 0;
      return sortDirRef === "asc" ? cmp : -cmp;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((a) => selected.includes(a.id));

  function toggleVisible() {
    setSelected((current) => (allVisibleSelected ? current.filter((id) => !visible.some((a) => a.id === id)) : [...new Set([...current, ...visible.map((a) => a.id)])]));
  }

  const count = selected.length;
  const scrollRef = React.useRef(null);
  const filtered = list.filter((item) => selected.includes(item.id));
  const prefix = type === "athlete" ? "APR-" : "CPR-";

  function sortedHeader(key, label) {
    const active = sortKeyRef === key;
    return (
      <th key={key}>
        <button type="button" className={`${styles.thBtn} ${active ? styles.thBtnActive : ""}`} onClick={() => setSort(key)}>
          {label}
          <span className={styles.thDir}>{active ? (sortDirRef === "asc" ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  }

  const colSpan = type === "athlete" ? 9 : 7;

  return (
    <>
      <Head><title>Official Reports | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Official &amp; performance records" title="Official Reports" active="/reports">
        <section className={styles.intro}><div><p className={styles.eyebrow}>Generate</p><h2>Official personnel records</h2><p>Select one or more records to produce a complete official personnel record covering registration, physical and health profile, performance records, training, attendance, achievements, and event participation. {isAdmin ? "Generate reports for any athlete or coach." : "You can generate reports for the athletes assigned to you."}</p></div></section>

        <section className={styles.panel}>
          {isAdmin && (
            <div className={styles.segmented} style={{ marginBottom: 18 }}>
              <button className={type === "athlete" ? styles.active : ""} aria-pressed={type === "athlete"} onClick={() => switchType("athlete")}>Athlete report</button>
              <button className={type === "coach" ? styles.active : ""} aria-pressed={type === "coach"} onClick={() => switchType("coach")}>Coach report</button>
            </div>
          )}

          <div className={styles.panelHeader}><div><h2>{type === "athlete" ? "Athletes" : "Coaches"}</h2></div></div>

          <div className={styles.toolbar} style={{ marginTop: 16 }}>
            <label>Search {type === "athlete" ? "athletes" : "coaches"}<input type="text" placeholder={type === "athlete" ? "Name, code, sport, event, coach, school…" : "Name, code, email, sport, school…"} value={type === "athlete" ? search : cSearch} onChange={(event) => (type === "athlete" ? setSearch(event.target.value) : setCSearch(event.target.value))} /></label>
            {type === "athlete" && <label>From date<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>}
            {type === "athlete" && <label>To date<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>}
            {count > 0 && <p className={styles.selectionSummary}>{count > 1 ? `${count} selected` : "1 selected"}<button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={() => setSelected([])}>Clear</button></p>}
            <div className={styles.stackedActions}>
              <button className={styles.primary} disabled={!count} onClick={() => scrollRef.current?.scrollIntoView({ behavior: "smooth" })}>Show {count ? `${count} report${count > 1 ? "s" : ""}` : "reports"}</button>
              <button className={styles.secondary} disabled={!count} onClick={() => window.print()}>Print</button>
            </div>
          </div>

          {list.length ? (
            <div className={styles.reportTableScroll}>
              <table>
                <thead>
                  <tr>
                    <th className={styles.checkCell}><input type="checkbox" style={{ width: 16, height: 16, accentColor: "var(--accent)" }} checked={allVisibleSelected} onChange={toggleVisible} disabled={!visible.length} /></th>
                    {type === "athlete" ? (
                      <>
                        {sortedHeader("name", "Athlete")}
                        {sortedHeader("code", "Code")}
                        {sortedHeader("sport", "Sport")}
                        {sortedHeader("event", "Event")}
                        {sortedHeader("coach", "Coach")}
                        {sortedHeader("school", "School")}
                        {sortedHeader("status", "Status")}
                        {sortedHeader("assessments", "Assessments")}
                      </>
                    ) : (
                      <>
                        {sortedHeader("name", "Coach")}
                        {sortedHeader("code", "Code")}
                        {sortedHeader("sport", "Sports")}
                        {sortedHeader("school", "School")}
                        {sortedHeader("assignments", "Athletes")}
                        {sortedHeader("registered", "Registered")}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id} className={selected.includes(item.id) ? styles.rowSelected : undefined}>
                      <td className={styles.checkCell}><input type="checkbox" style={{ width: 16, height: 16, accentColor: "var(--accent)" }} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td>
                      {type === "athlete" ? (
                        <>
                          <td><strong>{item.lastName}, {item.firstName}</strong>{item.middleName ? ` ${item.middleName}` : ""}</td>
                          <td>{item.athleteCode}</td>
                          <td>{item.sport}</td>
                          <td>{item.event || "—"}</td>
                          <td>{item.coach || "—"}</td>
                          <td>{item.school || "—"}</td>
                          <td>{STATUS_LABEL[item.status] || item.status}</td>
                          <td className={styles.numCell}><span className={styles.countBadge}>{item.assessmentCount}</span></td>
                        </>
                      ) : (
                        <>
                          <td><strong>{item.lastName}, {item.firstName}</strong>{item.middleName ? ` ${item.middleName}` : ""}</td>
                          <td>{item.coachCode}</td>
                          <td>{item.sports && item.sports.length ? item.sports.join(", ") : "—"}</td>
                          <td>{item.school || "—"}</td>
                          <td className={styles.numCell}><span className={styles.countBadge}>{item.athleteCount}</span></td>
                          <td>{formatDate(item.dateRegistered)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {!visible.length && <tr><td colSpan={colSpan} className={styles.empty}>No records match your search.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : <p className={styles.empty}>No {type === "athlete" ? "athletes" : "coaches"} found.</p>}
        </section>

        <div ref={scrollRef} />
        <div id="report-workspace">
          {type === "athlete"
            ? filtered.map((athlete) => (
              <React.Fragment key={athlete.id}>
                <PerformanceSummary athlete={athlete} />
                <AthleteReportCard athlete={athlete} session={session} from={from} to={to} prefix={prefix} />
              </React.Fragment>
            ))
            : filtered.map((coach) => <CoachReportCard key={coach.id} coach={coach} session={session} prefix={prefix} />)}
        </div>
        {filtered.length > 0 && <div className={styles.stackedActions}><button className={styles.secondary} onClick={() => window.print()}>Print all reports</button></div>}
      </AppShell>
    </>
  );
}