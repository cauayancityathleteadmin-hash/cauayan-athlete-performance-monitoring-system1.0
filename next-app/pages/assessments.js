import Head from "next/head";
import Link from "next/link";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const assessments = await prisma.assessment.findMany({ orderBy: { assessmentDate: "desc" }, include: { athlete: true, recorder: { select: { email: true } }, results: { include: { metric: true } } } });
  return { props: { assessments: assessments.map((item) => ({ ...item, assessmentDate: item.assessmentDate.toISOString(), createdAt: item.createdAt.toISOString(), results: item.results.map((result) => ({ ...result, valueDecimal: result.valueDecimal?.toString() || null })) })) } };
}

export default function Assessments({ assessments }) {
  return <><Head><title>Assessments | Cauayan Athlete Performance</title></Head><div className={styles.app}><header className={styles.header}><div><p className={styles.eyebrow}>Performance records</p><h1>Assessments</h1></div><Link className={styles.account} href="/dashboard">Back to dashboard</Link></header><nav className={styles.nav} aria-label="Primary navigation"><Link href="/dashboard">Dashboard</Link><Link href="/athletes">Athletes</Link><Link href="/assessments" aria-current="page">Assessments</Link><Link href="/analytics">Analytics</Link><Link href="/event-plans">Event plans</Link></nav><main className={styles.main}><section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>Recorded measurements</p><h2>Assessment history</h2></div><strong>{assessments.length} records</strong></div><div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Athlete</th><th>Type</th><th>Results</th><th>Recorded by</th></tr></thead><tbody>{assessments.map((assessment) => <tr key={assessment.id}><td>{new Date(assessment.assessmentDate).toLocaleDateString()}</td><td><strong>{assessment.athlete.firstName} {assessment.athlete.lastName}</strong><small>{assessment.athlete.athleteCode}</small></td><td>{assessment.assessmentType}</td><td>{assessment.results.map((result) => `${result.metric.metricName}: ${result.valueDecimal ?? result.valueText ?? "-"}`).join(", ")}</td><td>{assessment.recorder.email}</td></tr>)}</tbody></table></div></section></main></div></>;
}