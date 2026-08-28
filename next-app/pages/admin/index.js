import Head from "next/head";
import Link from "next/link";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };
  const [sports, events, coaches, logs] = await Promise.all([
    prisma.sport.count(), prisma.event.count(), prisma.coach.count(), prisma.auditLog.count(),
  ]);
  return { props: { session, stats: { sports, events, coaches, logs } } };
}

export default function Admin({ stats, session }) {
  return (
    <>
      <Head>
        <title>Administration | Cauayan Athlete Performance</title>
      </Head>
      <AppShell session={session} isAdmin eyebrow="Control centre" title="Administration" active="/admin" showAdminNav>
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
      </AppShell>
    </>
  );
}