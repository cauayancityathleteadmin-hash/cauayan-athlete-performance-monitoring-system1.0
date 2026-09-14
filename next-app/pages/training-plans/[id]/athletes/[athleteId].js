import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { getSession } from "next-auth/react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from "recharts";
import { prisma } from "../../../../lib/prisma";
import AppShell from "../../../../components/AppShell";
import styles from "../../../../styles/Dashboard.module.css";

const FITNESS_META = {
  endurance: "Endurance", strength: "Strength", power: "Power",
  speed_agility: "Speed / Agility", skill_technique: "Skill / Technique", mobility: "Mobility", recovery: "Recovery",
};

const CHART_PALETTE = ["#2dd4a8", "#86efac", "#14b8a6", "#34d399", "#4ade80", "#0d9488", "#5eead4", "#6ee7b7"];
const chartTooltip = {
  contentStyle: { background: "#06261e", border: "1px solid rgba(45,212,168,.35)", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#e7f7f1", fontWeight: 700 },
  itemStyle: { color: "#9db6c7" },
};

function fmtDate(value) {
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function percentColor(p) {
  if (p == null) return "#64748b";
  if (p >= 80) return "#2dd4a8";
  if (p >= 50) return "#fbbf24";
  return "#f87171";
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
    select: { id: true, planName: true, coachId: true, startDate: true, durationDays: true, durationWeeks: true },
  });
  if (!plan) return { redirect: { destination: "/training-plans", permanent: false } };
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || plan.coachId !== coach.id) return { redirect: { destination: "/training-plans", permanent: false } };
  }

  const onPlan = await prisma.trainingPlanAthlete.findFirst({
    where: { planId, athleteId },
    select: { athlete: { select: { id: true, firstName: true, lastName: true, athleteCode: true, sport: { select: { sportName: true } } } } },
  });
  if (!onPlan) return { redirect: { destination: `/training-plans/${planId}`, permanent: false } };

  return {
    props: {
      session,
      isAdmin,
      plan: { id: plan.id, planName: plan.planName, startDate: plan.startDate.toISOString(), durationDays: plan.durationDays, durationWeeks: plan.durationWeeks },
      athlete: onPlan.athlete,
    },
  };
}

export default function AthleteDrillPage({ session, isAdmin, plan, athlete }) {
  const router = useRouter();
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    fetch(`/api/progress?planId=${plan.id}&athleteId=${athlete.id}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((json) => { if (json.activities) setData(json); else setError(json.error || "Could not load progress."); })
      .catch(() => setError("Unable to reach the server."));
  }, [plan.id, athlete.id]);

  const activities = React.useMemo(() => data?.activities || [], [data]);
  const summary = data?.summary || { total: 0, completed: 0, partial: 0, missed: 0, completionPercent: 0, averageScore: null };

  const scoreTimeline = React.useMemo(() => {
    return activities
      .filter((a) => a.latestLog?.score != null || a.latestLog?.performedAt)
      .map((a) => ({
        name: a.activityName.length > 14 ? a.activityName.slice(0, 14) + "…" : a.activityName,
        score: a.latestLog?.score != null ? Number(a.latestLog.score) : 0,
        completion: a.completion?.percent || 0,
        fitness: a.fitnessType,
        date: a.latestLog?.performedAt,
      }))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [activities]);

  const fitnessDist = React.useMemo(() => {
    const map = new Map();
    for (const a of activities) map.set(a.fitnessType, (map.get(a.fitnessType) || 0) + 1);
    return [...map.entries()].map(([k, count], i) => ({ name: FITNESS_META[k] || k, count, color: CHART_PALETTE[i % CHART_PALETTE.length] }));
  }, [activities]);

  return (
    <>
      <Head><title>{athlete.firstName} {athlete.lastName} — {plan.planName} | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Training" title={`${athlete.firstName} ${athlete.lastName}`} active="/training-plans">
        <nav className={styles.eyebrow} style={{ lineHeight: 1.5, marginBottom: 12 }}>
          Training <span style={{ opacity: 0.6 }}>/</span> Trainings <span style={{ opacity: 0.6 }}>/</span>
          <span style={{ cursor: "pointer", opacity: 0.85 }} onClick={() => router.push(`/training-plans/${plan.id}`)}>{plan.planName}</span>
          <span style={{ opacity: 0.6 }}>/</span> Athletes <span style={{ opacity: 0.6 }}>/</span> <strong>{athlete.firstName} {athlete.lastName}</strong>
        </nav>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <div className={styles.pageActions}>
            <span className={styles.eyebrow}>{athlete.athleteCode} {athlete.sport?.sportName ? `· ${athlete.sport.sportName}` : ""}</span>
          </div>
          <button className={styles.secondary} onClick={() => router.push(`/training-plans/${plan.id}`)}>← Back to plan</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, marginBottom: 20 }}>
          <div className={styles.detailPanel}><h4>Planned activities</h4><div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)" }}>{summary.total}</div></div>
          <div className={styles.detailPanel}><h4>Completion</h4><div style={{ fontSize: 26, fontWeight: 800, color: percentColor(summary.completionPercent) }}>{summary.completionPercent}%</div><small style={{ color: "var(--muted)" }}>{summary.completed} done · {summary.partial} partial</small></div>
          <div className={styles.detailPanel}><h4>Missed</h4><div style={{ fontSize: 26, fontWeight: 800, color: summary.missed > 0 ? "#f87171" : "var(--muted)" }}>{summary.missed}</div></div>
          <div className={styles.detailPanel}><h4>Avg score</h4><div style={{ fontSize: 26, fontWeight: 800, color: summary.averageScore != null ? (summary.averageScore >= 7 ? "var(--accent)" : summary.averageScore >= 5 ? "#fbbf24" : "#f87171") : "var(--muted)" }}>{summary.averageScore != null ? `${summary.averageScore}/10` : "—"}</div></div>
        </div>

        {error && <p role="status" className={styles.empty}>{error}</p>}

        {activities.length > 0 && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Scores</p><h2>Latest score by activity</h2></div></div>
            {scoreTimeline.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={scoreTimeline} margin={{ top: 6, right: 10, left: 16, bottom: 24 }}>
                  <CartesianGrid stroke="rgba(127,199,175,0.12)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#9db6c7", fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fill: "#9db6c7", fontSize: 12 }} />
                  <Tooltip {...chartTooltip} formatter={(v) => [`${v}/10`, "Score"]} labelFormatter={(l) => l} cursor={{ fill: "rgba(45,212,168,0.08)" }} />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]}>{scoreTimeline.map((d) => <Cell key={d.name} fill={percentColor(d.score * 10)} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className={styles.empty}>No scored activities yet.</p>}
          </section>
        )}

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Activities</p><h2>Activities & progress</h2></div></div>
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
                    <th>Score</th>
                    <th>Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((a) => {
                    const log = a.latestLog;
                    const meta = log?.status ? { done: "Done", partial: "Partial", missed: "Missed" }[log.status] || log.status : "Not started";
                    return (
                      <tr key={a.id}>
                        <td data-label="Activity"><strong>{a.activityName}</strong>{a.dayIndex ? <small> · Day {a.dayIndex}{a.weekNumber ? ` · W${a.weekNumber}` : ""}</small> : null}</td>
                        <td data-label="Fitness"><span className={styles.badge} style={{ background: "rgba(45,212,168,.16)", color: "var(--accent)", fontSize: 11 }}>{FITNESS_META[a.fitnessType] || a.fitnessType}</span></td>
                        <td data-label="Target">{(() => { if (a.metricType === "time" && a.targetTimeSec != null) return `${a.targetTimeSec} sec`; if (a.targetQuantity != null) return `${a.targetQuantity}${a.targetUnit ? ` ${a.targetUnit}` : ""}`; if (a.targetDistance != null) return `${a.targetDistance} m`; return "—"; })()}</td>
                        <td data-label="Status">{meta}{log?.performedAt ? <small> · {fmtDate(log.performedAt)}</small> : null}</td>
                        <td data-label="Completion" style={{ textAlign: "center" }}>{a.completion ? <strong style={{ color: percentColor(a.completion.percent) }}>{a.completion.percent}%</strong> : "—"}</td>
                        <td data-label="Score">{log?.score != null ? <strong>{log.score}/10</strong> : "—"}</td>
                        <td data-label="Attempts">{log?.attempts != null ? log.attempts : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {fitnessDist.length > 1 && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Distribution</p><h2>Activities by fitness dimension</h2></div></div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={fitnessDist} layout="vertical" margin={{ top: 6, right: 16, left: 16, bottom: 24 }}>
                <CartesianGrid stroke="rgba(127,199,175,0.12)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#9db6c7", fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fill: "#9db6c7", fontSize: 12 }} />
                <Tooltip {...chartTooltip} formatter={(v) => [`${v} activities`, "Count"]} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>{fitnessDist.map((d) => <Cell key={d.name} fill={d.color} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>
        )}
      </AppShell>
    </>
  );
}