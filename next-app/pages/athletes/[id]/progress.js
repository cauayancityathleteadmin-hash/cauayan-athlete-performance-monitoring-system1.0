import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../../../lib/prisma";
import AppShell from "../../../components/AppShell";
import styles from "../../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };

  const id = Number(context.query.id);
  if (!Number.isSafeInteger(id) || id <= 0) return { notFound: true };

  const athlete = await prisma.athlete.findUnique({
    where: { id },
    select: {
      id: true,
      athleteCode: true,
      firstName: true,
      middleName: true,
      lastName: true,
      healthStatus: true,
      healthNotes: true,
      sport: { select: { sportName: true } },
      coach: { select: { firstName: true, lastName: true } },
    },
  });

  if (!athlete) return { notFound: true };

  if (session.user.role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach) return { redirect: { destination: "/dashboard", permanent: false } };
    const basic = await prisma.athlete.findUnique({ where: { id }, select: { coachId: true } });
    if (!basic || basic.coachId !== coach.id) return { redirect: { destination: "/dashboard", permanent: false } };
  }

  const [trainingAssessments, performances, attendances, planLogs, achievements, healthLogs] = await Promise.all([
    prisma.trainingAssessment.findMany({
      where: { athleteId: id },
      orderBy: { assessmentDate: "asc" },
      select: { id: true, assessmentDate: true, rating: true, fitnessDimension: true, comments: true, plan: { select: { planName: true } } },
    }),
    prisma.exercisePerformance.findMany({
      where: { athleteId: id },
      orderBy: { recordedAt: "asc" },
      select: { id: true, recordedAt: true, score: true, rpe: true, exercise: { select: { exerciseName: true, category: true } } },
    }),
    prisma.trainingAttendance.findMany({
      where: { athleteId: id },
      select: { id: true, status: true, session: { select: { sessionDate: true } } },
    }),
    prisma.planActivityLog.findMany({
      where: { athleteId: id },
      select: { id: true, status: true, performedAt: true, quantityDone: true, activity: { select: { activityName: true } } },
    }),
    prisma.achievement.findMany({
      where: { athleteId: id },
      orderBy: { achievementDate: "desc" },
      select: { id: true, achievementTitle: true, achievementType: true, achievementDate: true, organization: true, description: true },
    }),
    prisma.healthLog.findMany({
      where: { athleteId: id },
      orderBy: { reportedAt: "desc" },
      take: 5,
      select: { id: true, status: true, description: true, reportedAt: true },
    }),
  ]);

  return {
    props: {
      session,
      isAdmin: session.user.role === "admin",
      athlete: JSON.parse(JSON.stringify(athlete)),
      trainingAssessments: JSON.parse(JSON.stringify(trainingAssessments)),
      performances: JSON.parse(JSON.stringify(performances)),
      attendances: JSON.parse(JSON.stringify(attendances)),
      planLogs: JSON.parse(JSON.stringify(planLogs)),
      achievements: JSON.parse(JSON.stringify(achievements)),
      healthLogs: JSON.parse(JSON.stringify(healthLogs)),
    },
  };
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtNum(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return isNaN(n) ? String(value) : n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

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

const FITNESS_META = {
  endurance: "Endurance",
  strength: "Strength",
  power: "Power",
  speed_agility: "Speed / Agility",
  skill_technique: "Skill / Technique",
  mobility: "Mobility",
  recovery: "Recovery",
};

/* Latest training rating summary per fitness dimension */
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
    out.push({ key, label: FITNESS_META[key] || (key === "general" ? "General" : key), latest: ratings[ratings.length - 1], avg, count: ratings.length });
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

/* Effort summary from attendance + plan logs */
function effortSummary(attendances, planLogs) {
  const att = { present: 0, late: 0, excused: 0, absent: 0 };
  for (const a of attendances) att[a.status] = (att[a.status] || 0) + 1;
  const log = { done: 0, partial: 0, missed: 0, planned: 0 };
  for (const l of planLogs) log[l.status] = (log[l.status] || 0) + 1;
  const totalAtt = attendances.length;
  const plannedSessions = log.done + log.partial + log.missed;
  return {
    attendances,
    planLogs,
    att,
    log,
    totalAtt,
    plannedSessions,
    completionRate: plannedSessions ? Math.round(((log.done + log.partial) / plannedSessions) * 100) : null,
    attendanceRate: totalAtt ? Math.round(((att.present + att.late) / totalAtt) * 100) : null,
  };
}

function MiniTrend({ points }) {
  const w = 360;
  const h = 110;
  const padL = 8;
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
          <stop offset="0%" stopColor="rgba(45, 212, 168, 0.35)" />
          <stop offset="100%" stopColor="rgba(45, 212, 168, 0.02)" />
        </linearGradient>
      </defs>
      {[0.1, 0.5, 0.9].map((fy) => (
        <line key={fy} x1={padL} x2={w - padR} y1={padT + plotH * fy} y2={padT + plotH * fy} stroke="rgba(127, 199, 175, 0.12)" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#ptrend)" />
      <path d={path} fill="none" stroke="#2dd4a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r="3" fill="#041f18" stroke="#2dd4a8" strokeWidth="2" />
          <text x={c.x} y={h - 7} textAnchor="middle" fontSize="8" fill="var(--muted)">{c.p.when}</text>
        </g>
      ))}
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
  const tone = rating >= 8 ? "rgba(45,212,168,.16)" : rating >= 6 ? "rgba(250,204,21,.16)" : "rgba(248,113,113,.16)";
  const color = rating >= 8 ? "var(--accent)" : rating >= 6 ? "#facc15" : "var(--danger)";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700, background: tone, color }}>{rating}<small style={{ fontSize: 9, opacity: .7 }}>/10</small></span>;
}

export default function AthleteProgress({ session, isAdmin, athlete, trainingAssessments, performances, attendances, planLogs, achievements, healthLogs }) {
  const router = useRouter();
  const dims = React.useMemo(() => trainingSummary(trainingAssessments), [trainingAssessments]);
  const tTrend = React.useMemo(() => trainingTrend(trainingAssessments), [trainingAssessments]);
  const perf = React.useMemo(() => performanceSummary(performances), [performances]);
  const effort = React.useMemo(() => effortSummary(attendances, planLogs), [attendances, planLogs]);
  const latestRating = trainingAssessments.length ? trainingAssessments[trainingAssessments.length - 1].rating : null;

  return (
    <>
      <Head><title>{athlete.firstName} {athlete.lastName} | Progress</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Monitoring" title="Athlete progress" active="/athletes">
        <div className={styles.pageTitle}>
          <div>
            <p className={styles.eyebrow}>Live progress · {athlete.sport?.sportName || "—"} · Coach {athlete.coach ? `${athlete.coach.firstName} ${athlete.coach.lastName}` : "—"}</p>
            <h1>{athlete.firstName} {athlete.middleName ? `${athlete.middleName} ` : ""}{athlete.lastName}</h1>
          </div>
          <div className={styles.actions}>
            <HealthBadge status={athlete.healthStatus} />
            <Link className={styles.secondary} href={`/athletes/${athlete.id}`}>Full profile</Link>
          </div>
        </div>
        <p className={styles.formHint} style={{ marginTop: 0 }}>This view combines training scores, physical performance, effort, and achievements — and updates the moment new data is saved.</p>

        {/* Top live stats */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Now</p><h2>Current standing</h2></div></div>
          <div className={styles.grid}>
            <Stat label="Latest training rating" value={latestRating != null ? `${latestRating}/10` : "—"} sub={latestRating != null && trainingAssessments.length ? fmtDate(trainingAssessments[trainingAssessments.length - 1].assessmentDate) : "No assessments yet"} />
            <Stat label="Best performance score" value={perf.best != null ? fmtNum(perf.best) : "—"} sub={perf.count ? `${perf.count} performance${perf.count === 1 ? "" : "s"} recorded` : "No performances yet"} />
            <Stat label="Avg performance score" value={perf.avg != null ? fmtNum(perf.avg) : "—"} sub="Across all recorded exercises" />
            <Stat label="Sessions present" value={`${effort.att.present} / ${effort.totalAtt || 0}`} sub={effort.attendanceRate != null ? `Attendance rate ${effort.attendanceRate}%` : "No sessions logged"} />
          </div>
        </section>

        <div className={styles.grid}>
          {/* Training score trend */}
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Training</p><h2>Assessment score trend</h2></div></div>
            {trainingAssessments.length ? (
              <>
                <MiniTrend points={tTrend} />
                <div className={styles.tableWrap} style={{ marginTop: 16 }}>
                  <table>
                    <thead><tr><th>Date</th><th>Rating</th><th>Fitness</th><th>Plan</th></tr></thead>
                    <tbody>
                      {[...trainingAssessments].reverse().slice(0, 10).map((a) => (
                        <tr key={a.id}>
                          <td>{fmtDate(a.assessmentDate)}</td>
                          <td><RatingChip rating={a.rating} /></td>
                          <td>{FITNESS_META[a.fitnessDimension] || "General"}</td>
                          <td>{a.plan?.planName || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <p className={styles.empty}>No training assessments yet.</p>}
          </section>

          {/* Performance score trend */}
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Performance</p><h2>Exercise score trend</h2></div></div>
            {perf.trend.length ? (
              <>
                <MiniTrend points={perf.trend} />
                <div className={styles.tableWrap} style={{ marginTop: 16 }}>
                  <table>
                    <thead><tr><th>Date</th><th>Exercise</th><th>Score</th><th>RPE</th></tr></thead>
                    <tbody>
                      {[...performances].reverse().slice(0, 10).map((p) => (
                        <tr key={p.id}>
                          <td>{fmtDate(p.recordedAt)}</td>
                          <td>{p.exercise?.exerciseName || "—"}</td>
                          <td>{fmtNum(p.score)}</td>
                          <td>{p.rpe != null ? p.rpe : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <p className={styles.empty}>No exercise performance data yet.</p>}
          </section>
        </div>

        {/* Best by fitness dimension */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Strengths</p><h2>Per-fitness training summary</h2></div></div>
          {dims.length ? (
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
          ) : <p className={styles.empty}>No per-dimension assessments yet.</p>}
        </section>

        <div className={styles.grid}>
          {/* Effort */}
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Effort</p><h2>Attendance &amp; activity completion</h2></div></div>
            {effort.totalAtt || effort.plannedSessions ? (
              <>
                <div className={styles.infoList}>
                  <div><dt>Sessions present</dt><dd>{effort.att.present}</dd></div>
                  <div><dt>Late</dt><dd>{effort.att.late}</dd></div>
                  <div><dt>Excused</dt><dd>{effort.att.excused}</dd></div>
                  <div><dt>Absent</dt><dd>{effort.att.absent}</dd></div>
                  <div><dt>Activities done</dt><dd>{effort.log.done}</dd></div>
                  <div><dt>Partial</dt><dd>{effort.log.partial}</dd></div>
                  <div><dt>Missed</dt><dd>{effort.log.missed}</dd></div>
                  {effort.completionRate != null && <div><dt>Completion rate</dt><dd>{effort.completionRate}%</dd></div>}
                </div>
              </>
            ) : <p className={styles.empty}>No attendance or activity logs yet.</p>}
          </section>

          {/* Achievements */}
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Recognition</p><h2>Achievements</h2></div></div>
            {achievements.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {achievements.map((a) => (
                  <div key={a.id} className={styles.detailPanel} style={{ padding: 10 }}>
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
        </div>

        {/* Recent health */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Wellness</p><h2>Recent health history</h2></div><HealthBadge status={athlete.healthStatus} /></div>
          {healthLogs.length ? (
            <div className={styles.tableWrap}><table>
              <thead><tr><th>Status</th><th>Notes</th><th>Date</th></tr></thead>
              <tbody>
                {healthLogs.map((h) => (
                  <tr key={h.id}>
                    <td><HealthBadge status={h.status} /></td>
                    <td>{h.description || "—"}</td>
                    <td>{fmtDate(h.reportedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <p className={styles.empty}>No health history recorded yet.</p>}
        </section>
      </AppShell>
    </>
  );
}
