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
import { Donut, HBars } from "../components/Charts";
import styles from "../styles/Dashboard.module.css";
import AppShell from "../components/AppShell";

const HEALTH_META = {
  healthy: { label: "Healthy", color: "#2dd4a8" },
  sick: { label: "Sick", color: "#f87171" },
  injured: { label: "Injured", color: "#f59e0b" },
  recovering: { label: "Recovering", color: "#38bdf8" },
  inactive: { label: "Inactive", color: "#64748b" },
};

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
  const ratingSince = new Date(now.getTime() - 90 * 86400000);

  const isAdmin = session.user.role === "admin";
  const canApprove = isAdmin || Boolean(session?.user?.canApproveCoaches);
  let coachScope = null;
  let greetingName = isAdmin ? "Admin" : "Coach";
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({
      where: { userId: Number(session.user.id) },
      select: { id: true, firstName: true },
    });
    if (coach) {
      coachScope = { coachId: coach.id };
      greetingName = `Coach ${coach.firstName}`;
    }
  }

  const fromToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextWeek = new Date(fromToday.getTime() + 7 * 86400000);

  const [athletes, coaches, sports, assessments, plans, logs, evals, healthIssues, trainingPlans, activityLogs, trainingAssessments, mySports, myApprovedPlans, pendingCoaches, upcomingSessions, coachEvals, healthByStatus, recentRatings, achievementsCount] = await Promise.all([
    coachScope ? prisma.athlete.count({ where: coachScope }) : prisma.athlete.count(),
    prisma.coach.count(), prisma.sport.count(),
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
    isAdmin ? prisma.coachPerformance.findMany({ select: { coach: { select: { id: true, firstName: true, lastName: true } }, overallScore: true } }) : Promise.resolve([]),
    coachScope ? prisma.athlete.groupBy({ by: ["healthStatus"], where: coachScope, _count: { _all: true } }) : prisma.athlete.groupBy({ by: ["healthStatus"], _count: { _all: true } }),
    coachScope ? prisma.trainingAssessment.findMany({ where: { athlete: coachScope, assessmentDate: { gte: ratingSince } }, select: { rating: true } }) : prisma.trainingAssessment.findMany({ where: { assessmentDate: { gte: ratingSince } }, select: { rating: true } }),
    coachScope ? prisma.achievement.count({ where: { athlete: coachScope } }) : prisma.achievement.count(),
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

  const healthDist = healthByStatus.map((h) => ({ name: h.healthStatus, value: h._count._all }));
  const ratingHistogram = (() => {
    const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const r of recentRatings) {
      const n = Number(r.rating);
      if (Number.isInteger(n) && n >= 1 && n <= 10) counts[n - 1] += 1;
    }
    return counts.map((value, i) => ({ rating: i + 1, value }));
  })();
  const coachEvalAverages = (() => {
    const map = new Map();
    for (const e of coachEvals) {
      const key = e.coach.id;
      if (!map.has(key)) map.set(key, { name: `${e.coach.firstName} ${e.coach.lastName}`, total: 0, count: 0 });
      const row = map.get(key);
      row.total += Number(e.overallScore);
      row.count += 1;
    }
    return [...map.values()].map((r) => ({ name: r.name, avg: r.count ? Math.round((r.total / r.count) * 10) / 10 : 0 })).sort((a, b) => b.avg - a.avg);
  })();

  return {
    props: {
      session,
      greetingName,
      stats: { athletes, coaches, sports, assessments, plans, logs, evals, healthIssues, trainingPlans, mySports, myApprovedPlans, pendingCoaches },
      completion: JSON.parse(JSON.stringify(buckets)),
      ratingSeries: JSON.parse(JSON.stringify(ratingSeries)),
      healthDist: JSON.parse(JSON.stringify(healthDist)),
      ratingHistogram: JSON.parse(JSON.stringify(ratingHistogram)),
      coachEvalAverages: JSON.parse(JSON.stringify(coachEvalAverages)),
      achievementsCount,
      upcomingSessions: upcomingSessions.map((item) => ({ ...item, sessionDate: item.sessionDate.toISOString() })),
    },
  };
}

const chartTooltip = { contentStyle: { background: "#06261e", border: "1px solid rgba(45,212,168,.35)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#e7f7f1", fontWeight: 700 }, itemStyle: { color: "#9db6c7" } };
const weekLabel = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dateLabel = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Greeting({ greetingName }) {
  const h = new Date().getHours();
  let g;
  if (h >= 1 && h <= 12) g = "Good morning";
  else if (h >= 13 && h <= 18) g = "Good afternoon";
  else g = "Good evening";
  return <h2 suppressHydrationWarning>{g}, {greetingName}!</h2>;
}

function FeatureCard({ eyebrow, title, href, children }) {
  return (
    <div className={`${styles.panel} ${styles.featureCard}`}>
      <div className={styles.panelHeader}>
        <div><p className={styles.eyebrow}>{eyebrow}</p><h2>{title}</h2></div>
        <Link href={href}>Open</Link>
      </div>
      <p className={styles.featureDesc}>{children}</p>
    </div>
  );
}

export default function Dashboard({ stats, completion, ratingSeries, upcomingSessions, healthDist, ratingHistogram, coachEvalAverages, achievementsCount, greetingName }) {
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
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const healthSegments = healthDist.map((d) => ({
    label: HEALTH_META[d.name]?.label || d.name,
    value: d.value,
    color: HEALTH_META[d.name]?.color || "#64748b",
  }));
  const histData = ratingHistogram.filter((d) => d.value > 0).map((d) => ({ label: String(d.rating), value: d.value }));
  const evalsData = coachEvalAverages.map((c) => ({ label: c.name, value: c.avg }));
  return <>
    <Head><title>Dashboard | Cauayan Athlete Performance</title><meta name="description" content="Athlete performance monitoring dashboard" /></Head>
    <AppShell session={session} isAdmin={isAdmin} active="/dashboard">
      <section className={styles.intro}><div><p className={styles.eyebrow}>Overview</p><Greeting greetingName={greetingName} /><p>One summary of every feature in the system. Click any card or chart to dig in.</p></div></section>
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
      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Activity</p><h2>Training activity completion</h2></div><Link href="/training-plans">Training</Link></div>
        <p className={styles.formHint} style={{ marginTop: 0 }}>Last 8 weeks, from real activity logs.</p>
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
      </section>
      <section className={styles.grid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Ratings</p><h2>Training ratings</h2></div><Link href="/assessments">Assessments</Link></div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>1–10 score per assessment.</p>
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
        <div className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Health</p><h2>Status today</h2></div><Link href="/athletes?health=flagged">Health flags</Link></div>
          {healthSegments.length ? <Donut segments={healthSegments} ariaLabel="Share of athletes by health status" label="athletes" /> : <p className={styles.empty}>No athletes yet.</p>}
        </div>
      </section>
      <section className={styles.grid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Training &amp; assessment</p><h2>Rating distribution</h2></div><Link href="/training-plans">Training</Link></div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>Last 90 days — how often each 1–10 score was given.</p>
          {histData.length ? <HBars data={histData} axisLabel="Score" axisValue="Assessments" /> : <p className={styles.empty}>No training ratings in the last 90 days yet.</p>}
        </div>
        {isAdmin && (
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Coaches</p><h2>Evaluation averages</h2></div><Link href="/admin/coach-performances">Evaluations</Link></div>
            {evalsData.length ? <HBars data={evalsData} axisLabel="Coach" axisValue="Avg" /> : <p className={styles.empty}>No coach evaluations on file yet.</p>}
          </div>
        )}
      </section>
      <section className={styles.gridAuto} aria-label="Feature summaries">
        <FeatureCard eyebrow="People" title="Athletes" href="/athletes">{plural(stats.athletes, "athlete")} registered, {plural(stats.healthIssues, "flagged for health")}.</FeatureCard>
        <FeatureCard eyebrow="Training &amp; assessment" title="Training" href="/training-plans">{plural(stats.trainingPlans, "training plan")} in the system. Track activities, assess athletes, and review the monitoring grid.</FeatureCard>
        <FeatureCard eyebrow="Assessments" title="Physical assessments" href="/assessments">{plural(stats.assessments, "assessment")} recorded across the program.</FeatureCard>
        <FeatureCard eyebrow="Events &amp; program" title="Event programs" href="/event-plans">{plural(stats.plans, "open program")}{stats.myApprovedPlans > 0 && !isAdmin ? `, ${plural(stats.myApprovedPlans, "approved application")}` : ""}. Apply, add participants, and track competition slots.</FeatureCard>
        <FeatureCard eyebrow="Standings" title="Standings" href="/standings">{plural(achievementsCount, "achievement")} recorded and ranked on the standings board.</FeatureCard>
        <FeatureCard eyebrow="Records" title="Reports" href="/reports">Generate official records — personnel, performance summaries, and coach files.</FeatureCard>
      </section>
      {isAdmin && (
        <section className={styles.gridAuto} aria-label="Administration summaries">
          <FeatureCard eyebrow="People" title="Coaches" href="/admin/coaches">{plural(stats.coaches, "coach")} on file. Review records, approvals, and account access on each page.</FeatureCard>
          <FeatureCard eyebrow="People" title="Coach approvals" href="/coach-approvals">{plural(stats.pendingCoaches, "account")} waiting for approval.</FeatureCard>
          <FeatureCard eyebrow="Catalog" title="Sports &amp; discipline" href="/admin/catalog">{plural(stats.sports, "sport")} registered under the program catalog.</FeatureCard>
          <FeatureCard eyebrow="Measurements" title="Performance metrics" href="/admin/metrics">Configure the quantifiable metrics that define each event.</FeatureCard>
          <FeatureCard eyebrow="Records" title="Audit trail" href="/admin/audit-logs">{plural(stats.logs, "meaningful action")} recorded in the database.</FeatureCard>
          <FeatureCard eyebrow="Maintenance" title="Database backup" href="/admin/backup">Request backups and plan off-site snapshots.</FeatureCard>
        </section>
      )}
    </AppShell>
  </>;
}