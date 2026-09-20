import Head from "next/head";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { getSession, useSession } from "next-auth/react";
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

  const [athletes, coaches, sports, assessments, plans, logs, evals, healthIssues, trainingPlans, activityLogs, trainingAssessments, mySports, myApprovedPlans, pendingCoaches, upcomingSessions, coachEvals, healthByStatus, achievementsCount] = await Promise.all([
    coachScope ? prisma.athlete.count({ where: coachScope }) : prisma.athlete.count(),
    prisma.coach.count(), prisma.sport.count(),
    coachScope ? prisma.assessment.count({ where: { athlete: coachScope } }) : prisma.assessment.count(),
    prisma.eventPlan.count({ where: { status: "open" } }), prisma.auditLog.count(),
    coachScope ? prisma.coachPerformance.count({ where: { coachId: coachScope.coachId } }) : prisma.coachPerformance.count(),
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
    isAdmin
      ? prisma.coachPerformance.findMany({ select: { coach: { select: { id: true, firstName: true, lastName: true } }, overallScore: true } })
      : coachScope
        ? prisma.coachPerformance.findMany({ where: { coachId: coachScope.coachId }, select: { coach: { select: { id: true, firstName: true, lastName: true } }, overallScore: true } })
        : Promise.resolve([]),
    coachScope ? prisma.athlete.groupBy({ by: ["healthStatus"], where: coachScope, _count: { _all: true } }) : prisma.athlete.groupBy({ by: ["healthStatus"], _count: { _all: true } }),
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
      coachEvalAverages: JSON.parse(JSON.stringify(coachEvalAverages)),
      achievementsCount,
      upcomingSessions: upcomingSessions.map((item) => ({ ...item, sessionDate: item.sessionDate.toISOString() })),
    },
  };
}

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

export default function Dashboard({ stats, completion = [], ratingSeries = [], upcomingSessions = [], healthDist = [], coachEvalAverages = [], achievementsCount, greetingName }) {
  const router = useRouter();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.mustChangePassword) router.replace("/change-password");
  }, [session, router]);
  if (!session) return <main className={styles.loading}><p>Loading...</p></main>;
  if (session.user.mustChangePassword) return <main className={styles.loading}><p>Redirecting...</p></main>;
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
        ["My approved applications", stats.myApprovedPlans, "/event-plans"],
      ];
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const healthNote = stats.healthIssues > 0 ? `${stats.healthIssues} athlete${stats.healthIssues === 1 ? "" : "s"} flagged for health` : "";
  const evalsData = (coachEvalAverages || []).map((c) => ({ label: c.name, value: c.avg }));

  // Simple summary stats for quick glance (no charts on Dashboard)
  const totalActivities = (completion || []).reduce((sum, w) => sum + (w.done || 0) + (w.partial || 0) + (w.missed || 0), 0);
  const totalDone = (completion || []).reduce((sum, w) => sum + (w.done || 0), 0);
  const completionRate = totalActivities ? Math.round((totalDone / totalActivities) * 100) : 0;
  const avgRating = ratingSeries.length ? (ratingSeries.reduce((sum, r) => sum + r.rating, 0) / ratingSeries.length).toFixed(1) : "—";
  const healthHealthy = healthDist.find((h) => h.name === "healthy")?.value || 0;
  const healthFlagged = (healthDist || []).filter((h) => ["sick", "injured", "recovering", "inactive"].includes(h.name)).reduce((sum, h) => sum + h.value, 0);
  const coachAvgScore = evalsData.length ? (evalsData.reduce((sum, e) => sum + e.value, 0) / evalsData.length).toFixed(1) : "—";

  return <>
    <Head><title>Dashboard | Cauayan Athlete Performance</title><meta name="description" content="Athlete performance monitoring dashboard" /></Head>
    <AppShell session={session} isAdmin={isAdmin} active="/dashboard">
      <div className={styles.pageTitle}><h1>Dashboard</h1></div>
      <section className={styles.intro}><div><p className={styles.eyebrow}>Overview</p><Greeting greetingName={greetingName} /><p>One summary of every feature in the system. Click any card to dig in.</p></div></section>
      <section className={styles.cards} aria-label="System totals">{cards.map(([label, value, href]) => <Link className={styles.card} href={href} key={label}><span>{label}</span><strong>{value}</strong><small>View details</small></Link>)}</section>
      <section className={styles.cards} aria-label="Administration summary">{[["Training plans", stats.trainingPlans, "/training-plans"], ...(isAdmin ? [["Coach evaluations", stats.evals, "/admin/coach-performances"]] : []), ["Athletes with health flags", stats.healthIssues, "/athletes?health=flagged"], ["Open event plans", stats.plans, "/event-plans"]].map(([label, value, href]) => <Link className={styles.card} href={href} key={label}><span>{label}</span><strong>{value}</strong><small>View details</small></Link>)}</section>
      {(canApprove && stats.pendingCoaches > 0) || stats.healthIssues > 0 ? (
        <section className={styles.alertList} aria-label="Alerts">
          {canApprove && stats.pendingCoaches > 0 && <Link className={`${styles.alertItem} ${styles.alertWarn}`} href="/coach-approvals"><span className={`${styles.dot} ${styles.dotWarn}`} aria-hidden="true" /><span><strong>{stats.pendingCoaches} pending coach approval{stats.pendingCoaches === 1 ? "" : "s"}</strong><small>Review new coach accounts waiting for approval.</small></span></Link>}
          {stats.healthIssues > 0 && <Link className={`${styles.alertItem} ${styles.alertDanger}`} href="/athletes?health=flagged"><span className={`${styles.dot} ${styles.dotDanger}`} aria-hidden="true" /><span><strong>{stats.healthIssues} athlete{stats.healthIssues === 1 ? "" : "s"} flagged for health</strong><small>Family doctor and manager notes need attention.</small></span></Link>}
        </section>
      ) : null}
      {upcomingSessions && upcomingSessions.length > 0 && (
        <section className={styles.scheduleList} aria-label="Upcoming training sessions">
          {upcomingSessions?.map((item) => {
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
        <div className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Training</p><h2>Activity completion</h2></div><Link href="/training-plans">Training</Link></div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>Last 8 weeks.</p>
          <div className={styles.statRow}>
            <div className={styles.stat}><strong>{completionRate}%</strong><small>Completion rate</small></div>
            <div className={styles.stat}><strong>{totalActivities}</strong><small>Activities logged</small></div>
            <div className={styles.stat}><strong>{totalDone}</strong><small>Done</small></div>
          </div>
        </div>
        <div className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Assessments</p><h2>Ratings</h2></div><Link href="/assessments">Assessments</Link></div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>Latest 1–10 ratings.</p>
          <div className={styles.statRow}>
            <div className={styles.stat}><strong>{avgRating}</strong><small>Average rating</small></div>
            <div className={styles.stat}><strong>{ratingSeries.length}</strong><small>Assessments</small></div>
          </div>
        </div>
      </section>
      <section className={styles.grid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Health</p><h2>Status</h2></div><Link href="/athletes?health=flagged">Health flags</Link></div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>Current roster.</p>
          <div className={styles.statRow}>
            <div className={styles.stat}><strong>{healthHealthy}</strong><small>Healthy</small></div>
            <div className={styles.stat}><strong className={styles.statDanger}>{healthFlagged}</strong><small>Flagged</small></div>
          </div>
        </div>
        <div className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Coaching</p><h2>Coach average</h2></div>{isAdmin ? <Link href="/admin/coach-performances">Evaluations</Link> : <span className={styles.formHint}>Your average</span>}</div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>Performance score.</p>
          <div className={styles.statRow}>
            <div className={styles.stat}><strong>{coachAvgScore}</strong><small>Average score</small></div>
            <div className={styles.stat}><strong>{evalsData.length}</strong><small>Coaches</small></div>
          </div>
        </div>
      </section>
      <section className={styles.gridAuto} aria-label="Feature summaries">
        <FeatureCard eyebrow="People" title="Athletes" href="/athletes">{plural(stats.athletes, "athlete")} registered{healthNote ? `, ${healthNote}` : ""}.</FeatureCard>
        <FeatureCard eyebrow="Training &amp; assessment" title="Training" href="/training-plans">{plural(stats.trainingPlans, "training plan")} in the system. Track activities, assess athletes, and review the monitoring grid.</FeatureCard>
        <FeatureCard eyebrow="Assessments" title="Physical assessments" href="/assessments">{plural(stats.assessments, "assessment")} recorded across the program.</FeatureCard>
        <FeatureCard eyebrow="Events &amp; program" title="Event plans" href="/event-plans">{plural(stats.plans, "open plan")}{stats.myApprovedPlans > 0 && !isAdmin ? `, ${plural(stats.myApprovedPlans, "approved application")}` : ""}. Apply, add participants, and track competition slots.</FeatureCard>
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