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
              <h2>Coaches</h2>
              <p>Approve coaches, inspect their files, and control account access.</p>
              <Link className={styles.secondary} href="/admin/coaches">Manage coaches</Link>
            </div>
            <div className={styles.panel}>
              <p className={styles.eyebrow}>System catalog</p>
              <h2>Sports &amp; Events</h2>
              <p>Maintain the sports and event taxonomy used across the system.</p>
              <Link className={styles.secondary} href="/admin/catalog">Manage catalog</Link>
            </div>
            <div className={styles.panel}>
              <p className={styles.eyebrow}>Measurements</p>
              <h2>Performance metrics</h2>
              <p>Configure the quantifiable metrics that define each event.</p>
              <Link className={styles.secondary} href="/admin/metrics">Configure metrics</Link>
            </div>
            <div className={styles.panel}>
              <p className={styles.eyebrow}>Analytics</p>
              <h2>Evidence at a glance</h2>
              <p>Review population, status and trends in athlete data.</p>
              <Link className={styles.secondary} href="/analytics">Open analytics</Link>
            </div>
            <div className={styles.panel}>
              <p className={styles.eyebrow}>Data governance</p>
              <h2>Audit trail</h2>
              <p>{stats.logs} meaningful actions recorded in the database.</p>
              <Link className={styles.secondary} href="/admin/audit-logs">Review logs</Link>
            </div>
            <div className={styles.panel}>
              <p className={styles.eyebrow}>Maintenance</p>
              <h2>Database backup</h2>
              <p>Record backup requests and plan off-site snapshots.</p>
              <Link className={styles.secondary} href="/admin/backup">Backup</Link>
            </div>
          </section>
      </AppShell>
    </>
  );
}