import Head from "next/head";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { getSession, useSession } from "next-auth/react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  LineChart, Line,
} from "recharts";
import { prisma } from "../lib/prisma";
import styles from "../styles/Dashboard.module.css";
import AppShell from "../components/AppShell";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };

  const now = new Date();
  const weekStart = (d) => {
    const x = new Date(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const todayWeek = weekStart(now);
  const firstBucket = new Date(todayWeek.getTime() - 7 * 7 * 86400000);

  const [athletes, coaches, sports, events, assessments, plans, logs, evals, healthIssues, trainingPlans, activityLogs, trainingAssessments] = await Promise.all([
    prisma.athlete.count(), prisma.coach.count(), prisma.sport.count(), prisma.event.count(),
    prisma.assessment.count(), prisma.eventPlan.count({ where: { status: "open" } }), prisma.auditLog.count(),
    prisma.coachPerformance.count(), prisma.athlete.count({ where: { healthStatus: { in: ["sick", "injured", "recovering", "inactive"] } } }),
    prisma.trainingPlan.count(),
    prisma.planActivityLog.findMany({ where: { performedAt: { gte: firstBucket }, status: { in: ["done", "partial", "missed"] } }, select: { status: true, performedAt: true } }),
    prisma.trainingAssessment.findMany({ take: 24, orderBy: { assessmentDate: "desc" }, select: { rating: true, assessmentDate: true, athlete: { select: { firstName: true, lastName: true } } } }),
  ]);

  const buckets = [];
  for (let i = 0; i < 8; i += 1) {
    buckets.push({ when: new Date(firstBucket.getTime() + i * 7 * 86400000).toISOString(), done: 0, partial: 0, missed: 0 });
  }
  for (const log of activityLogs) {
    const ws = weekStart(log.performedAt);
    let idx = Math.round((ws.getTime() - firstBucket.getTime()) / 86400000 / 7);
    if (idx < 0) idx = 0;
    if (idx > 7) idx = 7;
    buckets[idx][log.status] += 1;
  }

  const ratingSeries = trainingAssessments.slice().reverse().map((r) => ({
    when: r.assessmentDate.toISOString(),
    rating: r.rating,
    athlete: `${r.athlete.firstName} ${r.athlete.lastName}`,
  }));

  const recentAssessments = await prisma.assessment.findMany({
    take: 5, orderBy: { assessmentDate: "desc" },
    select: { id: true, assessmentDate: true, assessmentType: true, athlete: { select: { athleteCode: true, firstName: true, lastName: true } } },
  });

  return {
    props: {
      session,
      stats: { athletes, coaches, sports, events, assessments, plans, logs, evals, healthIssues, trainingPlans },
      completion: JSON.parse(JSON.stringify(buckets)),
      ratingSeries: JSON.parse(JSON.stringify(ratingSeries)),
      recentAssessments: recentAssessments.map((item) => ({ ...item, assessmentDate: item.assessmentDate.toISOString() })),
    },
  };
}

const chartTooltip = { contentStyle: { background: "#06261e", border: "1px solid rgba(45,212,168,.35)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#e7f7f1", fontWeight: 700 }, itemStyle: { color: "#9db6c7" } };
const weekLabel = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dateLabel = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function Dashboard({ stats, completion, ratingSeries, recentAssessments }) {
  const router = useRouter();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.mustChangePassword) router.replace("/change-password");
  }, [session, router]);
  if (!session) return <main className={styles.loading}><p>Loading secure account...</p></main>;
  if (session.user.mustChangePassword) return <main className={styles.loading}><p>Redirecting to secure password change...</p></main>;
  const isAdmin = session.user.role === "admin";
  const cards = isAdmin
    ? [
        ["Athletes", stats.athletes, "/athletes"],
        ["Coaches", stats.coaches, "/admin/coaches"],
        ["Sports", stats.sports, "/admin/catalog"],
        ["Assessments", stats.assessments, "/assessments"],
      ]
    : [
        ["All athletes", stats.athletes, "/athletes"],
        ["My sports", stats.sports, "/athletes"],
        ["Assessments", stats.assessments, "/assessments"],
        ["Open event plans", stats.plans, "/event-plans"],
      ];
  const hasCompletion = completion.some((w) => w.done > 0 || w.partial > 0 || w.missed > 0);
  return <>
    <Head><title>Dashboard | Cauayan Athlete Performance</title><meta name="description" content="Athlete performance monitoring dashboard" /></Head>
    <AppShell session={session} isAdmin={isAdmin} active="/dashboard">
      <section className={styles.intro}><div><p className={styles.eyebrow}>Overview</p><h2>Good day, {session.user.name?.split(" ")[0] || "team"}.</h2><p>Here is what is happening across the athletics program today. Click any card to dig in.</p></div></section>
      <section className={styles.cards} aria-label="System totals">{cards.map(([label, value, href]) => <Link className={styles.card} href={href} key={label}><span>{label}</span><strong>{value}</strong><small>View details</small></Link>)}</section>
      {isAdmin && <section className={styles.cards} aria-label="Administration summary">{[["Training plans", stats.trainingPlans, "/training-plans"], ["Coach evaluations", stats.evals, "/admin/coach-performances"], ["Athletes with health flags", stats.healthIssues, "/athletes?health=flagged"], ["Open event plans", stats.plans, "/event-plans"]].map(([label, value, href]) => <Link className={styles.card} href={href} key={label}><span>{label}</span><strong>{value}</strong><small>View details</small></Link>)}</section>}
      <section className={styles.grid}>
        <div className={styles.detailPanel} style={{ width: "100%" }}>
          <h4>Training activity completion <small style={{ color: "var(--muted)", fontWeight: 400 }}>last 8 weeks, from real activity logs</small></h4>
          {hasCompletion ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={completion} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(127,199,175,0.12)" strokeDasharray="3 3" />
                <XAxis dataKey="when" tickFormatter={weekLabel} tick={{ fill: "#9db6c7", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "#9db6c7", fontSize: 11 }} />
                <Tooltip {...chartTooltip} labelFormatter={weekLabel} formatter={(v, name) => [`${v}`, name]} cursor={{ fill: "rgba(45,212,168,0.08)" }} />
                <Legend iconType="circle" wrapperStyle={{ color: "#9db6c7", fontSize: 11 }} />
                <Bar dataKey="done" stackId="a" fill="#2dd4a8" name="Done" />
                <Bar dataKey="partial" stackId="a" fill="#facc15" name="Partial" />
                <Bar dataKey="missed" stackId="a" fill="#f87171" name="Missed" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>No training activity recorded yet. Coaches will log assessments from each training plan.</p>}
        </div>
      </section>
      <section className={styles.grid}>
        <div className={styles.detailPanel}>
          <h4>Training ratings <small style={{ color: "var(--muted)", fontWeight: 400 }}>1–10 per assessment</small></h4>
          {ratingSeries.length >= 2 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={ratingSeries} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(127,199,175,0.12)" strokeDasharray="3 3" />
                <XAxis dataKey="when" tickFormatter={dateLabel} tick={{ fill: "#9db6c7", fontSize: 11 }} />
                <YAxis domain={[0, 10]} tick={{ fill: "#9db6c7", fontSize: 11 }} />
                <Tooltip {...chartTooltip} labelFormatter={dateLabel} formatter={(v) => [`${v}/10`, "Rating"]} />
                <Line type="monotone" dataKey="rating" stroke="#2dd4a8" strokeWidth={2} dot={{ fill: "#2dd4a8", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>{ratingSeries.length ? "Add one more assessment to see the rating trend." : "No training assessments recorded yet."}</p>}
        </div>
        <div className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>Catalog</p><h2>Coverage</h2></div></div><dl className={styles.coverage}><div><dt>Sports</dt><dd>{stats.sports}</dd></div><div><dt>Events</dt><dd>{stats.events}</dd></div><div><dt>Open plans</dt><dd>{stats.plans}</dd></div></dl><Link className={styles.secondary} href={isAdmin ? "/admin/catalog" : "/event-plans"}>{isAdmin ? "Manage catalog" : "View event plans"}</Link></div>
      </section>
      <section className={styles.grid}><div className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>Monitoring</p><h2>Recent assessments</h2></div><Link href="/assessments">View assessments</Link></div>{recentAssessments.length ? <div className={styles.tableWrap}><table><thead><tr><th>Athlete</th><th>Date</th><th>Type</th></tr></thead><tbody>{recentAssessments.map((assessment) => <tr key={assessment.id}><td><strong>{assessment.athlete.firstName} {assessment.athlete.lastName}</strong><small>{assessment.athlete.athleteCode}</small></td><td>{new Date(assessment.assessmentDate).toLocaleDateString()}</td><td>{assessment.assessmentType}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No assessments recorded yet.</p>}</div>
        <div className={styles.detailPanel}><p className={styles.eyebrow}>Open plans</p><h2>Latest training</h2><p>{stats.trainingPlans > 0 ? `${stats.trainingPlans} training plan${stats.trainingPlans === 1 ? "" : "s"} in the system. Visit a plan to record activity assessments.` : "No training plans yet. Coaches can create one from the training page."}</p><Link className={styles.secondary} href="/training-plans">Open training</Link></div></section>
        {isAdmin && <section className={styles.grid}>
          <div className={styles.panel}><p className={styles.eyebrow}>People management</p><h2>Coaches</h2><p>{stats.coaches} coach records. Approve coaches, inspect their files, and control account access.</p><Link className={styles.secondary} href="/admin/coaches">Manage coaches</Link></div>
          <div className={styles.panel}><p className={styles.eyebrow}>Catalog</p><h2>Sports &amp; Discipline</h2><p>Maintain the sports and disciplines used across the system.</p><Link className={styles.secondary} href="/admin/catalog">Manage catalog</Link></div>
          <div className={styles.panel}><p className={styles.eyebrow}>Measurements</p><h2>Performance metrics</h2><p>Configure the quantifiable metrics that define each event.</p><Link className={styles.secondary} href="/admin/metrics">Configure metrics</Link></div>
          <div className={styles.panel}><p className={styles.eyebrow}>Records</p><h2>Audit trail</h2><p>{stats.logs} meaningful actions recorded in the database.</p><Link className={styles.secondary} href="/admin/audit-logs">Review logs</Link></div>
          <div className={styles.panel}><p className={styles.eyebrow}>Maintenance</p><h2>Database backup</h2><p>Request backups and plan off-site snapshots.</p><Link className={styles.secondary} href="/admin/backup">Backup</Link></div>
        </section>}
    </AppShell>
  </>;
}