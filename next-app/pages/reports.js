import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from "recharts";
import { prisma } from "../lib/prisma";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const isAdmin = session.user.role === "admin";

  let athletes = [];
  let coaches = [];
  if (isAdmin) {
    const where = {};
    [athletes, coaches] = await Promise.all([
      prisma.athlete.findMany({
        where,
        orderBy: { lastName: "asc" },
        include: {
          school: true,
          sport: true,
          event: true,
          coach: { select: { firstName: true, lastName: true } },
          achievements: { orderBy: { achievementDate: "desc" } },
          notes: { orderBy: { createdAt: "desc" } },
          trainingAssessments: { orderBy: { assessmentDate: "desc" }, include: { plan: { select: { planName: true } } } },
          _count: { select: { assessments: true, achievements: true } },
          assessments: { orderBy: { assessmentDate: "desc" }, include: { recorder: { select: { email: true } }, results: { include: { metric: true } } } },
        },
      }),
      prisma.coach.findMany({
        orderBy: { lastName: "asc" },
        include: {
          school: true,
          sports: { include: { sport: true } },
          _count: { select: { athletes: true, performances: true, trainingPlans: true } },
          athletes: { select: { id: true, athleteCode: true, firstName: true, lastName: true, sport: { select: { sportName: true } }, status: true } },
          performances: { orderBy: { createdAt: "desc" }, include: { evaluator: { select: { username: true } } } },
          trainingPlans: { select: { id: true, planName: true, status: true } },
        },
      }),
    ]);
  } else {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach) return { redirect: { destination: "/dashboard", permanent: false } };
    athletes = await prisma.athlete.findMany({
      where: { coach: { userId: Number(session.user.id) } },
      orderBy: { lastName: "asc" },
      include: {
        school: true,
        sport: true,
        event: true,
        coach: { select: { firstName: true, lastName: true } },
        achievements: { orderBy: { achievementDate: "desc" } },
        notes: { orderBy: { createdAt: "desc" } },
        trainingAssessments: { orderBy: { assessmentDate: "desc" }, include: { plan: { select: { planName: true } } } },
        _count: { select: { assessments: true, achievements: true } },
        assessments: { orderBy: { assessmentDate: "desc" }, include: { recorder: { select: { email: true } }, results: { include: { metric: true } } } },
      },
    });
  }

  const athleteIds = athletes.map((a) => a.id);
  const [activityCounts, logCounts] = await Promise.all([
    athleteIds.length ? prisma.planActivity.groupBy({ by: ["athleteId"], where: { athleteId: { in: athleteIds } }, _count: { _all: true } }) : [],
    athleteIds.length ? prisma.planActivityLog.groupBy({ by: ["athleteId", "status"], where: { athleteId: { in: athleteIds } }, _count: { _all: true } }) : [],
  ]);
  const activityCountMap = new Map(activityCounts.map((x) => [x.athleteId, x._count._all]));
  const logCountMap = new Map();
  for (const row of logCounts) {
    if (!logCountMap.has(row.athleteId)) logCountMap.set(row.athleteId, { done: 0, partial: 0, missed: 0 });
    const entry = logCountMap.get(row.athleteId);
    if (["done", "partial", "missed"].includes(row.status)) entry[row.status] += row._count._all;
  }

  const serializeAthlete = (athlete) => ({
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
    status: athlete.status,
    height: athlete.height?.toString?.() || null,
    weight: athlete.weight?.toString?.() || null,
    healthStatus: athlete.healthStatus,
    healthNotes: athlete.healthNotes || null,
    dateRegistered: athlete.dateRegistered?.toISOString() || null,
    assessmentCount: athlete._count.assessments,
    achievementCount: athlete._count.achievements,
    achievements: athlete.achievements.map((a) => ({ title: a.achievementTitle, type: a.achievementType || null, medal: a.medal || null, level: a.level || null, date: a.achievementDate?.toISOString() || null, organization: a.organization || null, description: a.description || null })),
    notes: athlete.notes.map((n) => ({ note: n.note, author: n.author?.email || null, date: n.createdAt.toISOString() })),
    trainingAssessments: athlete.trainingAssessments.map((t) => ({ rating: t.rating, fitness: t.fitnessDimension || "general", dates: t.assessmentDate.toISOString(), plan: t.plan?.planName || null })),
    assessments: athlete.assessments.map((assessment) => ({
      id: assessment.id,
      assessmentDate: assessment.assessmentDate.toISOString(),
      assessmentType: assessment.assessmentType,
      remarks: assessment.remarks || null,
      recorder: assessment.recorder?.email || null,
      results: assessment.results.map((result) => ({ metricName: result.metric.metricName, unit: result.metric.unit, valueDecimal: result.valueDecimal?.toString() || null, valueText: result.valueText || null, notes: result.notes || null })),
    })),
    completion: (() => {
      const log = logCountMap.get(athlete.id) || { done: 0, partial: 0, missed: 0 };
      const planned = activityCountMap.get(athlete.id) || 0;
      return {
        planned,
        done: log.done,
        partial: log.partial,
        missed: log.missed,
        open: planned - (log.done + log.partial + log.missed),
        percent: planned ? Math.round(((log.done + log.partial) / planned) * 100) : null,
      };
    })(),
  });

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
    sports: coach.sports.map((s) => s.sport.sportName),
    athleteCount: coach._count.athletes,
    evalCount: coach._count.performances,
    planCount: coach._count.trainingPlans,
    athletes: coach.athletes.map((a) => ({ athleteCode: a.athleteCode, name: `${a.lastName}, ${a.firstName}`, sport: a.sport.sportName, status: a.status })),
    performances: coach.performances.map((p) => ({
      periodStart: p.periodStart.toISOString(),
      periodEnd: p.periodEnd.toISOString(),
      overallScore: p.overallScore.toString(),
      evaluator: p.evaluator?.username || null,
    })),
    trainingPlans: coach.trainingPlans.map((p) => ({ title: p.planName, status: p.status })),
  });

  return {
    props: {
      session,
      isAdmin,
      athletes: athletes.map(serializeAthlete),
      coaches: coaches.map(serializeCoach),
    },
  };
}

function formatDate(value) {
  const date = new Date(value);
  return isNaN(date) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const GENDER_LABEL = { male: "Male", female: "Female", other: "Other", prefer_not_to_say: "Prefer not to say" };
const STATUS_LABEL = { active: "Active", inactive: "Inactive", pending: "Pending" };
const HEALTH_LABEL = { healthy: "Healthy", injured: "Injured", recovering: "Recovering", medical_condition: "Medical note" };

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

function AthleteReportCard({ athlete, isAdmin, session, from, to, prefix }) {
  const windowed = athlete.assessments.filter((assessment) => (!from || assessment.assessmentDate >= new Date(from).toISOString()) && (!to || assessment.assessmentDate <= new Date(new Date(to).getTime() + 86400000).toISOString()));
  const last = athlete.assessments[0];
  const reportRef = `${prefix}${athlete.athleteCode}-${from || "all"}${to ? `-${to}` : ""}`;
  const issued = formatDate(new Date().toISOString());
  const periodLabel = `${from ? formatDate(new Date(from).toISOString()) : "earliest"} to ${to ? formatDate(new Date(to).toISOString()) : "latest"}`;
  const heightM = athlete.height ? Number(athlete.height) : null;
  const weightKg = athlete.weight ? Number(athlete.weight) : null;

  return (
    <article className="report-doc" key={athlete.id}>
      <header className="rd-header">
        <img src="/cauayan logo.png" alt="Official Seal of the City Government of Cauayan" className="rd-logo" />
        <div className="rd-header-text">
          <p className="rd-republic">Republic of the Philippines</p>
          <h1 className="rd-lgu">City Government of Cauayan</h1>
          <p className="rd-office">City Sports Development Office</p>
          <p className="rd-address">Cauayan City, Isabela, Philippines</p>
        </div>
      </header>

      <h2 className="rd-title">Athlete Full Profile Report</h2>
      <p className="rd-ref">Report No.: <span>{reportRef}</span> &nbsp;·&nbsp; Date Issued: <span>{issued}</span></p>

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
            <th>Sex</th>
            <td>{GENDER_LABEL[athlete.gender] || athlete.gender}</td>
          </tr>
          <tr>
            <th>Status</th>
            <td>{STATUS_LABEL[athlete.status] || athlete.status}</td>
            <th>Date Registered</th>
            <td>{athlete.dateRegistered ? formatDate(athlete.dateRegistered) : "—"}</td>
          </tr>
          <tr>
            <th>Sport / Event</th>
            <td colSpan="1">{athlete.sport}</td>
            <th>Event</th>
            <td>{athlete.event || "—"}</td>
          </tr>
          <tr>
            <th>School</th>
            <td>{athlete.school || "—"}</td>
            <th>Head Coach</th>
            <td>{athlete.coach || "—"}</td>
          </tr>
          <tr>
            <th>Contact No.</th>
            <td>{athlete.contactNumber || "—"}</td>
            <th>Email</th>
            <td>{athlete.email || "—"}</td>
          </tr>
          <tr>
            <th>Address</th>
            <td colSpan="3">{athlete.address || "—"}</td>
          </tr>
          <tr>
            <th>Height / Weight</th>
            <td colSpan="3">{heightM ? `${heightM} m` : "—"} / {weightKg ? `${weightKg} kg` : "—"}</td>
          </tr>
          <tr>
            <th>Health Status</th>
            <td>{HEALTH_LABEL[athlete.healthStatus] || athlete.healthStatus}</td>
            <th>Health Notes</th>
            <td>{athlete.healthNotes || "—"}</td>
          </tr>
        </tbody>
      </table>

      <div className="rd-section-title">Performance Record <span>Covering period: {periodLabel}</span></div>
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

      {athlete.trainingAssessments.length > 0 && (
        <>
          <div className="rd-section-title">Training Assessments <span>{athlete.trainingAssessments.length} record(s)</span></div>
          <table className="rd-results">
            <thead><tr><th>Plan</th><th>Assessed</th><th>Rating</th></tr></thead>
            <tbody>{athlete.trainingAssessments.slice(0, 20).map((t, i) => <tr key={i}><td>{t.plan || "—"}</td><td>{formatDate(t.dates)}</td><td className="num">{t.rating}/10</td></tr>)}</tbody>
          </table>
        </>
      )}

      {athlete.achievements.length > 0 && (
        <>
          <div className="rd-section-title">Achievements <span>{athlete.achievementCount} total</span></div>
          <table className="rd-results">
            <thead><tr><th>Achievement</th><th>Type</th><th>Date</th></tr></thead>
            <tbody>{athlete.achievements.map((a, i) => <tr key={i}><td>{a.title}</td><td>{a.type || "—"}</td><td>{a.date ? formatDate(a.date) : "—"}</td></tr>)}</tbody>
          </table>
        </>
      )}

      {athlete.notes.length > 0 && (
        <>
          <div className="rd-section-title">Coaching Notes <span>{athlete.notes.length} note(s)</span></div>
          {athlete.notes.slice(0, 20).map((n, i) => (
            <div className="rd-assessment" key={i}>
              <div className="rd-assessment-head">{formatDate(n.date)}{n.author ? <small> &middot; {n.author}</small> : null}</div>
              <p className="rd-empty" style={{ margin: 0 }}>{n.note}</p>
            </div>
          ))}
        </>
      )}

      <div className="rd-cert"><strong>Certification</strong>This is to certify that the information contained herein is an accurate and complete record of the above-named athlete&apos;s registration and performance, as officially recorded in the database of the City Sports Development Office of the City Government of Cauayan, Isabela.</div>

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

      <footer className="rd-footer"><span>Generated by {session.user.name || session.user.email || "system"} on {issued}</span><span>Athlete since {athlete.dateRegistered ? formatDate(athlete.dateRegistered) : "—"} · Last assessment: {last ? formatDate(last.assessmentDate) : "none"}</span></footer>
    </article>
  );
}

function CoachReportCard({ coach, session, prefix }) {
  const issued = formatDate(new Date().toISOString());
  const reportRef = `${prefix}${coach.coachCode}`;
  const avg = coach.performances.length
    ? Math.round((coach.performances.reduce((sum, p) => sum + Number(p.overallScore), 0) / coach.performances.length) * 10) / 10
    : null;

  return (
    <article className="report-doc" key={coach.id}>
      <header className="rd-header">
        <img src="/cauayan logo.png" alt="Official Seal of the City Government of Cauayan" className="rd-logo" />
        <div className="rd-header-text">
          <p className="rd-republic">Republic of the Philippines</p>
          <h1 className="rd-lgu">City Government of Cauayan</h1>
          <p className="rd-office">City Sports Development Office</p>
          <p className="rd-address">Cauayan City, Isabela, Philippines</p>
        </div>
      </header>

      <h2 className="rd-title">Coach Full Profile Report</h2>
      <p className="rd-ref">Report No.: <span>{reportRef}</span> &nbsp;·&nbsp; Date Issued: <span>{issued}</span></p>

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
            <th>Status</th>
            <td>{STATUS_LABEL[coach.status] || coach.status}</td>
          </tr>
          <tr>
            <th>Email</th>
            <td colSpan="3">{coach.email}</td>
          </tr>
          <tr>
            <th>Contact No.</th>
            <td>{coach.contactNumber || "—"}</td>
            <th>School</th>
            <td>{coach.school || "—"}</td>
          </tr>
          <tr>
            <th>Sports Coached</th>
            <td colSpan="3">{(coach.sports && coach.sports.length) ? coach.sports.join(", ") : "—"}</td>
          </tr>
          <tr>
            <th>Date Registered</th>
            <td>{formatDate(coach.dateRegistered)}</td>
            <th>Assigned Athletes</th>
            <td>{coach.athleteCount}</td>
          </tr>
        </tbody>
      </table>

      <div className="rd-section-title">Assigned Athletes <span>{coach.athleteCount} total</span></div>
      {coach.athletes && coach.athletes.length ? (
        <table className="rd-results">
          <thead><tr><th>Code</th><th>Athlete</th><th>Sport</th><th>Status</th></tr></thead>
          <tbody>{coach.athletes.map((a, i) => <tr key={i}><td>{a.athleteCode}</td><td>{a.name}</td><td>{a.sport}</td><td>{STATUS_LABEL[a.status] || a.status}</td></tr>)}</tbody>
        </table>
      ) : <p className="rd-empty">No athletes currently assigned.</p>}

      <div className="rd-section-title">Performance Evaluation History <span>{coach.evalCount} evaluation(s){avg ? ` · Average: ${avg}/10` : ""}</span></div>
      {coach.performances && coach.performances.length ? (
        <table className="rd-results">
          <thead><tr><th>Period</th><th>Overall Score</th><th>Evaluator</th></tr></thead>
          <tbody>{coach.performances.slice(0, 30).map((p, i) => <tr key={i}><td>{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</td><td className="num"><strong>{Number(p.overallScore)}/10</strong></td><td>{p.evaluator || "—"}</td></tr>)}</tbody>
        </table>
      ) : <p className="rd-empty">No evaluations recorded yet.</p>}

      <div className="rd-section-title">Training Plans <span>{coach.planCount} plan(s)</span></div>
      {coach.trainingPlans && coach.trainingPlans.length ? (
        <table className="rd-results">
          <thead><tr><th>Plan</th><th>Status</th></tr></thead>
          <tbody>{coach.trainingPlans.map((p, i) => <tr key={i}><td>{p.title}</td><td>{STATUS_LABEL[p.status] || p.status}</td></tr>)}</tbody>
        </table>
      ) : <p className="rd-empty">No training plans recorded.</p>}

      <div className="rd-cert"><strong>Certification</strong>This is to certify that the information contained herein is an accurate and complete record of the above-named coach&apos;s profile and service, as officially recorded in the database of the City Sports Development Office of the City Government of Cauayan, Isabela.</div>

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

      <footer className="rd-footer"><span>Generated by {session.user.name || session.user.email || "system"} on {issued}</span><span>Coach since {formatDate(coach.dateRegistered)}</span></footer>
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
  const [type, setType] = React.useState(isAdmin ? "athlete" : "athlete");
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
  function switchTypeSafe() { }
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
        <section className={styles.intro}><div><p className={styles.eyebrow}>Generate</p><h2>Full profile reports</h2><p>Select one or more records and (for athletes) a date window to produce a full-profile report covering registration details, assessment history, training and achievements. {isAdmin ? "Generate reports for any athlete or coach." : "You can generate reports for the athletes assigned to you."}</p></div></section>

        <section className={styles.panel}>
          {isAdmin && (
            <div className={styles.segmented} style={{ marginBottom: 18 }}>
              <button className={type === "athlete" ? "active" : ""} onClick={() => switchType("athlete")}>Athlete report</button>
              <button className={type === "coach" ? "active" : ""} onClick={() => switchType("coach")}>Coach report</button>
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
                <AthleteReportCard athlete={athlete} isAdmin={isAdmin} session={session} from={from} to={to} prefix={prefix} />
              </React.Fragment>
            ))
            : filtered.map((coach) => <CoachReportCard key={coach.id} coach={coach} session={session} prefix={prefix} />)}
        </div>
        {filtered.length > 0 && <div className={styles.stackedActions}><button className={styles.secondary} onClick={() => window.print()}>Print all reports</button></div>}
      </AppShell>
    </>
  );
}