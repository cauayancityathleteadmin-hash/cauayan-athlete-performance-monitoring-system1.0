import Head from "next/head";
import Link from "next/link";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import styles from "../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };
  const [sports, events, coaches, logs] = await Promise.all([
    prisma.sport.count(), prisma.event.count(), prisma.coach.count(), prisma.auditLog.count(),
  ]);
  return { props: { stats: { sports, events, coaches, logs } } };
}

export default function Admin({ stats }) {
  return (
    <>
      <Head>
        <title>Administration | Cauayan Athlete Performance</title>
      </Head>
      <div className={styles.app}>
        <header className={styles.header}>
          <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
            <img src="/cauayan logo.png" alt="Cauayan City" className="logo" style={{height:"48px",width:"auto"}}/><div><p className={styles.eyebrow}>Control centre</p><h1>Administration</h1></div>
          </div>
          <Link className={styles.account} href="/dashboard">
            Back to dashboard
          </Link>
        </header>
        <nav className={styles.nav} aria-label="Administration navigation">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/athletes">Athletes</Link>
          <Link href="/assessments">Assessments</Link>
          <Link href="/analytics">Analytics</Link>
          <Link href="/event-plans">Event plans</Link>
          <Link href="/admin" aria-current="page">Administration</Link>
        </nav>
        <main className={styles.main}>
          <section className={styles.cards}>
            {[["Sports", stats.sports], ["Events", stats.events], ["Coaches", stats.coaches], ["Audit entries", stats.logs]].map(([label, value]) => (
              <div className={styles.card} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>Active in system</small>
              </div>
            ))}
          </section>
          <section className={styles.grid}>
            <div className={styles.panel}>
              <p className={styles.eyebrow}>People management</p>
              <h2>Coaches and athletes</h2>
              <p>Manage team coaches, assign athletes, and control account access.</p>
              <Link className={styles.secondary} href="/admin/coaches">
                Manage coaches
              </Link>
            </div>
            <div className={styles.panel}>
              <p className={styles.eyebrow}>System catalog</p>
              <h2>Sports and events</h2>
              <p>Define sports, events, and performance metrics for your program.</p>
              <Link className={styles.secondary} href="/athletes">
                View catalog
              </Link>
            </div>
            <div className={styles.panel}>
              <p className={styles.eyebrow}>Data governance</p>
              <h2>Audit trail</h2>
              <p>{stats.logs} meaningful actions recorded in the database.</p>
              <Link className={styles.secondary} href="/dashboard">
                Review logs
              </Link>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}