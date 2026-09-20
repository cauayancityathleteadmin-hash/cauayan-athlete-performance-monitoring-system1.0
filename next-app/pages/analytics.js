import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from "recharts";
import AppShell from "../components/AppShell";
import PageSectionTabs from "../components/PageSectionTabs";
import { prisma } from "../lib/prisma";
import styles from "../styles/Dashboard.module.css";
import { CHART_HEIGHTS, CHART_MARGINS, CHART_TOOLTIP, CHART_GRID, CHART_AXIS, CHART_COLORS } from "../lib/chart-config";

const STATUS_COLORS = { active: "#2dd4a8", inactive: "#64748b", pending: "#fbbf24", draft: "#64748b" };
const GENDER_COLORS = { male: "#2dd4a8", female: "#f472b6", other: "#fbbf24", prefer_not_to_say: "#64748b" };
const HEALTH_COLORS = { healthy: "#2dd4a8", sick: "#fbbf24", injured: "#f87171", recovering: "#fb923c", inactive: "#64748b" };
const PALETTE = CHART_COLORS.palette;

const KPI = ({ label, value }) => (
  <div className={styles.kpi}>
    <span className={styles.kpiLabel}>{label}</span>
    <span className={styles.kpiValue}>{value ?? 0}</span>
  </div>
);

const Donut = ({ segments, ariaLabel, label, emptyMessage }) => {
  if (!segments.length) return <p className={styles.empty}>{emptyMessage || "No data yet"}</p>;
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHTS.pie}>
      <RadarChart data={segments} cx={120} cy={120} innerRadius={60} outerRadius={100}>
        <PolarGrid {...CHART_GRID.polar} />
        <PolarAngleAxis dataKey="name" tick={CHART_AXIS.polarAngle} />
        <PolarRadiusAxis domain={[0, "auto"]} hide />
        <Radar name={label} dataKey="value" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.35} />
        <Tooltip {...CHART_TOOLTIP} />
      </RadarChart>
    </ResponsiveContainer>
  );
};

const HBars = ({ data, axisLabel, axisValue, colors, emptyMessage }) => {
  if (!data.length) return <p className={styles.empty}>{emptyMessage || "No data yet"}</p>;
  const cells = colors ? data.map((d, i) => <Cell key={i} fill={colors[i % colors.length]} />) : null;
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHTS.barHorizontal}>
      <BarChart data={data} layout="vertical" margin={CHART_MARGINS.barHorizontal}>
        <CartesianGrid {...CHART_GRID.cartesian} horizontal={false} />
        <XAxis type="number" tick={CHART_AXIS.x} />
        <YAxis type="category" dataKey="name" width={160} tick={{ ...CHART_AXIS.y, fontSize: 11 }} />
        <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`${v} ${axisValue}`, axisLabel]} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>{cells}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const VStacked = ({ data, categories, colors, emptyMessage }) => {
  if (!data.length) return <p className={styles.empty}>{emptyMessage || "No data yet"}</p>;
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHTS.barVertical}>
      <BarChart data={data} margin={CHART_MARGINS.barVertical}>
        <CartesianGrid {...CHART_GRID.cartesian} />
        <XAxis dataKey="name" tick={CHART_AXIS.x} interval={0} />
        <YAxis tick={CHART_AXIS.y} allowDecimals={false} />
        <Tooltip {...CHART_TOOLTIP} />
        {categories.map((c, i) => (
          <Bar key={c} dataKey={c} stackId="a" fill={colors[i % colors.length]} radius={i === categories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

const TrendLine = ({ data, dataKey, name, emptyMessage }) => {
  if (!data.length) return <p className={styles.empty}>{emptyMessage || "No data yet"}</p>;
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHTS.line}>
      <LineChart data={data} margin={CHART_MARGINS.line}>
        <CartesianGrid {...CHART_GRID.cartesian} />
        <XAxis dataKey="name" tick={CHART_AXIS.x} interval="preserveStartEnd" minTickGap={36} />
        <YAxis domain={[0, 10]} tick={CHART_AXIS.y} allowDecimals={false} />
        <Tooltip {...CHART_TOOLTIP} />
        <Line type="monotone" dataKey={dataKey} name={name} stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};

function formatDate(value) {
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
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

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const isAdmin = session.user.role === "admin";

  const now = new Date();
  const weekStart = (d) => {
    const x = new Date(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const firstBucket = new Date(weekStart(now).getTime() - 7 * 7 * 86400000);
  const ninetyDayStart = new Date(now.getTime() - 90 * 86400000);

  const [athletes, assessments, metrics, coaches, schools, events, sports, eventPlans, applications, participants, activityLogs, trainingAssessments, healthByStatus] = await Promise.all([
    prisma.athlete.findMany({ where: { status: "active" }, include: { sport: true, event: true, school: true, coach: { select: { firstName: true, lastName: true, coachCode: true } }, _count: { select: { assessments: true } } }, orderBy: { lastName: "asc" } }),
    prisma.assessment.findMany({ include: { athlete: { select: { athleteCode: true, firstName: true, lastName: true, sport: true } }, recorder: { select: { email: true, username: true } }, results: { include: { metric: true } } }, orderBy: { assessmentDate: "desc" } }),
    prisma.performanceMetric.findMany({ include: { event: { include: { sport: true } } } }),
    prisma.coach.findMany({ include: { school: true, sports: { include: { sport: true } }, _count: { select: { athletes: true } } }, orderBy: { lastName: "asc" } }),
    prisma.school.findMany({ include: { _count: { select: { athletes: true, coaches: true } } }, orderBy: { schoolName: "asc" } }),
    prisma.event.findMany({ include: { sport: true } }),
    prisma.sport.findMany({ include: { _count: { select: { events: true } } } }),
    prisma.eventPlan.findMany(),
    prisma.eventApplication.findMany(),
    prisma.eventParticipant.findMany({ include: { eventPlan: true, sport: true, athlete: true } }),
    prisma.planActivityLog.findMany({ where: { performedAt: { gte: firstBucket }, status: { in: ["done", "partial", "missed"] } }, select: { status: true, performedAt: true } }),
    prisma.trainingAssessment.findMany({ where: { assessmentDate: { gte: ninetyDayStart } }, select: { rating: true, assessmentDate: true }, orderBy: { assessmentDate: "desc" } }),
    prisma.athlete.groupBy({ by: ["healthStatus"], _count: { _all: true } }),
  ]);

  const kpi = {
    totalAthletes: athletes.length,
    activeAthletes: athletes.filter((a) => a.status === "active").length,
    totalAssessments: assessments.length,
    avgPerAthlete: athletes.length ? Math.round(assessments.length / athletes.length * 10) / 10 : 0,
    totalResults: assessments.reduce((sum, a) => sum + a.results.length, 0),
    achievements: 0,
  };

  const sportDist = sports.map((s) => ({ name: s.sportName, value: s._count.events }));
  const statusDist = Object.entries(athletes.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }));
  const genderDist = Object.entries(athletes.reduce((acc, a) => { acc[a.gender] = (acc[a.gender] || 0) + 1; return acc; }, {})).map(([label, value]) => ({ label, value }));
  const schoolDist = schools.map((s) => ({ name: s.schoolName, value: s._count.athletes })).filter((s) => s.value > 0);
  const eventDist = events.map((e) => ({ name: `${e.sport.sportName} — ${e.eventName}`, value: athletes.filter((a) => a.eventId === e.id).length })).filter((e) => e.value > 0);
  const coachDist = coaches.map((c) => ({ name: `${c.firstName} ${c.lastName}`, value: c._count.athletes })).filter((c) => c.value > 0);

  const roster = {};
  for (const a of athletes) {
    if (!roster[a.status]) roster[a.status] = [];
    roster[a.status].push({ name: `${a.lastName}, ${a.firstName}`, athleteCode: a.athleteCode, sport: a.sport?.sportName || "—" });
  }

  const assessmentTypeDist = Object.entries(assessments.reduce((acc, a) => { acc[a.assessmentType] = (acc[a.assessmentType] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }));

  const monthly = Object.entries(assessments.reduce((acc, a) => {
    const m = new Date(a.assessmentDate).toLocaleString("en-US", { month: "short", year: "2-digit" });
    acc[m] = (acc[m] || 0) + 1;
    return acc;
  }, {})).map(([name, value]) => ({ name, value }));

  const assessmentsPerAthlete = athletes
    .map((a) => ({ name: `${a.lastName}, ${a.firstName}`, value: a._count.assessments }))
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const recentAssessments = assessments.slice(0, 10).map((a) => ({
    date: a.assessmentDate instanceof Date ? a.assessmentDate.toISOString() : a.assessmentDate,
    athlete: `${a.athlete.lastName}, ${a.athlete.firstName}`,
    athleteCode: a.athlete.athleteCode,
    sport: a.athlete.sport?.sportName || "—",
    type: a.assessmentType,
    results: a.results.map((r) => `${r.metric.metricName}: ${r.valueDecimal ?? r.valueText ?? "-"}`).join(", "),
  }));

  const metricValues = {};
  for (const a of assessments) {
    for (const r of a.results) {
      if (r.valueDecimal != null) {
        const key = `${r.metric.id}|${a.athlete.sport?.sportName || "—"}`;
        if (!metricValues[key]) metricValues[key] = [];
        metricValues[key].push(Number(r.valueDecimal));
      }
    }
  }
  const averages = Object.entries(metricValues).map(([key, values]) => {
    const [metricId, sportName] = key.split("|");
    const metric = metrics.find((m) => m.id === Number(metricId));
    return { metricName: metric?.metricName || "—", sportName, average: Math.round(values.reduce((s, v) => s + v, 0) / values.length * 10) / 10, unit: metric?.unit || "" };
  });

  const metricRanges = Object.entries(metricValues).map(([key, values]) => {
    const [metricId, sportName] = key.split("|");
    const metric = metrics.find((m) => m.id === Number(metricId));
    const event = metric?.event;
    return { metricName: metric?.metricName || "—", eventName: event?.eventName || "—", sportName, samples: values.length, min: Math.min(...values), max: Math.max(...values), best: metric?.betterDirection === "higher" ? Math.max(...values) : Math.min(...values), unit: metric?.unit || "" };
  });

  const insights = [];
  for (const a of athletes) {
    const athleteAssessments = assessments.filter((as) => as.athlete.id === a.id);
    for (const r of athleteAssessments.flatMap((as) => as.results)) {
      if (r.valueDecimal != null) {
        const sameMetric = assessments.flatMap((as) => as.results).filter((res) => res.metricId === r.metricId && res.valueDecimal != null && res.athleteId !== a.id);
        if (sameMetric.length >= 3) {
          const vals = sameMetric.map((res) => Number(res.valueDecimal)).sort((x, y) => x - y);
          const pct = Math.round(vals.filter((v) => v <= Number(r.valueDecimal)).length / vals.length * 100);
          insights.push({ athleteName: `${a.lastName}, ${a.firstName}`, metricName: r.metric.metricName, unit: r.metric.unit, value: Number(r.valueDecimal), band: pct, trend: pct >= 75 ? "up" : pct >= 25 ? "same" : "down" });
        }
      }
    }
  }

  const coachSchoolDist = schools.map((s) => ({ name: s.schoolName, value: s._count.coaches })).filter((s) => s.value > 0);
  const achievementTypeDist = [];
  const eventPlansAgg = { total: eventPlans.length, byStatus: Object.entries(eventPlans.reduce((acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })) };
  const applicationsAgg = { total: applications.length, byStatus: Object.entries(applications.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })) };
  const participantsAgg = { total: participants.length, byType: Object.entries(participants.reduce((acc, p) => { const t = p.athlete ? "Athlete" : "Coach delegation"; acc[t] = (acc[t] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })) };

  const completionBuckets = [];
  for (let i = 0; i < 8; i += 1) {
    const b = new Date(firstBucket.getTime() + i * 7 * 86400000);
    completionBuckets.push({ name: b.toLocaleDateString("en-US", { month: "short", day: "2-digit" }), done: 0, partial: 0, missed: 0 });
  }
  for (const log of activityLogs) {
    const ws = weekStart(log.performedAt);
    let idx = Math.round((ws.getTime() - firstBucket.getTime()) / 86400000 / 7);
    if (idx < 0) idx = 0;
    if (idx > 7) idx = 7;
    completionBuckets[idx][log.status] += 1;
  }

  const ratingTrend = trainingAssessments.slice().reverse().map((r) => ({ name: new Date(r.assessmentDate).toLocaleDateString("en-US", { month: "short", day: "2-digit" }), rating: r.rating }));
  const ratingDist = [];
  for (let score = 1; score <= 10; score += 1) ratingDist.push({ name: String(score), value: trainingAssessments.filter((r) => r.rating === score).length });

  const healthStatusDist = healthByStatus.map((h) => ({ name: h.healthStatus, value: h._count._all }));

  return {
    props: {
      session,
      isAdmin,
      kpi,
      sportDist, statusDist, genderDist, schoolDist, eventDist, coachDist, roster,
      assessmentTypeDist, monthly, assessmentsPerAthlete, recentAssessments,
      averages, metricRanges, insights,
      coachSchoolDist, achievementTypeDist, eventPlans: eventPlansAgg, applications: applicationsAgg, participants: participantsAgg,
      completionBuckets, ratingTrend, ratingDist, healthStatusDist,
    },
  };
}

export default function Analytics({ session, isAdmin, kpi, sportDist, statusDist, genderDist, schoolDist, eventDist, coachDist, roster, assessmentTypeDist, monthly, assessmentsPerAthlete, recentAssessments, averages, metricRanges, insights, coachSchoolDist, achievementTypeDist, eventPlans, applications, participants, completionBuckets, ratingTrend, ratingDist, healthStatusDist }) {
  const [openStatus, setOpenStatus] = React.useState({});

  const statusSegments = statusDist.map((item) => ({ ...item, color: STATUS_COLORS[item.name] || "#64748b" }));
  const genderSegments = genderDist.map((d) => ({ ...d, color: GENDER_COLORS[d.label.toLowerCase()] || "#64748b" }));
  const healthSegments = healthStatusDist.map((item) => ({ ...item, color: HEALTH_COLORS[item.name] || "#64748b" }));
  const healthFlags = healthStatusDist.filter((h) => ["sick", "injured", "recovering", "inactive"].includes(h.name)).map((h) => ({ name: cap(h.name), value: h.value }));

  const ANALYTICS_SECTIONS = [
    { label: "Athletes", sectionId: "athletes" },
    { label: "Assessments", sectionId: "assessments" },
    { label: "Measurements", sectionId: "measurements" },
    { label: "Training", sectionId: "training" },
    ...(isAdmin ? [{ label: "Program", sectionId: "program" }] : []),
  ];

  return (
    <>
      <Head><title>Analytics | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Analytics" title="Analytics" active="/analytics">
        <div className={styles.pageTitle}><h1>Analytics</h1></div>
        <section className={styles.kpiRow}>
          <KPI label="Total athletes" value={kpi.totalAthletes} />
          <KPI label="Active athletes" value={kpi.activeAthletes} />
          <KPI label="Total assessments" value={kpi.totalAssessments} />
          <KPI label="Assessments per athlete" value={kpi.avgPerAthlete} />
          <KPI label="Results recorded" value={kpi.totalResults} />
          <KPI label="Achievements" value={kpi.achievements} />
        </section>

        <PageSectionTabs sections={ANALYTICS_SECTIONS} defaultSection="athletes">
          <section id="athletes">
            <section className={styles.grid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Athletes</p><h2>Athletes by sport</h2></div></div>
                {sportDist.length ? <HBars data={sportDist} axisLabel="Sport" axisValue="Athletes" /> : <p className={styles.empty}>No athletes yet.</p>}
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Athletes</p><h2>Share by status</h2></div></div>
                <Donut segments={statusSegments} ariaLabel="Share of athletes by status" label="athletes" />
              </div>
            </section>

            <section className={styles.grid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Athletes</p><h2>Athletes by gender</h2></div></div>
                {genderDist.length ? <Donut segments={genderSegments} ariaLabel="Share of athletes by gender" label="athletes" /> : <p className={styles.empty}>No athletes yet.</p>}
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Athletes</p><h2>Athletes by school</h2></div></div>
                {schoolDist.length ? <HBars data={schoolDist} axisLabel="School" axisValue="Athletes" /> : <p className={styles.empty}>No athletes yet.</p>}
              </div>
            </section>

            <section className={styles.grid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Athletes</p><h2>Athletes by event discipline</h2></div></div>
                {eventDist.length ? <HBars data={eventDist} axisLabel="Event" axisValue="Athletes" /> : <p className={styles.empty}>No athletes assigned to events yet.</p>}
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Athletes</p><h2>Athletes by coach</h2></div></div>
                {coachDist.length ? <HBars data={coachDist} axisLabel="Coach" axisValue="Athletes" /> : <p className={styles.empty}>No athletes yet.</p>}
              </div>
            </section>

            <section className={styles.grid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Athletes</p><h2>By status — roster</h2></div></div>
                <div className={styles.statusPanel}>
                  {statusDist.map((item) => {
                    const expanded = openStatus[item.name] ?? false;
                    const list = roster[item.name] || [];
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
            </section>

          <section className={styles.grid}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Athletes</p><h2>Share by health status</h2></div></div>
              <Donut segments={healthSegments} ariaLabel="Share of athletes by health status" label="athletes" emptyMessage="No athletes yet." />
            </div>
            <div className={styles.panel}>
              <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Athletes</p><h2>Health flags</h2></div></div>
              {healthFlags.length ? <HBars data={healthFlags} colors={[CHART_COLORS.warning, CHART_COLORS.danger, CHART_COLORS.accent, CHART_COLORS.muted]} axisLabel="Status" axisValue="Athletes" /> : <p className={styles.empty}>No athletes flagged.</p>}
            </div>
          </section>
          </section>

          <section id="assessments">
            <section className={styles.grid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Assessments</p><h2>Assessments by type</h2></div></div>
                {assessmentTypeDist.length ? <Donut segments={assessmentTypeDist} ariaLabel="Assessments by type" label="assessments" /> : <p className={styles.empty}>No assessments yet.</p>}
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Assessments</p><h2>Assessments recorded per month</h2></div></div>
                {monthly.length ? <HBars data={monthly} colors={PALETTE} axisLabel="Month" axisValue="Assessments" /> : <p className={styles.empty}>No assessments yet.</p>}
              </div>
            </section>

            <section className={styles.grid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Assessments</p><h2>Most assessments per athlete</h2></div></div>
                {assessmentsPerAthlete.length ? <HBars data={assessmentsPerAthlete} axisLabel="Athlete" axisValue="Assessments" /> : <p className={styles.empty}>No assessments yet.</p>}
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Assessments</p><h2>Recent assessments</h2></div></div>
                {recentAssessments.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Date</th><th scope="col">Athlete</th><th scope="col">Sport</th><th scope="col">Type</th><th scope="col">Metrics</th></tr></thead><tbody>{recentAssessments.map((a, i) => <tr key={i}><td data-label="Date">{formatDate(a.date)}</td><td data-label="Athlete"><strong>{a.athlete}</strong><small>{a.athleteCode}</small></td><td data-label="Sport">{a.sport}</td><td data-label="Type">{a.type}</td><td data-label="Metrics">{a.results}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No recent assessments.</p>}
              </div>
            </section>
          </section>

          <section id="measurements">
            <section className={styles.grid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Measurements</p><h2>Average results</h2></div></div>
                {averages.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Metric</th><th scope="col">Sport</th><th scope="col">Sample avg</th></tr></thead><tbody>{averages.map((item) => <tr key={`${item.sportName}-${item.metricName}`}><td data-label="Metric">{item.metricName}<small>{item.unit}</small></td><td data-label="Sport">{item.sportName}</td><td data-label="Sample avg"><strong>{item.average}</strong>{item.unit ? <small>{item.unit}</small> : null}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No numeric results yet.</p>}
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Measurements</p><h2>Metric records & range</h2></div></div>
                {metricRanges.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Metric</th><th scope="col">Event</th><th scope="col">Samples</th><th scope="col">Min–Max</th><th scope="col">Record (best)</th></tr></thead><tbody>{metricRanges.map((item) => <tr key={`${item.sportName}-${item.eventName}-${item.metricName}`}><td data-label="Metric">{item.metricName}<small>{item.unit}</small></td><td data-label="Event">{item.eventName}<small>{item.sportName}</small></td><td data-label="Samples">{item.samples}</td><td data-label="Min–Max">{item.min}–{item.max}{item.unit ? <small>{item.unit}</small> : null}</td><td data-label="Record (best)"><strong>{item.best}</strong>{item.unit ? <small>{item.unit}</small> : null}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No numeric results yet.</p>}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div><p className={styles.eyebrow}>Latest results benchmarked</p><h2>Percentile & progress</h2></div>
                <button className={styles.secondary} type="button" onClick={downloadCsv} disabled={!insights.length}>Export CSV</button>
              </div>
              {insights.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Athlete</th><th scope="col">Metric</th><th scope="col">Latest</th><th scope="col">Percentile</th><th scope="col">Trend vs prior</th></tr></thead><tbody>{insights.map((row, i) => <tr key={i}><td data-label="Athlete"><strong>{row.athleteName}</strong></td><td data-label="Metric">{row.metricName}<small>{row.unit}</small></td><td data-label="Latest"><strong>{row.value}</strong>{row.unit ? <small>{row.unit}</small> : null}</td><td data-label="Percentile">{row.band >= 75 ? <strong>{row.band}%</strong> : row.band >= 25 ? <span>{row.band}%</span> : <span className={styles.mutedSmall}>{row.band}%</span>}</td><td data-label="Trend vs prior">{trendCell(row.trend)}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No numeric results with trends yet.</p>}
            </section>
          </section>

          {isAdmin && (
            <section id="program">
              <section className={styles.grid}>
                <div className={styles.panel}>
                  <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Program</p><h2>Coaches by school</h2></div></div>
                  {coachSchoolDist.length ? <HBars data={coachSchoolDist} axisLabel="School" axisValue="Coaches" /> : <p className={styles.empty}>No coaches registered.</p>}
                </div>
                <div className={styles.panel}>
                  <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Program</p><h2>Achievements by type</h2></div></div>
                  {achievementTypeDist.length ? <HBars data={achievementTypeDist} axisLabel="Achievement type" axisValue="Count" /> : <p className={styles.empty}>No achievements recorded.</p>}
                </div>
              </section>

              <section className={styles.grid}>
                <div className={styles.panel}>
                  <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Program</p><h2>Event programs by status</h2></div></div>
                  {eventPlans.total ? <HBars data={eventPlans.byStatus} axisLabel="Status" axisValue="Programs" /> : <p className={styles.empty}>No event programs yet.</p>}
                </div>
                <div className={styles.panel}>
                  <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Program</p><h2>Applications by status</h2></div></div>
                  {applications.total ? <HBars data={applications.byStatus} axisLabel="Status" axisValue="Applications" /> : <p className={styles.empty}>No applications yet.</p>}
                </div>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Program</p><h2>Event participants by type</h2></div></div>
                {participants.total ? <HBars data={participants.byType} axisLabel="Participant type" axisValue="Participants" /> : <p className={styles.empty}>No participants added yet.</p>}
              </section>
            </section>
          )}

          <section id="training">
            <section className={styles.grid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Training</p><h2>Activity completion — last 8 weeks</h2></div></div>
                <VStacked data={completionBuckets} categories={["done", "partial", "missed"]} colors={[CHART_COLORS.primary, CHART_COLORS.warning, CHART_COLORS.danger]} emptyMessage="No activity logged yet." />
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Training</p><h2>Ratings over time</h2></div></div>
                <TrendLine data={ratingTrend} dataKey="rating" name="Rating" emptyMessage="No training ratings yet." />
              </div>
            </section>

            <section className={styles.grid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Training</p><h2>Rating distribution — 90 days</h2></div></div>
                <VStacked data={ratingDist} categories={["value"]} colors={[CHART_COLORS.primary]} emptyMessage="No training ratings yet." />
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Training</p><h2>Completion snapshot</h2></div></div>
                <p className={styles.formHint}>Done, partial and missed activity totals across the last 8 weeks.</p>
                <div className={styles.statRow}>
                  <div className={styles.stat}><strong>{completionBuckets.reduce((s, w) => s + w.done, 0)}</strong><small>Done</small></div>
                  <div className={styles.stat}><strong>{completionBuckets.reduce((s, w) => s + w.partial, 0)}</strong><small>Partial</small></div>
                  <div className={styles.stat}><strong className={styles.statDanger}>{completionBuckets.reduce((s, w) => s + w.missed, 0)}</strong><small>Missed</small></div>
                </div>
              </div>
            </section>
          </section>
        </PageSectionTabs>
      </AppShell>
    </>
  );
}

function downloadCsv() {}