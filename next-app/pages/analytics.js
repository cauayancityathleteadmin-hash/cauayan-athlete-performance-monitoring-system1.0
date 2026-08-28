import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import { computeInsights, toCsvRows } from "../lib/performance-insights";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const [bySport, byStatus, results] = await Promise.all([
    prisma.athlete.groupBy({ by: ["sportId"], _count: { _all: true } }),
    prisma.athlete.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.assessmentResult.findMany({ where: { valueDecimal: { not: null } }, include: { metric: { include: { event: { include: { sport: true } } } }, assessment: { include: { athlete: true } } } }),
  ]);
  const sports = await prisma.sport.findMany({ where: { id: { in: bySport.map((item) => item.sportId) } }, select: { id: true, sportName: true } });
  const averages = {};
  const insightAssessments = new Map();
  for (const result of results) {
    const key = result.metric.metricName;
    const value = Number(result.valueDecimal);
    if (!averages[key]) averages[key] = { metricName: key, unit: result.metric.unit, sportName: result.metric.event.sport.sportName, total: 0, count: 0 };
    averages[key].total += value;
    averages[key].count += 1;
    if (!insightAssessments.has(result.assessment.id)) insightAssessments.set(result.assessment.id, { athlete: result.assessment.athlete, assessmentDate: result.assessment.assessmentDate, results: [] });
    insightAssessments.get(result.assessment.id).results.push({ metric: result.metric, valueDecimal: result.valueDecimal });
  }
  const insights = computeInsights([...insightAssessments.values()]);
  const csv = toCsvRows(insights);
  return { props: { session, stats: { sports: bySport.map((item) => ({ name: sports.find((sport) => sport.id === item.sportId)?.sportName || "Unknown", count: item._count._all })), statuses: byStatus.map((item) => ({ name: item.status, count: item._count._all })), averages: Object.values(averages).map((item) => ({ ...item, average: (item.total / item.count).toFixed(2) })) }, insights, csv } };
}

export default function Analytics({ stats, insights, csv, session }) {
  const isAdmin = session?.user?.role === "admin";
  function downloadCsv() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "performance-insights.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  return <><Head><title>Analytics | Cauayan Athlete Performance</title></Head><AppShell session={session} isAdmin={isAdmin} eyebrow="Evidence at a glance" title="Analytics" active="/analytics"><section className={styles.cards}>{stats.sports.map((item) => <div className={styles.card} key={item.name}><span>{item.name}</span><strong>{item.count}</strong><small>athletes</small></div>)}</section><section className={styles.grid}><div className={styles.panel}><p className={styles.eyebrow}>Population</p><h2>By status</h2><dl className={styles.coverage}>{stats.statuses.map((item) => <div key={item.name}><dt>{item.name}</dt><dd>{item.count}</dd></div>)}</dl></div><div className={styles.panel}><p className={styles.eyebrow}>Measurements</p><h2>Average results</h2>{stats.averages.length ? <div className={styles.tableWrap}><table><thead><tr><th>Metric</th><th>Sport</th><th>Average</th></tr></thead><tbody>{stats.averages.map((item) => <tr key={`${item.sportName}-${item.metricName}`}><td>{item.metricName}<small>{item.unit}</small></td><td>{item.sportName}</td><td><strong>{item.average}</strong></td></tr>)}</tbody></table></div> : <p className={styles.empty}>No numeric results yet.</p>}</div></section><section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>Latest results benchmarked</p><h2>Percentile &amp; progress</h2></div><button className={styles.secondary} type="button" onClick={downloadCsv} disabled={!insights.length}>Export CSV</button></div>{insights.length ? <div className={styles.tableWrap}><table><thead><tr><th>Athlete</th><th>Metric</th><th>Latest</th><th>Percentile</th><th>Trend</th></tr></thead><tbody>{insights.map((row, i) => <tr key={i}><td><strong>{row.athleteName}</strong></td><td>{row.metricName}<small>{row.unit}</small></td><td>{row.value}</td><td>{row.band >= 75 ? <strong>{row.band}%</strong> : row.band >= 25 ? <span>{row.band}%</span> : <span className="muted">{row.band}%</span>}</td><td>{row.trend === "up" ? "▲ improved" : row.trend === "down" ? "▼ declined" : row.trend === "same" ? "– steady" : row.betterDirection === "lower" ? "▼ improved" : "-"}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No numeric results yet. Record assessments to unlock percentile feedback and trends.</p>}</section></AppShell></>;
}