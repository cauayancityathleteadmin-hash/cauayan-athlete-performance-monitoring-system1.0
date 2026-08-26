import Head from "next/head";
import Link from "next/link";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const [bySport, byStatus, results] = await Promise.all([
    prisma.athlete.groupBy({ by: ["sportId"], _count: { _all: true } }),
    prisma.athlete.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.assessmentResult.findMany({ where: { valueDecimal: { not: null } }, include: { metric: { include: { event: { include: { sport: true } } } } } }),
  ]);
  const sports = await prisma.sport.findMany({ where: { id: { in: bySport.map((item) => item.sportId) } }, select: { id: true, sportName: true } });
  const averages = {};
  for (const result of results) { const key = result.metric.metricName; const value = Number(result.valueDecimal); if (!averages[key]) averages[key] = { metricName: key, unit: result.metric.unit, sportName: result.metric.event.sport.sportName, total: 0, count: 0 }; averages[key].total += value; averages[key].count += 1; }
  return { props: { stats: { sports: bySport.map((item) => ({ name: sports.find((sport) => sport.id === item.sportId)?.sportName || "Unknown", count: item._count._all })), statuses: byStatus.map((item) => ({ name: item.status, count: item._count._all })), averages: Object.values(averages).map((item) => ({ ...item, average: (item.total / item.count).toFixed(2) })) } } };
}

export default function Analytics({ stats }) {
  return <><Head><title>Analytics | Cauayan Athlete Performance</title></Head><div className={styles.app}><header className={styles.header}><div><p className={styles.eyebrow}>Evidence at a glance</p><h1>Analytics</h1></div><Link className={styles.account} href="/dashboard">Back to dashboard</Link></header><nav className={styles.nav} aria-label="Primary navigation"><Link href="/dashboard">Dashboard</Link><Link href="/athletes">Athletes</Link><Link href="/assessments">Assessments</Link><Link href="/analytics" aria-current="page">Analytics</Link><Link href="/event-plans">Event plans</Link></nav><main className={styles.main}><section className={styles.cards}>{stats.sports.map((item) => <div className={styles.card} key={item.name}><span>{item.name}</span><strong>{item.count}</strong><small>athletes</small></div>)}</section><section className={styles.grid}><div className={styles.panel}><p className={styles.eyebrow}>Population</p><h2>By status</h2><dl className={styles.coverage}>{stats.statuses.map((item) => <div key={item.name}><dt>{item.name}</dt><dd>{item.count}</dd></div>)}</dl></div><div className={styles.panel}><p className={styles.eyebrow}>Measurements</p><h2>Average results</h2>{stats.averages.length ? <div className={styles.tableWrap}><table><thead><tr><th>Metric</th><th>Sport</th><th>Average</th></tr></thead><tbody>{stats.averages.map((item) => <tr key={`${item.sportName}-${item.metricName}`}><td>{item.metricName}<small>{item.unit}</small></td><td>{item.sportName}</td><td><strong>{item.average}</strong></td></tr>)}</tbody></table></div> : <p className={styles.empty}>No numeric results yet.</p>}</div></section></main></div></>;
}