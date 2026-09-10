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

  const isAdmin = session.user.role === "admin";
  const canApprove = isAdmin || Boolean(session?.user?.canApproveCoaches);
  let coachScope = null;
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({
      where: { userId: Number(session.user.id) },
      select: { id: true },
    });
    if (coach) coachScope = { coachId: coach.id };
  }

  const fromToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextWeek = new Date(fromToday.getTime() + 7 * 86400000);

  const [athletes, coaches, sports, events, assessments, plans, logs, evals, healthIssues, trainingPlans, activityLogs, trainingAssessments, mySports, myApprovedPlans, pendingCoaches, upcomingSessions] = await Promise.all([
    coachScope ? prisma.athlete.count({ where: coachScope }) : prisma.athlete.count(),
    prisma.coach.count(), prisma.sport.count(), prisma.event.count(),
    coachScope ? prisma.assessment.count({ where: { athlete: coachScope } }) : prisma.assessment.count(),
    prisma.eventPlan.count({ where: { status: "open" } }), prisma.auditLog.count(),
    prisma.coachPerformance.count(),
    coachScope ? prisma.athlete.count({ where: { ...coachScope, healthStatus: { in: ["sick", "injured", "recovering", "inactive"] } } }) : prisma.athlete.count({ where: { healthStatus: { in: ["sick", "injured", "recovering", "inactive"] } } }),
    coachScope ? prisma.trainingPlan.count({ where: coachScope }) : prisma.trainingPlan.count(),
    coachScope
      ? prisma.planActivityLog.findMany({ where: { performedAt: { gte: firstBucket }, status: { in: ["done", "partial", "missed"] }, activity: { plan: { coachId: coachScope.coachId } } }, select: { status: true, performedAt: true } })
      : prisma.planActivityLog.findMany({ where: { performedAt: { gte: firstBucket }, status: { in: ["done", "partial", "missed"] } }, select: { status: true, performedAt: true } }),
    coachScope
      ? prisma.trainingAssessment.findMany({ where: { athlete: coachScope }, take: 24, orderBy: { assessmentDate: "desc" }, select: { rating: true, assessmentDate: true, athlete: { select: { firstName: true, lastName: true } } } })
      : prisma.trainingAssessment.findMany({ take: 24, orderBy: { assessmentDate: "desc" }, select: { rating: true, assessmentDate: true, athlete: { select: { firstName: true, lastName: true } } } }),
    coachScope ? (await prisma.athlete.groupBy({ by: ["sportId"], where: coachScope })).length : 0,
    coachScope
      ? prisma.eventPlan.count({ where: { status: "open", applications: { some: { coachId: coachScope.coachId, status: "approved" } } } })
      : 0,
    canApprove ? prisma.coach.count({ where: { user: { status: "pending" } } }) : 0,
    prisma.trainingSession.findMany({
      where: isAdmin
        ? { sessionDate: { gte: fromToday, lte: nextWeek } }
        : { coachId: coachScope?.coachId ?? -1, sessionDate: { gte: fromToday, lte: nextWeek } },
      take: 5,
      orderBy: { sessionDate: "asc" },
      select: { id: true, sessionDate: true, sessionType: true, venue: true, sport: { select: { sportName: true } } },
    }),
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
    where: coachScope ? { athlete: coachScope } : undefined,
    select: { id: true, assessmentDate: true, assessmentType: true, athlete: { select: { athleteCode: true, firstName: true, lastName: true } } },
  });

  return {
    props: {
      session,
      stats: { athletes, coaches, sports, events, assessments, plans, logs, evals, healthIssues, trainingPlans, mySports, myApprovedPlans, pendingCoaches },
      completion: JSON.parse(JSON.stringify(buckets)),
      ratingSeries: JSON.parse(JSON.stringify(ratingSeries)),
      recentAssessments: recentAssessments.map((item) => ({ ...item, assessmentDate: item.assessmentDate.toISOString() })),
      upcomingSessions: upcomingSessions.map((item) => ({ ...item, sessionDate: item.sessionDate.toISOString() })),
    },
  };
}

const chartTooltip = { contentStyle: { background: "#06261e", border: "1px solid rgba(45,212,168,.35)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#e7f7f1", fontWeight: 700 }, itemStyle: { color: "#9db6c7" } };
const weekLabel = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dateLabel = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function Dashboard({ stats, completion, ratingSeries, recentAssessments, upcomingSessions }) {
  const router = useRouter();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.mustChangePassword) router.replace("/change-password");
  }, [session, router]);
  if (!session) return <main className={styles.loading}><p>Loading secure account...</p></main>;
  if (session.user.mustChangePassword) return <main className={styles.loading}><p>Redirecting to secure password change...</p></main>;
  const isAdmin = session.user.role === "admin";
  const canApprove = isAdmin || Boolean(session?.user?.canApproveCoaches);
  const cards = isAdmin
    ? [
        ["Athletes", stats.athletes, "/athletes"],
        ["Coaches", stats.coaches, "/admin/coaches"],
        ["Sports", stats.sports, "/admin/catalog"],
        ["Assessments", stats.assessments, "/assessments"],
      ]
    : [
        ["My athletes", stats.athletes, "/athletes"],
        ["My sports", stats.mySports, "/athletes"],
        ["My assessments", stats.assessments, "/assessments"],
        ["My approved plans", stats.myApprovedPlans, "/event-plans"],
      ];
  const hasCompletion = completion.some((w) => w.done > 0 || w.partial > 0 || w.missed > 0);
  return <>
    <Head><title>Dashboard | Cauayan Athlete Performance</title><meta name="description" content="Athlete performance monitoring dashboard" /></Head>
    <AppShell session={session} isAdmin={isAdmin} active="/dashboard">
      <section className={styles.intro}><div><p className={styles.eyebrow}>Overview</p><h2>Good day, {session.user.name?.split(" ")[0] || "team"}.</h2><p>Here is what is happening across the athletics program today. Click any card to dig in.</p></div>
        <div className={styles.quickActions} aria-label="Quick actions">
          <Link className={`${styles.secondary} ${styles.btnSm}`} href="/athletes">New athlete</Link>
          <Link className={`${styles.secondary} ${styles.btnSm}`} href="/training-plans">New training plan</Link>
          {isAdmin && <Link className={`${styles.secondary} ${styles.btnSm}`} href="/admin/catalog">Add sport</Link>}
        </div></section>
      <section className={styles.cards} aria-label="System totals">{cards.map(([label, value, href]) => <Link className={styles.card} href={href} key={label}><span>{label}</span><strong>{value}</strong><small>View details</small></Link>)}</section>
      {isAdmin && <section className={styles.cards} aria-label="Administration summary">{[["Training plans", stats.trainingPlans, "/training-plans"], ["Coach evaluations", stats.evals, "/admin/coach-performances"], ["Athletes with health flags", stats.healthIssues, "/athletes?health=flagged"], ["Open event plans", stats.plans, "/event-plans"]].map(([label, value, href]) => <Link className={styles.card} href={href} key={label}><span>{label}</span><strong>{value}</strong><small>View details</small></Link>)}</section>}
      {(canApprove && stats.pendingCoaches > 0) || stats.healthIssues > 0 ? (
        <section className={styles.alertList} aria-label="Alerts">
          {canApprove && stats.pendingCoaches > 0 && <Link className={`${styles.alertItem} ${styles.alertWarn}`} href="/coach-approvals"><span className={`${styles.dot} ${styles.dotWarn}`} aria-hidden="true" /><span><strong>{stats.pendingCoaches} pending coach approval{stats.pendingCoaches === 1 ? "" : "s"}</strong><small>Review new coach accounts waiting for approval.</small></span></Link>}
          {stats.healthIssues > 0 && <Link className={`${styles.alertItem} ${styles.alertDanger}`} href="/athletes?health=flagged"><span className={`${styles.dot} ${styles.dotDanger}`} aria-hidden="true" /><span><strong>{stats.healthIssues} athlete{stats.healthIssues === 1 ? "" : "s"} flagged for health</strong><small>Family doctor and manager notes need attention.</small></span></Link>}
        </section>
      ) : null}
      {upcomingSessions.length > 0 && (
        <section className={styles.scheduleList} aria-label="Upcoming training sessions">
          {upcomingSessions.map((item) => {
            const d = new Date(item.sessionDate);
            return (
              <div key={item.id} className={styles.scheduleItem}>
                <div className={styles.dateChip}><strong>{d.getDate()}</strong><small>{d.toLocaleDateString("en-US", { month: "short" })}</small></div>
                <div className={styles.scheduleMeta}><strong>{item.sessionType} · {item.sport.sportName}</strong><small>{d.toLocaleDateString("en-US", { weekday: "short" })} {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} {item.venue ? `· ${item.venue}` : ""}</small></div>
              </div>
            );
          })}
        </section>
      )}
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
      <section className={styles.grid}><div className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>Monitoring</p><h2>Recent assessments</h2></div><Link href="/assessments">View assessments</Link></div>{recentAssessments.length ? <div className={styles.tableWrap}><table><thead><tr><th>Athlete</th><th>Date</th><th>Type</th></tr></thead><tbody>{recentAssessments.map((assessment) => <tr key={assessment.id}><td data-label="Athlete"><strong>{assessment.athlete.firstName} {assessment.athlete.lastName}</strong><small>{assessment.athlete.athleteCode}</small></td><td data-label="Date">{new Date(assessment.assessmentDate).toLocaleDateString()}</td><td data-label="Type">{assessment.assessmentType}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No assessments recorded yet.</p>}</div>
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