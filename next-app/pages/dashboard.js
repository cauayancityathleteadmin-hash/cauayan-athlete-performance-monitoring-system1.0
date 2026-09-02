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
  const [athletes, coaches, sports, events, assessments, plans, logs, trainings, evals, healthIssues] = await Promise.all([
    prisma.athlete.count(), prisma.coach.count(), prisma.sport.count(), prisma.event.count(),
    prisma.assessment.count(), prisma.eventPlan.count({ where: { status: "open" } }), prisma.auditLog.count(),
    prisma.trainingSession.count(), prisma.coachPerformance.count(), prisma.athlete.count({ where: { healthStatus: { in: ["sick", "injured", "recovering", "inactive"] } } }),
  ]);
  const recentAssessments = await prisma.assessment.findMany({
    take: 5, orderBy: { assessmentDate: "desc" },
    select: { id: true, assessmentDate: true, assessmentType: true, athlete: { select: { athleteCode: true, firstName: true, lastName: true } } },
  });
  return { props: { session, stats: { athletes, coaches, sports, events, assessments, plans, logs, trainings, evals, healthIssues }, recentAssessments: recentAssessments.map((item) => ({ ...item, assessmentDate: item.assessmentDate.toISOString() })) } };
}

export default function Dashboard({ stats, recentAssessments }) {
  const router = useRouter();
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.user?.mustChangePassword) router.replace("/change-password");
  }, [session, router]);
  if (!session) return <main className={styles.loading}><p>Loading secure account...</p></main>;
  if (session.user.mustChangePassword) return <main className={styles.loading}><p>Redirecting to secure password change...</p></main>;
  const isAdmin = session.user.role === "admin";
  const cards = isAdmin
    ? [["Athletes", stats.athletes, "/athletes"], ["Coaches", stats.coaches, "/admin/coaches"], ["Assessments", stats.assessments, "/assessments"], ["Open event plans", stats.plans, "/event-plans"]]
    : [["All athletes", stats.athletes, "/athletes"], ["My sport catalog", stats.sports, "/athletes"], ["Assessments", stats.assessments, "/assessments"], ["Open event plans", stats.plans, "/event-plans"]];
  return <>
    <Head><title>Dashboard | Cauayan Athlete Performance</title><meta name="description" content="Athlete performance monitoring dashboard" /></Head>
    <AppShell session={session} isAdmin={isAdmin} active="/dashboard">
      <section className={styles.intro}><div><p className={styles.eyebrow}>Overview</p><h2>Good day, {session.user.name?.split(" ")[0] || "team"}.</h2><p>Track participation, assessments, health, and progress from one place.</p></div><Link className={styles.primary} href="/assessments">Record assessment</Link></section>
        <section className={styles.actionRow} style={{ marginBottom: 4 }}>
          <Link className={styles.secondary} href="/athletes">Add athlete</Link>
          <Link className={styles.secondary} href="/event-plans">Plan event</Link>
          <Link className={styles.secondary} href="/training-sessions">Log training</Link>
          <Link className={styles.secondary} href="/analytics">View analytics</Link>
        </section>
        <section className={styles.cards} aria-label="System totals">{cards.map(([label, value, href]) => <Link className={styles.card} href={href} key={label}><span>{label}</span><strong>{value}</strong><small>View details</small></Link>)}</section>
        {isAdmin && <section className={styles.cards} aria-label="Administration totals">{[["Training sessions", stats.trainings, "/training-sessions"], ["Coach evaluations", stats.evals, "/admin/coach-performances"], ["Athletes with health flags", stats.healthIssues, "/athletes?health=flagged"], ["Audit entries", stats.logs, "/admin/audit-logs"]].map(([label, value, href]) => <Link className={styles.card} href={href} key={label}><span>{label}</span><strong>{value}</strong><small>Manage</small></Link>)}</section>}
        <section className={styles.grid}><div className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>Monitoring</p><h2>Recent assessments</h2></div><Link href="/analytics">Open analytics</Link></div>{recentAssessments.length ? <div className={styles.tableWrap}><table><thead><tr><th>Athlete</th><th>Date</th><th>Type</th></tr></thead><tbody>{recentAssessments.map((assessment) => <tr key={assessment.id}><td><strong>{assessment.athlete.firstName} {assessment.athlete.lastName}</strong><small>{assessment.athlete.athleteCode}</small></td><td>{new Date(assessment.assessmentDate).toLocaleDateString()}</td><td>{assessment.assessmentType}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No assessments recorded yet.</p>}</div>
          <aside className={styles.panel}><p className={styles.eyebrow}>Catalog</p><h2>System coverage</h2><dl className={styles.coverage}><div><dt>Sports</dt><dd>{stats.sports}</dd></div><div><dt>Events</dt><dd>{stats.events}</dd></div><div><dt>Open plans</dt><dd>{stats.plans}</dd></div></dl><Link className={styles.secondary} href={isAdmin ? "/admin/catalog" : "/event-plans"}>{isAdmin ? "Manage catalog" : "View event plans"}</Link></aside></section>
        {isAdmin && <section className={styles.grid}>
          <div className={styles.panel}><p className={styles.eyebrow}>People management</p><h2>Coaches</h2><p>Approve coaches, inspect their files, and control account access.</p><Link className={styles.secondary} href="/admin/coaches">Manage coaches</Link></div>
          <div className={styles.panel}><p className={styles.eyebrow}>System catalog</p><h2>Sports &amp; Events</h2><p>Maintain the sports and event taxonomy used across the system.</p><Link className={styles.secondary} href="/admin/catalog">Manage catalog</Link></div>
          <div className={styles.panel}><p className={styles.eyebrow}>Measurements</p><h2>Performance metrics</h2><p>Configure the quantifiable metrics that define each event.</p><Link className={styles.secondary} href="/admin/metrics">Configure metrics</Link></div>
          <div className={styles.panel}><p className={styles.eyebrow}>Data governance</p><h2>Audit trail</h2><p>{stats.logs} meaningful actions recorded in the database.</p><Link className={styles.secondary} href="/admin/audit-logs">Review logs</Link></div>
          <div className={styles.panel}><p className={styles.eyebrow}>Maintenance</p><h2>Database backup</h2><p>Record backup requests and plan off-site snapshots.</p><Link className={styles.secondary} href="/admin/backup">Backup</Link></div>
        </section>}
    </AppShell>
  </>;
}