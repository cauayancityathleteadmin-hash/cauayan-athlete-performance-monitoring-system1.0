import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import { computeInsights, toCsvRows } from "../lib/performance-insights";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

const PALETTE = ["#2dd4a8", "#86efac", "#14b8a6", "#34d399", "#4ade80", "#0d9488", "#5eead4", "#6ee7b7", "#a7f3d0", "#059669"];

const STATUS_COLORS = { active: "#2dd4a8", pending: "#fbbf24", rejected: "#f87171", inactive: "#64748b" };

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const isAdmin = session.user.role === "admin";
  const athleteWhere = isAdmin ? {} : { coach: { userId: Number(session.user.id) } };
  const resultWhere = isAdmin ? { valueDecimal: { not: null } } : {
    valueDecimal: { not: null },
    assessment: { athlete: { coach: { userId: Number(session.user.id) } } },
  };
  const [bySport, byStatus, results, athletes, assessmentDates] = await Promise.all([
    prisma.athlete.groupBy({ by: ["sportId"], where: athleteWhere, _count: { _all: true } }),
    prisma.athlete.groupBy({ by: ["status"], where: athleteWhere, _count: { _all: true } }),
    prisma.assessmentResult.findMany({ where: resultWhere, include: { metric: { include: { event: { include: { sport: true } } } }, assessment: { include: { athlete: true } } } }),
    prisma.athlete.findMany({ where: athleteWhere, select: { id: true, athleteCode: true, firstName: true, lastName: true, status: true, sport: { select: { sportName: true } } }, orderBy: { lastName: "asc" } }),
    prisma.assessment.findMany({ where: isAdmin ? {} : { athlete: { coach: { userId: Number(session.user.id) } } }, select: { assessmentDate: true } }),
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

  const roster = {};
  for (const athlete of athletes) {
    if (!roster[athlete.status]) roster[athlete.status] = [];
    roster[athlete.status].push({ athleteCode: athlete.athleteCode, name: `${athlete.lastName}, ${athlete.firstName}`, sport: athlete.sport?.sportName || "" });
  }

  const monthlyMap = {};
  for (const record of assessmentDates) {
    const key = record.assessmentDate.toISOString().slice(0, 7);
    monthlyMap[key] = (monthlyMap[key] || 0) + 1;
  }
  const monthly = Object.keys(monthlyMap).sort().map((key) => {
    const [year, month] = key.split("-");
    const label = new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
    return { label, value: monthlyMap[key] };
  });

  return { props: { session, stats: { sports: bySport.map((item) => ({ name: sports.find((sport) => sport.id === item.sportId)?.sportName || "Unknown", count: item._count._all })), statuses: byStatus.map((item) => ({ name: item.status, count: item._count._all })), averages: Object.values(averages).map((item) => ({ ...item, average: (item.total / item.count).toFixed(2) })) }, roster, monthly, insights, csv } };
}

function HBars({ data, colors = PALETTE, axisLabel = "", axisValue = "" }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className={styles.hbars}>
      {axisLabel && <div className={styles.hbarsAxis}><span>{axisLabel}</span><span>{axisValue}</span></div>}
      {data.map((d, i) => (
        <div className={styles.hbarRow} key={`${d.label}-${d.value}`}>
          <div className={styles.hbarLabel}>
            <span>{d.label}</span>
            <small>{d.value}</small>
          </div>
          <div className={styles.hbarTrack}>
            <div className={styles.hbarFill} style={{ width: `${(d.value / max) * 100}%`, background: colors[i % colors.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function buildArcs(segments, total, circumference) {
  const arcs = [];
  let cumulative = 0;
  for (const d of segments) {
    const len = (d.value / total) * circumference;
    arcs.push({ key: d.label, color: d.color, len, start: -cumulative });
    cumulative += len;
  }
  return arcs;
}

function Donut({ segments, size = 170, thickness = 24, label = "athletes", ariaLabel = "Chart" }) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className={styles.empty}>No data yet.</p>;
  const r = (size - thickness) / 2;
  const center = size / 2;
  const circumference = Math.PI * 2 * r;
  const arcs = buildArcs(segments, total, circumference);
  return (
    <div className={styles.donutWrap}>
      <div className={styles.donutSvgWrap}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
          <title>{ariaLabel}</title>
          <circle cx={center} cy={center} r={r} fill="none" stroke="#1a5c4a" strokeWidth={thickness} />
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke={arc.color}
              strokeWidth={thickness}
              strokeDasharray={`${arc.len} ${circumference - arc.len}`}
              strokeDashoffset={arc.start}
              transform={`rotate(-90 ${center} ${center})`}
            />
          ))}
        </svg>
        <div className={styles.donutCenter}><strong>{total}</strong><small>{label}</small></div>
      </div>
      <div className={styles.donutLegend}>
        {segments.map((d) => (
          <span key={d.label}><i style={{ background: d.color }} />{d.label} <strong>{d.value}</strong></span>
        ))}
      </div>
    </div>
  );
}

export default function Analytics({ stats, roster, monthly, insights, csv, session }) {
  const isAdmin = session?.user?.role === "admin";
  const [openStatus, setOpenStatus] = React.useState(() => ({ active: true }));

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

  function cap(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function trendCell(trend) {
    if (trend === "up") return <span className={styles.trendUp}>▲ Up</span>;
    if (trend === "down") return <span className={styles.trendDown}>▼ Down</span>;
    return <span className={styles.trendFlat}>— Stable</span>;
  }

  const statusSegments = stats.statuses.map((item) => ({ label: cap(item.name), value: item.count, color: STATUS_COLORS[item.name] || "#64748b" }));

  return (
    <>
      <Head><title>Analytics | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Evidence at a glance" title="Analytics" active="/analytics">
        <section className={styles.cards}>
          {stats.sports.map((item) => <div className={styles.card} key={item.name}><span>{item.name}</span><strong>{item.count}</strong><small>athletes</small></div>)}
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Population</p><h2>Athletes by sport</h2></div></div>
            {stats.sports.length ? <HBars data={stats.sports} axisLabel="Sport" axisValue="Athletes" /> : <p className={styles.empty}>No athletes yet.</p>}
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Population</p><h2>Share by status</h2></div></div>
            <Donut segments={statusSegments} ariaLabel="Share of athletes by status" />
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Population</p><h2>By status</h2></div></div>
            <div className={styles.statusPanel}>
              {stats.statuses.map((item) => {
                const expanded = openStatus[item.name] ?? false;
                const list = roster[item.name] || [];
                return (
                  <div key={item.name} className={styles.statusBlock}>
                    <button type="button" className={styles.statusToggle} aria-expanded={expanded} onClick={() => setOpenStatus((current) => ({ ...current, [item.name]: !expanded }))}>
                      <span className={styles.statusDot} style={{ background: STATUS_COLORS[item.name] || "#64748b" }} />
                      <span className={styles.statusName}>{cap(item.name)}</span>
                      <span className={styles.statusCount}>{item.count}</span>
                      <span className={styles.statusChevron}>{expanded ? "▲" : "▼"}</span>
                    </button>
                    {expanded && (
                      <div className={styles.statusAthletes}>
                        {list.length ? list.map((athlete) => (
                          <div key={athlete.athleteCode} className={styles.statusAthlete}>
                            <span className={styles.statusAthleteName}>{athlete.name}</span>
                            <span><small>{athlete.athleteCode}</small></span>
                            <span><small>{athlete.sport}</small></span>
                          </div>
                        )) : <div className={styles.empty}>No athletes with this status.</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Measurements</p><h2>Average results</h2></div></div>
            {stats.averages.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Metric</th><th scope="col">Sport</th><th scope="col">Average</th></tr></thead><tbody>{stats.averages.map((item) => <tr key={`${item.sportName}-${item.metricName}`}><td>{item.metricName}<small>{item.unit}</small></td><td>{item.sportName}</td><td><strong>{item.average}</strong>{item.unit ? <small>{item.unit}</small> : null}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No numeric results yet.</p>}
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Activity</p><h2>Assessments recorded</h2></div></div>
            {monthly.length ? <HBars data={monthly} colors={PALETTE} axisLabel="Month" axisValue="Assessments" /> : <p className={styles.empty}>No assessments yet.</p>}
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Measurements</p><h2>Metric summary</h2></div></div>
            {stats.averages.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Metric</th><th scope="col">Samples</th><th scope="col">Unit</th></tr></thead><tbody>{stats.averages.map((item) => <tr key={`s-${item.metricName}`}><td>{item.metricName}</td><td><strong>{item.count}</strong></td><td>{item.unit || "—"}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No data yet.</p>}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Latest results benchmarked</p><h2>Percentile &amp; progress</h2></div>
            <button className={styles.secondary} type="button" onClick={downloadCsv} disabled={!insights.length}>Export CSV</button>
          </div>
          {insights.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Athlete</th><th scope="col">Metric</th><th scope="col">Latest</th><th scope="col">Percentile</th><th scope="col">Trend</th></tr></thead><tbody>{insights.map((row, i) => <tr key={i}><td><strong>{row.athleteName}</strong></td><td>{row.metricName}<small>{row.unit}</small></td><td><strong>{row.value}</strong>{row.unit ? <small>{row.unit}</small> : null}</td><td>{row.band >= 75 ? <strong>{row.band}%</strong> : row.band >= 25 ? <span>{row.band}%</span> : <span className="muted">{row.band}%</span>}</td><td>{trendCell(row.trend)}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No numeric results with trends yet.</p>}
        </section>
      </AppShell>
    </>
  );
}