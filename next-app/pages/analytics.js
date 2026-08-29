import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import { computeInsights, toCsvRows } from "../lib/performance-insights";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

const PALETTE = ["#2dd4a8", "#86efac", "#14b8a6", "#34d399", "#4ade80", "#0d9488", "#5eead4", "#6ee7b7", "#a7f3d0", "#059669"];

const STATUS_COLORS = { active: "#2dd4a8", pending: "#fbbf24", rejected: "#f87171", inactive: "#64748b" };

const GENDER_COLORS = { male: "#2dd4a8", female: "#38bdf8", other: "#a78bfa", prefer_not_to_say: "#64748b" };
const GENDER_LABELS = { male: "Male", female: "Female", other: "Other", prefer_not_to_say: "Prefer not to say" };

const DIRECTION_LABELS = { higher: "Higher is better", lower: "Lower is better", neutral: "Neutral" };

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const isAdmin = session.user.role === "admin";
  const userId = Number(session.user.id);

  const athleteWhere = isAdmin ? {} : { coach: { userId } };
  const assessmentWhere = isAdmin ? {} : { athlete: { coach: { userId } } };
  const resultWhere = isAdmin ? { valueDecimal: { not: null } } : { valueDecimal: { not: null }, assessment: { athlete: { coach: { userId } } } };
  const achievementWhere = isAdmin ? {} : { athlete: { coach: { userId } } };

  const [
    bySport, byStatus, byGender, bySchool, byEvent, byCoach,
    results, athletes, assessmentDates, assessmentTypes,
    recentAssessments, achievementCount, achievementsByType, schools,
    coachSchoolAgg, eventPlanStatus, applicationStatus, participantType,
  ] = await Promise.all([
    prisma.athlete.groupBy({ by: ["sportId"], where: athleteWhere, _count: { _all: true } }),
    prisma.athlete.groupBy({ by: ["status"], where: athleteWhere, _count: { _all: true } }),
    prisma.athlete.groupBy({ by: ["gender"], where: athleteWhere, _count: { _all: true } }),
    prisma.athlete.groupBy({ by: ["schoolId"], where: athleteWhere, _count: { _all: true } }),
    prisma.athlete.groupBy({ by: ["eventId"], where: athleteWhere, _count: { _all: true } }),
    prisma.athlete.groupBy({ by: ["coachId"], where: athleteWhere, _count: { _all: true } }),
    prisma.assessmentResult.findMany({ where: resultWhere, include: { metric: { include: { event: { include: { sport: true } } } }, assessment: { include: { athlete: true } } } }),
    prisma.athlete.findMany({ where: athleteWhere, select: { id: true, athleteCode: true, firstName: true, lastName: true, gender: true, status: true, school: { select: { schoolName: true } }, sport: { select: { sportName: true } }, event: { select: { eventName: true } }, coach: { select: { firstName: true, lastName: true } }, _count: { select: { assessments: true, achievements: true } } }, orderBy: { lastName: "asc" } }),
    prisma.assessment.findMany({ where: assessmentWhere, select: { assessmentDate: true } }),
    prisma.assessment.groupBy({ by: ["assessmentType"], where: assessmentWhere, _count: { _all: true } }),
    prisma.assessment.findMany({ where: assessmentWhere, include: { athlete: { select: { firstName: true, lastName: true, athleteCode: true, sport: { select: { sportName: true } } } }, recorder: { select: { username: true } }, _count: { select: { results: true } } }, orderBy: { assessmentDate: "desc" }, take: 8 }),
    prisma.achievement.count({ where: achievementWhere }),
    prisma.achievement.groupBy({ by: ["achievementType"], where: achievementWhere, _count: { _all: true } }),
    prisma.school.findMany({ select: { id: true, schoolName: true } }),
    isAdmin ? prisma.coach.groupBy({ by: ["schoolId"], _count: { _all: true } }) : Promise.resolve([]),
    isAdmin ? prisma.eventPlan.groupBy({ by: ["status"], _count: { _all: true } }) : Promise.resolve([]),
    isAdmin ? prisma.eventApplication.groupBy({ by: ["status"], _count: { _all: true } }) : Promise.resolve([]),
    isAdmin ? prisma.eventParticipant.groupBy({ by: ["participantType"], _count: { _all: true } }) : Promise.resolve([]),
  ]);

  const sports = await prisma.sport.findMany({ select: { id: true, sportName: true } });
  const events = await prisma.event.findMany({ select: { id: true, eventName: true } });
  const coaches = await prisma.coach.findMany({ select: { id: true, firstName: true, lastName: true } });

  const displayName = (m, id) => (m.find((x) => x.id === id));

  const averages = {};
  const metricStats = {};
  const insightAssessments = new Map();
  for (const result of results) {
    const metric = result.metric;
    const value = Number(result.valueDecimal);
    const sportName = metric.event.sport.sportName;
    const eventName = metric.event.eventName;
    const mkey = `${sportName} / ${eventName} / ${metric.metricName}`;
    if (!averages[metric.metricName]) averages[metric.metricName] = { metricName: metric.metricName, unit: metric.unit, sportName, total: 0, count: 0 };
    averages[metric.metricName].total += value;
    averages[metric.metricName].count += 1;
    if (!metricStats[mkey]) metricStats[mkey] = { metricName: metric.metricName, unit: metric.unit, sportName, eventName, betterDirection: metric.betterDirection || "neutral", values: [] };
    metricStats[mkey].values.push(value);
    if (!insightAssessments.has(result.assessment.id)) insightAssessments.set(result.assessment.id, { athlete: result.assessment.athlete, assessmentDate: result.assessment.assessmentDate, results: [] });
    insightAssessments.get(result.assessment.id).results.push({ metric, valueDecimal: result.valueDecimal });
  }
  const insights = computeInsights([...insightAssessments.values()]);
  const csv = toCsvRows(insights);

  const metricRanges = Object.values(metricStats).map((m) => {
    const vals = m.values;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const best = m.betterDirection === "lower" ? min : m.betterDirection === "higher" ? max : null;
    return {
      metricName: m.metricName,
      unit: m.unit || "",
      sportName: m.sportName,
      eventName: m.eventName,
      betterDirection: m.betterDirection,
      samples: vals.length,
      min,
      max,
      best,
    };
  }).sort((a, b) => a.sportName.localeCompare(b.sportName) || a.eventName.localeCompare(b.eventName));

  const roster = {};
  const genderByAthlete = {};
  for (const athlete of athletes) {
    if (!roster[athlete.status]) roster[athlete.status] = [];
    roster[athlete.status].push({ athleteCode: athlete.athleteCode, name: `${athlete.lastName}, ${athlete.firstName}`, sport: athlete.sport?.sportName || "" });
    genderByAthlete[athlete.id] = athlete.gender;
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

  const sportDist = bySport.map((item) => ({ label: displayName(sports, item.sportId)?.sportName || "Unknown", value: item._count._all }));
  const statusDist = byStatus.map((item) => ({ name: item.status, label: item.status, value: item._count._all }));
  const genderDist = byGender.map((item) => ({ label: GENDER_LABELS[item.gender] || item.gender, value: item._count._all }));
  const schoolDist = bySchool.map((item) => ({ label: displayName(schools, item.schoolId)?.schoolName || "No school", value: item._count._all }));
  const eventDist = byEvent.map((item) => ({ label: displayName(events, item.eventId)?.eventName || "No event", value: item._count._all }));
  const coachDist = byCoach.map((item) => {
    const c = displayName(coaches, item.coachId);
    return { label: c ? `${c.firstName} ${c.lastName}` : "Unknown coach", value: item._count._all };
  }).sort((a, b) => b.value - a.value);

  const assessmentTypeDist = assessmentTypes.map((item) => ({ label: item.assessmentType, value: item._count._all }));
  const achievementTypeDist = achievementsByType.map((item) => ({ label: item.achievementType || "General", value: item._count._all }));

  const coachSchoolDist = coachSchoolAgg.map((item) => ({ label: displayName(schools, item.schoolId)?.schoolName || "No school", value: item._count._all })).sort((a, b) => b.value - a.value);

  const totalAthletes = athletes.length;
  const totalAssessments = assessmentDates.length;
  const totalResults = results.length;
  const activeAthletes = statusDist.find((s) => s.name === "active")?.value || 0;
  const avgPerAthlete = totalAthletes ? (totalAssessments / totalAthletes).toFixed(1) : "0.0";

  const achievementsPerAthlete = athletes
    .filter((a) => a._count.achievements > 0)
    .map((a) => ({ name: `${a.firstName} ${a.lastName}`, value: a._count.achievements }))
    .sort((a, b) => b.value - a.value).slice(0, 5);
  const assessmentsPerAthlete = athletes
    .map((a) => ({ name: `${a.firstName} ${a.lastName}`, value: a._count.assessments }))
    .sort((a, b) => b.value - a.value).slice(0, 5);

  return {
    props: {
      session,
      data: {
        kpi: { totalAthletes, activeAthletes, totalAssessments, totalResults, avgPerAthlete, achievements: achievementCount },
        sportDist,
        statusDist,
        genderDist,
        schoolDist,
        eventDist,
        coachDist,
        roster,
        monthly,
        assessmentTypeDist,
        achievementTypeDist,
        coachSchoolDist,
        averages: Object.values(averages).map((item) => ({ ...item, average: (item.total / item.count).toFixed(2) })),
        metricRanges,
        recentAssessments: recentAssessments.map((a) => ({
          date: a.assessmentDate,
          athlete: `${a.athlete.firstName} ${a.athlete.lastName}`,
          athleteCode: a.athlete.athleteCode,
          sport: a.athlete.sport?.sportName || "",
          type: a.assessmentType,
          recorder: a.recorder?.username || "",
          results: a._count.results,
        })),
        eventPlans: {
          total: eventPlanStatus.reduce((s, e) => s + e._count._all, 0),
          byStatus: eventPlanStatus.map((e) => ({ label: e.status, value: e._count._all })),
        },
        applications: {
          total: applicationStatus.reduce((s, e) => s + e._count._all, 0),
          byStatus: applicationStatus.map((e) => ({ label: e.status, value: e._count._all })),
        },
        participants: {
          total: participantType.reduce((s, e) => s + e._count._all, 0),
          byType: participantType.map((e) => ({ label: e.participantType, value: e._count._all })),
        },
        isAdmin,
      },
      insights,
      csv,
    },
  };
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

function Donut({ segments, colors, size = 150, thickness = 22, label = "total", ariaLabel = "Chart", legendSuffix = "" }) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className={styles.empty}>No data yet.</p>;
  const r = (size - thickness) / 2;
  const center = size / 2;
  const circumference = Math.PI * 2 * r;
  const colored = segments.map((d, i) => ({ ...d, color: d.color || colors[i % colors.length] }));
  const arcs = buildArcs(colored, total, circumference);
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
        {colored.map((d) => (
          <span key={d.label}><i style={{ background: d.color }} />{d.label} <strong>{d.value}</strong>{legendSuffix}</span>
        ))}
      </div>
    </div>
  );
}

function KPI({ label, value, sub }) {
  return (
    <div className={styles.kpi}>
      <strong>{value}</strong>
      <span>{label}</span>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

export default function Analytics({ data, insights, csv, session }) {
  const { isAdmin } = data;
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
    if (!value) return "—";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function trendCell(trend) {
    if (trend === "up") return <span className={styles.trendUp}>▲ Up</span>;
    if (trend === "down") return <span className={styles.trendDown}>▼ Down</span>;
    if (trend === "same") return <span className={styles.trendFlat}>— Same</span>;
    return <span className={styles.trendFlat}>— No trend</span>;
  }

  const statusSegments = data.statusDist.map((item) => ({ ...item, color: STATUS_COLORS[item.name] || "#64748b" }));

  return (
    <>
      <Head><title>Analytics | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Evidence at a glance" title="Analytics" active="/analytics">
        <section className={styles.kpiRow}>
          <KPI label="Total athletes" value={data.kpi.totalAthletes} />
          <KPI label="Active athletes" value={data.kpi.activeAthletes} />
          <KPI label="Total assessments" value={data.kpi.totalAssessments} />
          <KPI label="Avg assessments / athlete" value={data.kpi.avgPerAthlete} />
          <KPI label="Numeric results" value={data.kpi.totalResults} />
          <KPI label="Achievements" value={data.kpi.achievements} />
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Population</p><h2>Athletes by sport</h2></div></div>
            {data.sportDist.length ? <HBars data={data.sportDist} axisLabel="Sport" axisValue="Athletes" /> : <p className={styles.empty}>No athletes yet.</p>}
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Population</p><h2>Share by status</h2></div></div>
            <Donut segments={statusSegments} ariaLabel="Share of athletes by status" label="athletes" />
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Population</p><h2>Athletes by gender</h2></div></div>
            {data.genderDist.length ? <Donut segments={data.genderDist.map((d) => ({ ...d, color: GENDER_COLORS[d.label.toLowerCase()] || "#64748b" }))} ariaLabel="Share of athletes by gender" label="athletes" /> : <p className={styles.empty}>No athletes yet.</p>}
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Population</p><h2>Athletes by school</h2></div></div>
            {data.schoolDist.length ? <HBars data={data.schoolDist} axisLabel="School" axisValue="Athletes" /> : <p className={styles.empty}>No athletes yet.</p>}
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Population</p><h2>Athletes by event discipline</h2></div></div>
            {data.eventDist.length ? <HBars data={data.eventDist} axisLabel="Event" axisValue="Athletes" /> : <p className={styles.empty}>No athletes assigned to events yet.</p>}
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Population</p><h2>Athletes by coach</h2></div></div>
            {data.coachDist.length ? <HBars data={data.coachDist} axisLabel="Coach" axisValue="Athletes" /> : <p className={styles.empty}>No athletes yet.</p>}
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Population</p><h2>By status — roster</h2></div></div>
            <div className={styles.statusPanel}>
              {data.statusDist.map((item) => {
                const expanded = openStatus[item.name] ?? false;
                const list = data.roster[item.name] || [];
                return (
                  <div key={item.name} className={styles.statusBlock}>
                    <button type="button" className={styles.statusToggle} aria-expanded={expanded} onClick={() => setOpenStatus((current) => ({ ...current, [item.name]: !expanded }))}>
                      <span className={styles.statusDot} style={{ background: STATUS_COLORS[item.name] || "#64748b" }} />
                      <span className={styles.statusName}>{cap(item.name)}</span>
                      <span className={styles.statusCount}>{item.value}</span>
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
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Activity</p><h2>Assessments by type</h2></div></div>
            {data.assessmentTypeDist.length ? <Donut segments={data.assessmentTypeDist.map((d, i) => ({ ...d, color: PALETTE[i % PALETTE.length] }))} ariaLabel="Assessments by type" label="assessments" /> : <p className={styles.empty}>No assessments yet.</p>}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Activity</p><h2>Assessments recorded per month</h2></div></div>
          {data.monthly.length ? <HBars data={data.monthly} colors={PALETTE} axisLabel="Month" axisValue="Assessments" /> : <p className={styles.empty}>No assessments yet.</p>}
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Activity</p><h2>Most assessments per athlete</h2></div></div>
            {data.assessmentsPerAthlete.length ? <HBars data={data.assessmentsPerAthlete} axisLabel="Athlete" axisValue="Assessments" /> : <p className={styles.empty}>No assessments yet.</p>}
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Activity</p><h2>Recent assessments</h2></div></div>
            {data.recentAssessments.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Date</th><th scope="col">Athlete</th><th scope="col">Sport</th><th scope="col">Type</th><th scope="col">Metrics</th></tr></thead><tbody>{data.recentAssessments.map((a, i) => <tr key={i}><td>{formatDate(a.date)}</td><td><strong>{a.athlete}</strong><small>{a.athleteCode}</small></td><td>{a.sport}</td><td>{a.type}</td><td>{a.results}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No recent assessments.</p>}
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Measurements</p><h2>Average results</h2></div></div>
            {data.averages.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Metric</th><th scope="col">Sport</th><th scope="col">Sample avg</th></tr></thead><tbody>{data.averages.map((item) => <tr key={`${item.sportName}-${item.metricName}`}><td>{item.metricName}<small>{item.unit}</small></td><td>{item.sportName}</td><td><strong>{item.average}</strong>{item.unit ? <small>{item.unit}</small> : null}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No numeric results yet.</p>}
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Measurements</p><h2>Metric records &amp; range</h2></div></div>
            {data.metricRanges.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Metric</th><th scope="col">Event</th><th scope="col">Samples</th><th scope="col">Min–Max</th><th scope="col">Record (best)</th></tr></thead><tbody>{data.metricRanges.map((item) => <tr key={`${item.sportName}-${item.eventName}-${item.metricName}`}><td>{item.metricName}<small>{item.unit}</small></td><td>{item.eventName}<small>{item.sportName}</small></td><td>{item.samples}</td><td>{item.min}–{item.max}{item.unit ? <small>{item.unit}</small> : null}</td><td><strong>{item.best}</strong>{item.unit ? <small>{item.unit}</small> : null}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No numeric results yet.</p>}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Latest results benchmarked</p><h2>Percentile &amp; progress</h2></div>
            <button className={styles.secondary} type="button" onClick={downloadCsv} disabled={!insights.length}>Export CSV</button>
          </div>
          {insights.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Athlete</th><th scope="col">Metric</th><th scope="col">Latest</th><th scope="col">Percentile</th><th scope="col">Trend vs prior</th></tr></thead><tbody>{insights.map((row, i) => <tr key={i}><td><strong>{row.athleteName}</strong></td><td>{row.metricName}<small>{row.unit}</small></td><td><strong>{row.value}</strong>{row.unit ? <small>{row.unit}</small> : null}</td><td>{row.band >= 75 ? <strong>{row.band}%</strong> : row.band >= 25 ? <span>{row.band}%</span> : <span className="muted">{row.band}%</span>}</td><td>{trendCell(row.trend)}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No numeric results with trends yet.</p>}
        </section>

        {isAdmin && (
          <>
            <section className={styles.grid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Ecosystem</p><h2>Coaches by school</h2></div></div>
                {data.coachSchoolDist.length ? <HBars data={data.coachSchoolDist} axisLabel="School" axisValue="Coaches" /> : <p className={styles.empty}>No coaches registered.</p>}
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Ecosystem</p><h2>Achievements by type</h2></div></div>
                {data.achievementTypeDist.length ? <HBars data={data.achievementTypeDist} axisLabel="Achievement type" axisValue="Count" /> : <p className={styles.empty}>No achievements recorded.</p>}
              </div>
            </section>

            <section className={styles.grid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Ecosystem</p><h2>Event programs by status</h2></div></div>
                {data.eventPlans.total ? <HBars data={data.eventPlans.byStatus} axisLabel="Status" axisValue="Programs" /> : <p className={styles.empty}>No event programs yet.</p>}
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Ecosystem</p><h2>Applications by status</h2></div></div>
                {data.applications.total ? <HBars data={data.applications.byStatus} axisLabel="Status" axisValue="Applications" /> : <p className={styles.empty}>No applications yet.</p>}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Ecosystem</p><h2>Event participants by type</h2></div></div>
              {data.participants.total ? <HBars data={data.participants.byType} axisLabel="Participant type" axisValue="Participants" /> : <p className={styles.empty}>No participants added yet.</p>}
            </section>
          </>
        )}
      </AppShell>
    </>
  );
}