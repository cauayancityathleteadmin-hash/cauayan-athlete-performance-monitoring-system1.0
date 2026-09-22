import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { getSession } from "next-auth/react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, ReferenceLine, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { METRIC_LABELS, resultFieldFor, resultUnitFor, targetValueFor } from "../../../../lib/activity-score";
import { prisma } from "../../../../lib/prisma";
import AppShell from "../../../../components/AppShell";
import { AthleteActivitiesBlock } from "../../../../components/AthleteActivityManager";
import PageSectionTabs from "../../../../components/PageSectionTabs";
import styles from "../../../../styles/Dashboard.module.css";
import { CHART_HEIGHTS, CHART_MARGINS, CHART_TOOLTIP, CHART_GRID, CHART_AXIS, CHART_AXES, CHART_COLORS, barChartHeight, completionColor, shortAxisLabel } from "../../../../lib/chart-config";

const FITNESS_META = {
  endurance: "Endurance", strength: "Strength", power: "Power",
  speed_agility: "Speed / Agility", skill_technique: "Skill / Technique", mobility: "Mobility", recovery: "Recovery",
};

const ATHLETE_SECTIONS = [
  { label: "Overview", sectionId: "overview" },
  { label: "Activities", sectionId: "activities" },
  { label: "Trends & charts", sectionId: "trends" },
  { label: "Distribution", sectionId: "distribution" },
  { label: "Assessments", sectionId: "assessments" },
  { label: "Exercise Performance", sectionId: "performance" },
  { label: "Attendance", sectionId: "attendance" },
  { label: "Achievements", sectionId: "achievements" },
  { label: "Health", sectionId: "health" },
];

function fmtDate(value) {
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtNum(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return isNaN(n) ? String(value) : n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function trendBucketFor(activity, granularity) {
  const week = activity.weekNumber == null ? 1 : Number(activity.weekNumber);
  const day = activity.dayIndex == null ? 1 : Number(activity.dayIndex);
  if (granularity === "day") { const n = (week - 1) * 7 + day; return { n, label: `D${n}`, long: `Day ${n}` }; }
  if (granularity === "month") { const n = Math.ceil(week / 4); return { n, label: `M${n}`, long: `Month ${n}` }; }
  return { n: week, label: `W${week}`, long: `Week ${week}` };
}

function logResultText(log) {
  if (!log) return "";
  const parts = [];
  if (log.timeSec != null) parts.push(`${log.timeSec} sec`);
  if (log.distanceDone != null) parts.push(`${log.distanceDone} m`);
  if (log.loadUsed != null) parts.push(`${log.loadUsed} kg`);
  if (log.quantityDone != null) parts.push(`${log.quantityDone}${log.activity?.targetUnit ? ` ${log.activity.targetUnit}` : ""}`);
  if (log.setsDone != null) parts.push(`${log.setsDone} sets`);
  if (log.repsDone != null) parts.push(`${log.repsDone} reps`);
  if (log.attempts != null) parts.push(`${log.attempts} attempts`);
  return parts.join(" · ");
}

const LOG_STATUS = {
  planned: { label: "Planned", cls: "badgeMuted" },
  done: { label: "Done", cls: "badgeActive" },
  partial: { label: "Partial", cls: "badgePending" },
  missed: { label: "Missed", cls: "badgeRejected" },
};

const HEALTH_META = {
  healthy: { label: "Healthy", cls: "badgeActive" },
  sick: { label: "Sick", cls: "badgeRejected" },
  injured: { label: "Injured", cls: "badgeRejected" },
  recovering: { label: "Recovering", cls: "badgePending" },
  inactive: { label: "Inactive", cls: "badgeMuted" },
};

function HealthBadge({ status }) {
  const meta = HEALTH_META[status] || { label: status || "—", cls: "badgeMuted" };
  return <span className={`${styles.badge} ${styles[meta.cls]}`}>{meta.label}</span>;
}

const FITNESS_META_FULL = {
  endurance: "Endurance",
  strength: "Strength",
  power: "Power",
  speed_agility: "Speed / Agility",
  skill_technique: "Skill / Technique",
  mobility: "Mobility",
  recovery: "Recovery",
};

function MiniTrend({ points, color = CHART_COLORS.primary }) {
  const w = 360;
  const h = 110;
  const padL = 18;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  if (!points || points.length < 2) return <p className={styles.empty}>Not enough points to plot a trend yet.</p>;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const step = plotW / (points.length - 1 || 1);
  const coords = points.map((p, i) => ({ x: padL + i * step, y: padT + plotH - ((p.value - min) / range) * plotH, p }));
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${path} L${coords[coords.length - 1].x.toFixed(1)},${h - padB} L${coords[0].x.toFixed(1)},${h - padB} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Progress trend chart">
      <defs>
        <linearGradient id="ptrend" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {[0.1, 0.5, 0.9].map((fy) => (
        <line key={fy} x1={padL} x2={w - padR} y1={padT + plotH * fy} y2={padT + plotH * fy} stroke={CHART_GRID.cartesian.stroke} strokeWidth="1" />
      ))}
      <path d={area} fill="url(#ptrend)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => {
        const n = coords.length;
        const showLabel = n <= 8 || i === 0 || i === n - 1 || i % Math.ceil(n / 8) === 0;
        return (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r="3" fill="#041f18" stroke={color} strokeWidth="2" />
            {showLabel && <text x={c.x} y={h - 7} textAnchor="middle" fontSize="9" fill={CHART_COLORS.text}>{c.p.when}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className={styles.detailPanel}>
      <h4>{label}</h4>
      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)", margin: "4px 0" }}>{value}</div>
      {sub ? <small style={{ color: "var(--muted)" }}>{sub}</small> : null}
    </div>
  );
}

function RatingChip({ rating }) {
  const tone = rating >= 8 ? "rgba(45,212,168,.16)" : rating >= 6 ? "rgba(251,191,36,.16)" : "rgba(248,113,113,.16)";
  const color = rating >= 8 ? "var(--accent)" : rating >= 6 ? "var(--warning)" : "var(--danger)";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700, background: tone, color }}>{rating}<small style={{ fontSize: 9, opacity: .7 }}>/10</small></span>;
}

/* Training assessments summary per fitness dimension */
function trainingSummary(assessments) {
  const byDim = {};
  for (const a of assessments) {
    const key = a.fitnessDimension || "general";
    if (!byDim[key]) byDim[key] = [];
    byDim[key].push(a.rating);
  }
  const out = [];
  for (const [key, ratings] of Object.entries(byDim)) {
    if (!ratings.length) continue;
    const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
    out.push({ key, label: FITNESS_META_FULL[key] || (key === "general" ? "General" : key), latest: ratings[ratings.length - 1], avg, count: ratings.length });
  }
  return out.sort((a, b) => b.latest - a.latest);
}

/* Overall training trend over time (avg of all ratings per date) */
function trainingTrend(assessments) {
  const byDate = new Map();
  for (const a of assessments) {
    const d = new Date(a.assessmentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(a.rating);
  }
  return [...byDate.entries()].map(([when, ratings]) => ({ when, value: ratings.reduce((s, r) => s + r, 0) / ratings.length }));
}

/* Physical performance summary: best & average score, plus trend */
function performanceSummary(performances) {
  const scored = performances.filter((p) => p.score !== null && p.score !== undefined && !isNaN(Number(p.score))).map((p) => Number(p.score));
  if (!scored.length) return { best: null, avg: null, count: 0, trend: [] };
  const best = Math.max(...scored);
  const avg = scored.reduce((s, v) => s + v, 0) / scored.length;
  const byDate = new Map();
  for (const p of performances) {
    if (p.score === null || p.score === undefined || isNaN(Number(p.score))) continue;
    const d = new Date(p.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(Number(p.score));
  }
  const trend = [...byDate.entries()].map(([when, vals]) => ({ when, value: vals.reduce((s, v) => s + v, 0) / vals.length }));
  return { best, avg, count: scored.length, trend };
}

/* Attendance + plan logs effort summary */
function effortSummary(attendances) {
  const att = { present: 0, late: 0, excused: 0, absent: 0 };
  for (const a of attendances) att[a.status] = (att[a.status] || 0) + 1;
  const totalAtt = attendances.length;
  return {
    attendances,
    att,
    totalAtt,
    attendanceRate: totalAtt ? Math.round(((att.present + att.late) / totalAtt) * 100) : null,
  };
}

function commentAuthorName(author) {
  if (!author) return "Admin";
  if (author.coach?.firstName || author.coach?.lastName) return `${author.coach.firstName} ${author.coach.lastName}`.trim();
  return author.username || author.email || "Admin";
}

function ActivityCommentThread({ planId, activityId, athleteId, isAdmin, athleteName }) {
  const [comments, setComments] = React.useState(null);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/training-plans/${planId}/activities/${activityId}/comments`).then((r) => r.json()).catch(() => ({}));
    const filtered = Array.isArray(res.comments) ? res.comments.filter((c) => c.athleteId === athleteId) : [];
    setComments(filtered);
  }, [planId, activityId, athleteId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { load(); }, [load]);

  async function post(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true); setMsg("");
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const body = { body: draft.trim(), athleteId };
    const res = await fetch(`/api/training-plans/${planId}/activities/${activityId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify(body),
    }).then((r) => r.json()).catch(() => ({}));
    setBusy(false);
    if (res.comment) {
      setDraft("");
      load();
    } else {
      setMsg(res.error || "Could not post comment.");
    }
  }

  return (
    <div style={{ borderTop: "1px solid rgba(26,92,74,.5)", marginTop: "var(--space-3)", paddingTop: "var(--space-3)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-2)" }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Notes on this activity for {athleteName}</span>
      </div>
      {comments === null ? <p className={styles.empty} style={{ margin: 0 }}>Loading comments...</p> : comments.length === 0 ? <p className={styles.empty} style={{ margin: 0 }}>No comments yet.</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
          {comments.map((c) => (
            <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "var(--space-3) var(--space-4)", background: "rgba(6,38,30,.4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-1)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <strong style={{ fontSize: 13 }}>{commentAuthorName(c.author)}</strong>
                  <span className={styles.badge} style={{ background: "rgba(45,212,168,.16)", color: "var(--accent)", fontSize: 9 }}>{c.athlete?.firstName} {c.athlete?.lastName}</span>
                </span>
                <small style={{ color: "var(--muted)" }}>{fmtDate(c.createdAt)}</small>
              </div>
              <p style={{ margin: 0 }}>{c.body}</p>
            </div>
          ))}
        </div>
      )}
      {isAdmin && (
        <form onSubmit={post} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea className={styles.fieldControl} rows="2" maxLength="2000" placeholder={`Note for ${athleteName}...`} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
            <button className={styles.primary} disabled={busy || !draft.trim()}>{busy ? "Posting..." : "Post comment"}</button>
            {msg && <small style={{ color: "var(--danger)" }}>{msg}</small>}
          </div>
        </form>
      )}
    </div>
  );
}

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const planId = Number(context.params?.id);
  const athleteId = Number(context.params?.athleteId);
  if (!Number.isSafeInteger(planId) || !Number.isSafeInteger(athleteId)) return { redirect: { destination: "/training-plans", permanent: false } };
  const isAdmin = session.user.role === "admin";

  const plan = await prisma.trainingPlan.findUnique({
    where: { id: planId },
    select: { id: true, planName: true, coachId: true, startDate: true, durationDays: true, durationWeeks: true, planType: true },
  });
  if (!plan) return { redirect: { destination: "/training-plans", permanent: false } };
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || plan.coachId !== coach.id) return { redirect: { destination: "/training-plans", permanent: false } };
  }

  const onPlan = await prisma.trainingPlanAthlete.findFirst({
    where: { planId, athleteId },
    select: { athlete: { select: { id: true, firstName: true, lastName: true, athleteCode: true, healthStatus: true, sport: { select: { sportName: true } } } } },
  });
  if (!onPlan) return { redirect: { destination: `/training-plans/${planId}`, permanent: false } };

  // Fetch additional data for merged progress features
  const [trainingAssessments, performances, attendances, achievements, healthLogs] = await Promise.all([
    prisma.trainingAssessment.findMany({
      where: { athleteId },
      orderBy: { assessmentDate: "asc" },
      select: { id: true, assessmentDate: true, rating: true, fitnessDimension: true, comments: true, plan: { select: { planName: true } } },
    }),
    prisma.exercisePerformance.findMany({
      where: { athleteId },
      orderBy: { recordedAt: "asc" },
      select: { id: true, recordedAt: true, score: true, rpe: true, exercise: { select: { exerciseName: true, category: true } } },
    }),
    prisma.trainingAttendance.findMany({
      where: { athleteId },
      orderBy: { session: { startTime: "asc" } },
      select: { id: true, status: true, session: { select: { startTime: true, sessionType: true } } },
    }),
    prisma.achievement.findMany({
      where: { athleteId },
      orderBy: { achievementDate: "desc" },
      select: { id: true, achievementTitle: true, achievementType: true, achievementDate: true, organization: true, description: true, medal: true, level: true },
    }),
    prisma.healthLog.findMany({
      where: { athleteId },
      orderBy: { reportedAt: "desc" },
      take: 10,
      select: { id: true, status: true, description: true, reportedAt: true },
    }),
  ]);

  return {
    props: {
      session,
      isAdmin,
      plan: { id: plan.id, planName: plan.planName, startDate: plan.startDate.toISOString(), durationDays: plan.durationDays, durationWeeks: plan.durationWeeks, planType: plan.planType || "normal" },
      athlete: onPlan.athlete,
      trainingAssessments: JSON.parse(JSON.stringify(trainingAssessments)),
      performances: JSON.parse(JSON.stringify(performances)),
      attendances: JSON.parse(JSON.stringify(attendances)),
      achievements: JSON.parse(JSON.stringify(achievements)),
      healthLogs: JSON.parse(JSON.stringify(healthLogs)),
    },
  };
}

export default function AthleteDrillPage({ session, isAdmin, plan, athlete, trainingAssessments = [], performances = [], attendances = [], achievements = [], healthLogs = [] }) {
  const router = useRouter();
  const [data, setData] = React.useState(null);
  const [allLogs, setAllLogs] = React.useState([]);
  const [allActivities, setAllActivities] = React.useState([]);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [manageMsg, setManageMsg] = React.useState("");
  const [error, setError] = React.useState("");
  const [expandedActivityId, setExpandedActivityId] = React.useState(null);
  const [metricActivityId, setMetricActivityId] = React.useState(null);
  const [trendGranularity, setTrendGranularity] = React.useState("week");

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/progress?planId=${plan.id}&athleteId=${athlete.id}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch(`/api/plan-activity-logs?planId=${plan.id}&athleteId=${athlete.id}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/plan-activities?planId=${plan.id}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([progressData, logsData, activitiesData]) => {
      if (cancelled) return;
      if (progressData.activities) setData(progressData);
      else setError(progressData.error || "Could not load progress.");
      setAllLogs(logsData || []);
      setAllActivities(Array.isArray(activitiesData) ? activitiesData : []);
    }).catch(() => { if (!cancelled) setError("Unable to reach the server."); });
    return () => { cancelled = true; };
  }, [plan.id, athlete.id]);

  async function refresh() {
    const [progressData, logsData, activitiesData] = await Promise.all([
      fetch(`/api/progress?planId=${plan.id}&athleteId=${athlete.id}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch(`/api/plan-activity-logs?planId=${plan.id}&athleteId=${athlete.id}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/plan-activities?planId=${plan.id}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    if (progressData.activities) setData(progressData);
    else setError(progressData.error || "Could not load progress.");
    setAllLogs(logsData || []);
    setAllActivities(Array.isArray(activitiesData) ? activitiesData : []);
  }

  async function removeActivity(activityId) {
    if (!window.confirm("Remove this activity? Its saved logs stay on record but the activity no longer applies to this athlete.")) return;
    setManageMsg("");
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const res = await fetch("/api/plan-activities", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify({ planId: plan.id, action: "delete", activityId }),
    }).then((r) => r.json()).catch(() => ({}));
    if (res.success) await refresh();
    else setManageMsg(res.error || "Could not remove the activity.");
  }

  async function editActivity(activityId, patch) {
    setManageMsg("");
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const res = await fetch("/api/plan-activities", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify({ planId: plan.id, action: "update", activityId, ...patch }),
    }).then((r) => r.json()).catch(() => ({}));
    if (res.success) await refresh();
    else setManageMsg(res.error || "Could not update the activity.");
  }

  async function onActivitiesChanged() {
    await refresh();
  }

  const activities = React.useMemo(() => data?.activities || [], [data]);
  const summary = data?.summary || { total: 0, completed: 0, partial: 0, missed: 0, completionPercent: 0, rating: null, ratingDate: null };
  const perfSummary = React.useMemo(() => performanceSummary(performances), [performances]);
  const attSummary = React.useMemo(() => effortSummary(attendances), [attendances]);

  const logsByActivity = React.useMemo(() => {
    const map = new Map();
    for (const log of allLogs) {
      if (!map.has(log.activityId)) map.set(log.activityId, []);
      map.get(log.activityId).push(log);
    }
    return map;
  }, [allLogs]);

  const fitnessDist = React.useMemo(() => {
    const map = new Map();
    for (const a of activities) map.set(a.fitnessType, (map.get(a.fitnessType) || 0) + 1);
    return [...map.entries()].map(([k, count], i) => ({ name: FITNESS_META[k] || k, count, color: CHART_COLORS.palette[i % CHART_COLORS.palette.length] }));
  }, [activities]);

  const completionTrend = React.useMemo(() => {
    const map = new Map();
    for (const a of activities) {
      const b = trendBucketFor(a, trendGranularity);
      if (!map.has(b.label)) map.set(b.label, { label: b.label, long: b.long, n: b.n, total: 0, done: 0, partial: 0 });
      const row = map.get(b.label);
      row.total += 1;
      const s = a.latestLog?.status;
      if (s === "done") row.done += 1;
      else if (s === "partial") row.partial += 1;
    }
    return [...map.values()].sort((x, y) => x.n - y.n).map((r) => ({ ...r, percent: r.total ? Math.round(((r.done + r.partial) / r.total) * 100) : 0 }));
  }, [activities, trendGranularity]);

  const radarData = React.useMemo(() => {
    const byFitness = new Map();
    for (const a of activities) {
      if (!byFitness.has(a.fitnessType)) byFitness.set(a.fitnessType, []);
      byFitness.get(a.fitnessType).push(a.latestLog?.status || "open");
    }
    return [...byFitness.entries()].map(([f, statuses]) => {
      const done = statuses.filter((s) => s === "done").length;
      const partial = statuses.filter((s) => s === "partial").length;
      return { fitness: FITNESS_META[f] || f, value: Math.round(((done + partial) / statuses.length) * 100) };
    });
  }, [activities]);

  const activityCompletion = React.useMemo(() => {
    return [...activities]
      .map((a) => ({ id: a.id, name: a.activityName, percent: a.completion?.percent ?? 0, hasLog: !!a.latestLog }))
      .sort((x, y) => y.percent - x.percent);
  }, [activities]);

  const measurableActivities = React.useMemo(() => activities.filter((a) => a.metricType && a.metricType !== "none"), [activities]);

  const selectedMetric = measurableActivities.find((a) => a.id === metricActivityId) || measurableActivities[0] || null;

  const metricSeries = React.useMemo(() => {
    if (!selectedMetric) return [];
    const field = resultFieldFor(selectedMetric.metricType);
    return allLogs
      .filter((l) => l.activityId === selectedMetric.id)
      .map((l) => ({ date: l.performedAt, label: fmtDate(l.performedAt), value: l[field] == null ? null : Number(l[field]) }))
      .filter((d) => d.value != null && Number.isFinite(d.value))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [allLogs, selectedMetric]);

  const metricTarget = selectedMetric ? targetValueFor(selectedMetric) : null;
  const metricUnit = selectedMetric ? resultUnitFor(selectedMetric.metricType) : "";

  return (
    <>
      <Head><title>{athlete.firstName} {athlete.lastName} — {plan.planName} | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Training" title={`${athlete.firstName} ${athlete.lastName}`} active="/training-plans">
        <div className={styles.pageTitle}>
          <div>
            <p className={styles.eyebrow}>{plan.planName} <span style={{ opacity: 0.6 }}>/</span> {athlete.athleteCode}{athlete.sport?.sportName ? ` · ${athlete.sport.sportName}` : ""}</p>
            <h1>{athlete.firstName} {athlete.lastName}</h1>
          </div>
          <div className={styles.actions}>
            <button className={styles.secondary} onClick={() => router.push(`/training-plans/${plan.id}`)}>Back to plan</button>
          </div>
        </div>

        <PageSectionTabs sections={ATHLETE_SECTIONS} defaultSection="overview">
          {manageOpen && !isAdmin && (
          <section className={styles.panel} style={{ marginBottom: "var(--space-5)" }}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Activity manager</p><h2>Manage {athlete.firstName}&apos;s activities</h2></div></div>
            {manageMsg && <p role="status" className={styles.empty} style={{ margin: "0 16px 12px", color: "var(--danger)" }}>{manageMsg}</p>}
            <AthleteActivitiesBlock
              planId={plan.id}
              planType={plan.planType}
              athlete={athlete}
              activities={allActivities.filter((a) => a.athleteId === athlete.id)}
              logs={allLogs}
              onRemove={removeActivity}
              onEdit={editActivity}
              onChanged={onActivitiesChanged}
            />
          </section>
        )}

        <div className={styles.statGrid} id="overview">
          <div className={styles.detailPanel}><h4>Planned activities</h4><div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)" }}>{summary.total}</div></div>
          <div className={styles.detailPanel}><h4>Completion</h4><div style={{ fontSize: 26, fontWeight: 800, color: completionColor(summary.completionPercent) }}>{summary.completionPercent}%</div><small style={{ color: "var(--muted)" }}>{summary.completed} done · {summary.partial} partial</small></div>
          <div className={styles.detailPanel}><h4>Missed</h4><div style={{ fontSize: 26, fontWeight: 800, color: summary.missed > 0 ? "#f87171" : "var(--muted)" }}>{summary.missed}</div></div>
          <div className={styles.detailPanel}><h4>Coach rating</h4><div style={{ fontSize: 26, fontWeight: 800, color: summary.rating != null ? (summary.rating >= 7 ? "var(--accent)" : summary.rating >= 5 ? "#fbbf24" : "#f87171") : "var(--muted)" }}>{summary.rating != null ? `${summary.rating}/10` : "—"}</div>{summary.rating != null && summary.ratingDate ? <small style={{ color: "var(--muted)" }}>{fmtDate(summary.ratingDate)}</small> : <small style={{ color: "var(--muted)" }}>No assessment yet</small>}</div>
          <div className={styles.detailPanel}><h4>Best performance score</h4><div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)" }}>{perfSummary.best != null ? fmtNum(perfSummary.best) : "—"}</div><small style={{ color: "var(--muted)" }}>{perfSummary.count ? `${perfSummary.count} performance${perfSummary.count === 1 ? "" : "s"} recorded` : "No performances yet"}</small></div>
          <div className={styles.detailPanel}><h4>Average performance score</h4><div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)" }}>{perfSummary.avg != null ? fmtNum(perfSummary.avg) : "—"}</div><small style={{ color: "var(--muted)" }}>Across all recorded exercises</small></div>
          <div className={styles.detailPanel}><h4>Sessions present</h4><div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)" }}>{attSummary.att.present} / {attSummary.totalAtt || 0}</div><small style={{ color: "var(--muted)" }}>{attSummary.attendanceRate != null ? `Attendance rate ${attSummary.attendanceRate}%` : "No sessions logged"}</small></div>
        </div>

        {error && <p role="status" className={styles.empty}>{error}</p>}

        {activities.length > 0 && (
          <section className={styles.panel} id="activities" style={{ position: "relative" }}>
            <div className={styles.panelHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div><p className={styles.eyebrow}>Activities</p><h2>Activities & progress</h2></div>
              {!isAdmin && <button className={styles.secondary} onClick={() => setManageOpen((c) => !c)}>{manageOpen ? "Close activity manager" : "Manage activities"}</button>}
            </div>
          {activities.length === 0 ? <p className={styles.empty}>No activities on this plan for this athlete.</p> : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Fitness</th>
                    <th>Target</th>
                    <th>Latest status</th>
                    <th>Completion</th>
                    <th>Attempts</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((a) => {
                    const log = a.latestLog;
                    const meta = log?.status ? { done: "Done", partial: "Partial", missed: "Missed" }[log.status] || log.status : "Not started";
                    const historyLogs = logsByActivity.get(a.id) || [];
                    const isExpanded = expandedActivityId === a.id;
                    return (
                      <React.Fragment key={a.id}>
                        <tr style={{ cursor: isExpanded ? "default" : "pointer" }} onClick={() => setExpandedActivityId(isExpanded ? null : a.id)}>
                          <td data-label="Activity"><strong>{a.activityName}</strong>{a.dayIndex ? <small> · Day {a.dayIndex}{a.weekNumber ? ` · W${a.weekNumber}` : ""}</small> : null}</td>
                          <td data-label="Fitness"><span className={styles.badge} style={{ background: "rgba(45,212,168,.16)", color: "var(--accent)", fontSize: 11 }}>{FITNESS_META[a.fitnessType] || a.fitnessType}</span></td>
                          <td data-label="Target">{(() => { if (a.metricType === "time" && a.targetTimeSec != null) return `${a.targetTimeSec} sec`; if (a.targetQuantity != null) return `${a.targetQuantity}${a.targetUnit ? ` ${a.targetUnit}` : ""}`; if (a.targetDistance != null) return `${a.targetDistance} m`; return "—"; })()}</td>
                          <td data-label="Status">{meta}{log?.performedAt ? <small> · {fmtDate(log.performedAt)}</small> : null}</td>
                          <td data-label="Completion" style={{ textAlign: "center" }}>{a.completion ? <strong style={{ color: completionColor(a.completion.percent) }}>{a.completion.percent}%</strong> : "—"}</td>
                          <td data-label="Attempts">{log?.attempts != null ? log.attempts : "—"}</td>
                          <td style={{ textAlign: "right", width: 40 }}>
                            <span style={{ fontSize: 14, color: "var(--muted)" }}>{isExpanded ? "▲" : "▼"}</span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan="7" style={{ padding: "var(--space-3) var(--space-3) var(--space-4)", background: "transparent" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {/* Activity history */}
                                <div>
                                  <h4 style={{ margin: "0 0 10px", color: "var(--accent)", fontSize: 14 }}>Full history ({historyLogs.length} session{historyLogs.length === 1 ? "" : "s"})</h4>
                                  {historyLogs.length === 0 ? <p className={styles.empty} style={{ margin: 0 }}>No sessions logged yet.</p> : (
                                    <div className={styles.tableWrap}>
                                      <table style={{ fontSize: 13 }}>
                                        <thead>
                                          <tr><th style={{ textAlign: "center" }}>Date</th><th>Status</th><th>Measured result</th><th style={{ textAlign: "center" }}>Attempts</th><th>Notes</th></tr>
                                        </thead>
                                        <tbody>
                                          {historyLogs.map((l) => (
                                            <tr key={l.id}>
                                              <td data-label="Date" style={{ textAlign: "center" }}>{fmtDate(l.performedAt)}</td>
                                              <td data-label="Status"><span className={`${styles.badge} ${styles[LOG_STATUS[l.status]?.cls || "badgeMuted"]}`}>{LOG_STATUS[l.status]?.label || l.status}</span></td>
                                              <td data-label="Result">{logResultText(l) || "—"}</td>
                                              <td data-label="Attempts" style={{ textAlign: "center" }}>{l.attempts != null ? l.attempts : "—"}</td>
                                              <td data-label="Notes">{l.notes || "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>

                                {/* Activity comment thread */}
                                <ActivityCommentThread
                                  planId={plan.id}
                                  activityId={a.id}
                                  athleteId={athlete.id}
                                  isAdmin={isAdmin}
                                  athleteName={`${athlete.firstName} ${athlete.lastName}`}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </section>
        )}

        {activities.length > 0 && (
          <section className={styles.panel} id="trends">
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Trends</p><h2>Progress over time</h2></div></div>
            <div className={styles.chartGrid}>
              <div className={styles.detailPanel}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                  <h4 style={{ margin: 0 }}>Completion trend</h4>
                  <label>Granularity
                    <select className={styles.fieldControl} value={trendGranularity} onChange={(e) => setTrendGranularity(e.target.value)}>
                      <option value="day">Daily</option>
                      <option value="week">Weekly</option>
                      <option value="month">Monthly</option>
                    </select>
                  </label>
                </div>
                {completionTrend.some((w) => w.total > 0) ? (
                  <ResponsiveContainer width="100%" height={CHART_HEIGHTS.line}>
                    <LineChart data={completionTrend} margin={CHART_MARGINS.line}>
                      <CartesianGrid {...CHART_GRID.cartesian} />
                      <XAxis dataKey="label" tick={CHART_AXIS.x} />
                      <YAxis domain={[0, 100]} tick={CHART_AXIS.y} tickFormatter={(v) => `${v}%`} />
                      <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`${v}%`, "Completion"]} labelFormatter={(l, p) => p?.[0]?.payload?.long || l} cursor={{ stroke: "rgba(45,212,168,0.4)" }} />
                      <Line type="monotone" dataKey="percent" name="Completion" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ fill: CHART_COLORS.primary, r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p className={styles.empty}>No logged sessions yet.</p>}
              </div>

              <div className={styles.detailPanel}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                  <h4 style={{ margin: 0 }}>Metric trend</h4>
                  {measurableActivities.length > 1 && (
                    <label style={{ minWidth: 200, fontSize: 12 }}>Activity
                      <select className={styles.fieldControl} value={selectedMetric?.id ?? ""} onChange={(e) => setMetricActivityId(Number(e.target.value))}>
                        {measurableActivities.map((a) => <option key={a.id} value={a.id}>{a.activityName} — {METRIC_LABELS[a.metricType] || a.metricType}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                {!selectedMetric ? (
                  <p className={styles.empty}>No measurable activities on this plan for this athlete.</p>
                ) : metricSeries.length === 0 ? (
                  <p className={styles.empty}>No logged results yet for this activity.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={CHART_HEIGHTS.line}>
                    <LineChart data={metricSeries} margin={CHART_MARGINS.line}>
                      <CartesianGrid {...CHART_GRID.cartesian} />
                      <XAxis dataKey="label" tick={CHART_AXIS.x} />
                      <YAxis tick={CHART_AXIS.y} />
                      <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`${v}${metricUnit ? ` ${metricUnit}` : ""}`, "Result"]} />
                      {metricTarget != null && <ReferenceLine y={metricTarget} stroke={CHART_COLORS.warning} strokeDasharray="4 4" label={{ value: `Target ${metricTarget}${metricUnit ? ` ${metricUnit}` : ""}`, fill: CHART_COLORS.warning, fontSize: 11, position: "insideTopRight" }} />}
                      <Line type="monotone" dataKey="value" name="Result" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ fill: CHART_COLORS.primary, r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className={styles.detailPanel}>
                <h4>Fitness balance <small style={{ color: "var(--muted)", fontWeight: 400 }}>(completion by fitness dimension)</small></h4>
                {radarData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={CHART_HEIGHTS.radar}>
                    <RadarChart data={radarData}>
                      <PolarGrid {...CHART_GRID.polar} />
                      <PolarAngleAxis dataKey="fitness" tick={CHART_AXIS.polarAngle} />
                      <PolarRadiusAxis domain={[0, 100]} tick={CHART_AXIS.polarRadius} tickCount={5} />
                      <Radar name="Completion" dataKey="value" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.35} />
                      <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`${v}%`, "Completion"]} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : <p className={styles.empty}>Add activities in more than one fitness dimension to see the balance.</p>}
              </div>

              <div className={styles.detailPanel}>
                <h4>Activity completion <small style={{ color: "var(--muted)", fontWeight: 400 }}>(per activity)</small></h4>
                {activityCompletion.length > 0 ? (
                  <ResponsiveContainer width="100%" height={barChartHeight(activityCompletion.length)}>
                    <BarChart data={activityCompletion} layout="vertical" margin={CHART_MARGINS.barHorizontal}>
                      <CartesianGrid {...CHART_GRID.cartesian} horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={CHART_AXIS.x} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="name" width={CHART_AXES.barCategory} tick={CHART_AXIS.y} tickFormatter={(v) => shortAxisLabel(v)} />
                      <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`${v}%`, "Completion"]} cursor={{ fill: "rgba(45,212,168,0.08)" }} />
                      <Bar dataKey="percent" radius={[0, 4, 4, 0]}>{activityCompletion.map((act) => <Cell key={act.id} fill={act.hasLog ? completionColor(act.percent) : CHART_COLORS.muted} />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className={styles.empty}>No activities yet.</p>}
              </div>
            </div>
          </section>
        )}

{activities.length > 0 && (
          <section className={styles.panel} id="distribution">
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Distribution</p><h2>Activities by fitness dimension</h2></div></div>
            {fitnessDist.length > 1 ? (
              <ResponsiveContainer width="100%" height={CHART_HEIGHTS.barHorizontal}>
                <BarChart data={fitnessDist} layout="vertical" margin={CHART_MARGINS.barHorizontal}>
                  <CartesianGrid {...CHART_GRID.cartesian} horizontal={false} />
                  <XAxis type="number" tick={CHART_AXIS.x} />
                  <YAxis type="category" dataKey="name" width={CHART_AXES.barCategory} tick={CHART_AXIS.y} tickFormatter={(v) => shortAxisLabel(v)} />
                  <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`${v} activities`, "Count"]} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>{fitnessDist.map((d) => <Cell key={d.name} fill={d.color} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className={styles.empty}>Add activities in more than one fitness dimension to see the distribution.</p>}
          </section>
        )}

        {/* Assessments tab */}
        <section className={styles.panel} id="assessments">
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Assessments</p><h2>Training assessments</h2></div></div>
          {trainingAssessments.length ? (
            <>
              {/* Training rating trend */}
              <section className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Trend</p><h2>Training rating trend</h2></div></div>
                {trainingAssessments.length ? (
                  <>
                    <MiniTrend points={trainingTrend(trainingAssessments)} />
                    <div className={styles.tableWrap} style={{ marginTop: "var(--space-4)" }}>
                      <table>
                        <thead><tr><th>Date</th><th>Rating</th><th>Fitness</th><th>Plan</th><th>Comments</th></tr></thead>
                        <tbody>
                          {[...trainingAssessments].reverse().slice(0, 10).map((a) => (
                            <tr key={a.id}>
                              <td data-label="Date">{fmtDate(a.assessmentDate)}</td>
                              <td data-label="Rating"><RatingChip rating={a.rating} /></td>
                              <td data-label="Fitness">{FITNESS_META_FULL[a.fitnessDimension] || "General"}</td>
                              <td data-label="Plan">{a.plan?.planName || "—"}</td>
                              <td data-label="Comments">{a.comments || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : <p className={styles.empty}>No training assessments yet.</p>}
              </section>

              {/* Strengths by fitness dimension */}
              <section className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Strengths</p><h2>Strengths by area</h2></div></div>
                {(() => {
                  const dims = trainingSummary(trainingAssessments);
                  return dims.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      {dims.map((d) => (
                        <div key={d.key} className={styles.detailPanel} style={{ minWidth: 200, flex: "1 1 200px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h4 style={{ margin: 0, textTransform: "capitalize" }}>{d.label}</h4>
                            <RatingChip rating={Math.round(d.latest)} />
                          </div>
                          <small style={{ color: "var(--muted)" }}>Avg {fmtNum(d.avg)}/10 · {d.count} assessment{d.count === 1 ? "" : "s"}</small>
                        </div>
                      ))}
                    </div>
                  ) : <p className={styles.empty}>No per-dimension assessments yet.</p>;
                })()}
              </section>
            </>
          ) : <p className={styles.empty}>No training assessments for this plan yet.</p>}
        </section>

        {/* Exercise Performance tab */}
        <section className={styles.panel} id="performance">
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Performance</p><h2>Exercise performance</h2></div></div>
          {performances.length ? (
            <>
              {/* Performance score trend */}
              <section className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Trend</p><h2>Exercise score trend</h2></div></div>
                {(() => {
                  const perf = performanceSummary(performances);
                  return perf.trend.length ? (
                    <>
                      <MiniTrend points={perf.trend} color={CHART_COLORS.secondary || CHART_COLORS.warning} />
                      <div className={styles.tableWrap} style={{ marginTop: "var(--space-4)" }}>
                        <table>
                          <thead><tr><th>Date</th><th>Exercise</th><th>Score</th><th>RPE</th></tr></thead>
                          <tbody>
                            {[...performances].reverse().slice(0, 10).map((p) => (
                              <tr key={p.id}>
                                <td data-label="Date">{fmtDate(p.recordedAt)}</td>
                                <td data-label="Exercise">{p.exercise?.exerciseName || "—"}</td>
                                <td data-label="Score">{fmtNum(p.score)}</td>
                                <td data-label="RPE">{p.rpe != null ? p.rpe : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : <p className={styles.empty}>No exercise performance data yet.</p>;
                })()}
              </section>

              {/* Best by exercise category */}
              <section className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Strengths</p><h2>Best scores by category</h2></div></div>
                {(() => {
                  const byCat = new Map();
                  for (const p of performances) {
                    if (p.score === null || p.score === undefined || isNaN(Number(p.score))) continue;
                    const cat = p.exercise?.category || "General";
                    if (!byCat.has(cat) || Number(p.score) > byCat.get(cat).score) {
                      byCat.set(cat, { score: Number(p.score), exercise: p.exercise?.exerciseName, date: p.recordedAt });
                    }
                  }
                  return byCat.size ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      {[...byCat.entries()].map(([cat, data]) => (
                        <div key={cat} className={styles.detailPanel} style={{ minWidth: 200, flex: "1 1 200px" }}>
                          <h4 style={{ margin: 0, textTransform: "capitalize" }}>{cat}</h4>
                          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)" }}>{fmtNum(data.score)}</div>
                          <small style={{ color: "var(--muted)" }}>{data.exercise} · {fmtDate(data.date)}</small>
                        </div>
                      ))}
                    </div>
                  ) : <p className={styles.empty}>No performance data yet.</p>;
                })()}
              </section>
            </>
          ) : <p className={styles.empty}>No exercise performance records yet.</p>}
        </section>

        {/* Attendance tab */}
        <section className={styles.panel} id="attendance">
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Attendance</p><h2>Training attendance</h2></div></div>
          {attendances.length ? (
            <>
              <section className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Effort</p><h2>Effort overview</h2></div></div>
                {(() => {
                  const effort = effortSummary(attendances);
                  return effort.totalAtt ? (
                    <>
                      <div className={styles.infoList}>
                        <div><dt>Sessions present</dt><dd>{effort.att.present}</dd></div>
                        <div><dt>Late</dt><dd>{effort.att.late}</dd></div>
                        <div><dt>Excused</dt><dd>{effort.att.excused}</dd></div>
                        <div><dt>Absent</dt><dd>{effort.att.absent}</dd></div>
                        {effort.attendanceRate != null && <div><dt>Attendance rate</dt><dd>{effort.attendanceRate}%</dd></div>}
                      </div>
                    </>
                  ) : <p className={styles.empty}>No attendance data yet.</p>;
                })()}
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Sessions</p><h2>Session history</h2></div></div>
                <div className={styles.tableWrap}><table>
                  <thead><tr><th>Date</th><th>Session</th><th>Status</th></tr></thead>
                  <tbody>
                    {attendances.map((a) => (
                      <tr key={a.id}>
                        <td data-label="Date">{fmtDate(a.session?.startTime)}</td>
                        <td data-label="Session">{a.session?.sessionType || "—"}</td>
                        <td data-label="Status"><span className={`${styles.badge} ${a.status === "present" ? styles.badgeActive : a.status === "late" ? styles.badgePending : styles.badgeRejected}`}>{a.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
            </>
          ) : <p className={styles.empty}>No attendance records yet.</p>}
        </section>

        {/* Achievements tab */}
        <section className={styles.panel} id="achievements">
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Recognition</p><h2>Achievements</h2></div></div>
          {achievements.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {achievements.map((a) => (
                <div key={a.id} className={styles.detailPanel}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <strong style={{ fontSize: 13 }}>{a.achievementTitle}</strong>
                    <small style={{ color: "var(--muted)", fontSize: 12 }}>{fmtDate(a.achievementDate)}</small>
                  </div>
                  {(a.medal || a.level) && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                      {a.medal && <span className={`${styles.badge} ${a.medal === "gold" ? styles.badgeActive : a.medal === "participation" ? styles.badgeMuted : styles.badgePending}`} style={{ textTransform: "capitalize" }}>{a.medal}</span>}
                      {a.level && <span className={`${styles.badge} ${styles.badgePending}`} style={{ textTransform: "capitalize" }}>{a.level}</span>}
                    </div>
                  )}
                  {a.achievementType && <small style={{ display: "block", color: "var(--accent)", fontSize: 12, textTransform: "capitalize", marginTop: 4 }}>{a.achievementType}</small>}
                  {a.organization && <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{a.organization}</small>}
                  {a.description && <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{a.description}</small>}
                </div>
              ))}
            </div>
          ) : <p className={styles.empty}>No achievements recorded yet.</p>}
        </section>

        {/* Health tab */}
        <section className={styles.panel} id="health">
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Wellness</p><h2>Recent health history</h2></div><HealthBadge status={athlete.healthStatus} /></div>
          {healthLogs.length ? (
            <div className={styles.tableWrap}><table>
              <thead><tr><th>Status</th><th>Notes</th><th>Date</th></tr></thead>
              <tbody>
                {healthLogs.map((h) => (
                  <tr key={h.id}>
                    <td data-label="Status"><HealthBadge status={h.status} /></td>
                    <td data-label="Notes">{h.description || "—"}</td>
                    <td data-label="Date">{fmtDate(h.reportedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <p className={styles.empty}>No health history recorded yet.</p>}
        </section>
      </PageSectionTabs>
      </AppShell>
    </>
  );
}