import Head from "next/head";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { getSession, signOut, useSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const [athletes, coaches, sports, events, assessments, plans] = await Promise.all([
    prisma.athlete.count(), prisma.coach.count(), prisma.sport.count(), prisma.event.count(),
    prisma.assessment.count(), prisma.eventPlan.count({ where: { status: "open" } }),
  ]);
  const recentAssessments = await prisma.assessment.findMany({
    take: 5, orderBy: { assessmentDate: "desc" },
    select: { id: true, assessmentDate: true, assessmentType: true, athlete: { select: { athleteCode: true, firstName: true, lastName: true } } },
  });
  return { props: { session, stats: { athletes, coaches, sports, events, assessments, plans }, recentAssessments: recentAssessments.map((item) => ({ ...item, assessmentDate: item.assessmentDate.toISOString() })) } };
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
    <div className={styles.app}><header className={styles.header}><div style={{display:"flex",alignItems:"center",gap:"16px"}}><img src="/cauayan logo.png" alt="Cauayan City" className="logo" style={{height:"48px",width:"auto"}}/><div><p className={styles.eyebrow}>Cauayan City</p><h1>Athlete performance</h1></div></div><div className={styles.account}><span>{session.user.name || session.user.email}</span><span className={styles.role}>{session.user.role}</span><Link className={styles.secondary} href="/account" style={{marginRight:"12px",padding:"10px 16px",textDecoration:"none"}}><button type="button" style={{border:"none",background:"transparent",padding:"0",font:"inherit",color:"inherit",cursor:"pointer"}}>My Account</button></Link><button type="button" onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button></div></header>
      <nav className={styles.nav} aria-label="Primary navigation"><Link href="/dashboard">Dashboard</Link><Link href="/athletes">Athletes</Link><Link href="/assessments">Assessments</Link><Link href="/analytics">Analytics</Link><Link href="/event-plans">Event plans</Link>{isAdmin && <Link href="/admin">Administration</Link>}</nav>
      <main className={styles.main}><section className={styles.intro}><div><p className={styles.eyebrow}>Overview</p><h2>Good day, {session.user.name?.split(" ")[0] || "team"}.</h2><p>Track participation, assessments, and progress from one place.</p></div><Link className={styles.primary} href="/assessments">Record assessment</Link></section>
        <section className={styles.cards} aria-label="System totals">{cards.map(([label, value, href]) => <Link className={styles.card} href={href} key={label}><span>{label}</span><strong>{value}</strong><small>View details</small></Link>)}</section>
        <section className={styles.grid}><div className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>Monitoring</p><h2>Recent assessments</h2></div><Link href="/analytics">Open analytics</Link></div>{recentAssessments.length ? <div className={styles.tableWrap}><table><thead><tr><th>Athlete</th><th>Date</th><th>Type</th></tr></thead><tbody>{recentAssessments.map((assessment) => <tr key={assessment.id}><td><strong>{assessment.athlete.firstName} {assessment.athlete.lastName}</strong><small>{assessment.athlete.athleteCode}</small></td><td>{new Date(assessment.assessmentDate).toLocaleDateString()}</td><td>{assessment.assessmentType}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No assessments recorded yet.</p>}</div>
          <aside className={styles.panel}><p className={styles.eyebrow}>Catalog</p><h2>System coverage</h2><dl className={styles.coverage}><div><dt>Sports</dt><dd>{stats.sports}</dd></div><div><dt>Events</dt><dd>{stats.events}</dd></div><div><dt>Open plans</dt><dd>{stats.plans}</dd></div></dl><Link className={styles.secondary} href={isAdmin ? "/admin" : "/event-plans"}>{isAdmin ? "Manage catalog" : "View event plans"}</Link></aside></section>
      </main>
    </div>
  </>;
}