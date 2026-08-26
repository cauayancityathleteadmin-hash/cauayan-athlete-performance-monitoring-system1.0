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
  return <><Head><title>Administration | Cauayan Athlete Performance</title></Head><div className={styles.app}><header className={styles.header}><div><p className={styles.eyebrow}>Control centre</p><h1>Administration</h1></div><Link className={styles.account} href="/dashboard">Back to dashboard</Link></header><nav className={styles.nav} aria-label="Administration navigation"><Link href="/dashboard">Dashboard</Link><Link href="/athletes">Athletes</Link><Link href="/assessments">Assessments</Link><Link href="/analytics">Analytics</Link><Link href="/event-plans">Event plans</Link><Link href="/admin" aria-current="page">Administration</Link></nav><main className={styles.main}><section className={styles.cards}>{[["Sports", stats.sports], ["Events", stats.events], ["Coaches", stats.coaches], ["Audit entries", stats.logs]].map(([label, value]) => <div className={styles.card} key={label}><span>{label}</span><strong>{value}</strong><small>Manage in the catalog</small></div>)}</section><section className={styles.grid}><div className={styles.panel}><p className={styles.eyebrow}>Management</p><h2>Catalog and records</h2><p>Admin-only management workflows are being brought over with the same role boundaries as the original system.</p><p><Link className={styles.secondary} href="/athletes">Manage athletes</Link></p></div><div className={styles.panel}><p className={styles.eyebrow}>Security</p><h2>Audit trail</h2><p>{stats.logs} meaningful actions are recorded in the database.</p><Link className={styles.secondary} href="/dashboard">Review dashboard</Link></div></section></main></div></>;
}