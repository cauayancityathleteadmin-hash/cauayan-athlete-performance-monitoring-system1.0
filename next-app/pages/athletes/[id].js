import Head from "next/head";
import React from "react";
import Link from "next/link";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };

  const id = Number(context.query.id);
  if (!Number.isSafeInteger(id) || id <= 0) return { notFound: true };

  const athlete = await prisma.athlete.findUnique({
    where: { id },
    include: {
      sport: true,
      event: true,
      school: true,
      coach: { select: { id: true, coachCode: true, firstName: true, middleName: true, lastName: true, school: true } },
      assessments: {
        orderBy: { assessmentDate: "asc" },
        include: { recorder: { select: { email: true } }, results: { include: { metric: true } } },
      },
      statusHistory: { orderBy: { changedAt: "asc" }, include: { changer: { select: { email: true } } } },
      coachHistory: { orderBy: { startedAt: "asc" }, include: { coach: { select: { firstName: true, lastName: true, coachCode: true } } } },
      achievements: { orderBy: { achievementDate: "asc" } },
      participants: {
        where: { status: "active" },
        include: { eventPlan: { select: { id: true, eventName: true, startDate: true, endDate: true, status: true } }, sport: { select: { sportName: true } } },
        orderBy: { addedAt: "desc" },
      },
    },
  });

  if (!athlete) return { notFound: true };

  if (session.user.role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || athlete.coachId !== coach.id) {
      return { redirect: { destination: "/dashboard", permanent: false } };
    }
  }

  return {
    props: {
      session,
      athlete: JSON.parse(JSON.stringify(athlete)),
    },
  };
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtNum(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return isNaN(n) ? String(value) : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/* Build per-metric series from assessments: [{ label, date, name, value }] */
function buildMetricSeries(assessments) {
  const map = new Map();
  for (const assessment of assessments) {
    const when = new Date(assessment.assessmentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
    for (const r of assessment.results) {
      if (r.valueDecimal === null && !r.valueText) continue;
      const label = r.metric.metricName;
      const value = r.valueDecimal !== null ? Number(r.valueDecimal) : null;
      if (value === null || isNaN(value)) continue;
      if (!map.has(label)) map.set(label, []);
      map.get(label).push({ when, value });
    }
  }
  const series = [];
  for (const [name, points] of map.entries()) {
    if (points.length > 1) {
      const sorted = points.sort((a, b) => new Date(a.when) - new Date(b.when));
      series.push({ name, points: sorted });
    }
  }
  return series;
}

/* Small dependency-free SVG line chart */
function LineChart({ points }) {
  const w = 480;
  const h = 150;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 26;
  if (!points || points.length < 2) return <p className={styles.empty}>Not enough measurements to plot a trend yet.</p>;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const step = plotW / (points.length - 1 || 1);
  const coords = points.map((p, i) => {
    const x = padL + i * step;
    const y = padT + plotH - ((p.value - min) / range) * plotH;
    return { x, y, p };
  });

  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${path} L${coords[coords.length - 1].x.toFixed(1)},${h - padB} L${coords[0].x.toFixed(1)},${h - padB} Z`;
  const mid = (min + max) / 2;
  const labelVals = [max, mid, min].map((v) => v.toFixed(1));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Performance trend chart">
      <defs>
        <linearGradient id="ctrend" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(45, 212, 168, 0.35)" />
          <stop offset="100%" stopColor="rgba(45, 212, 168, 0.02)" />
        </linearGradient>
      </defs>
      {[0.1, 0.45, 0.8].map((fy) => (
        <line key={fy} x1={padL} x2={w - padR} y1={padT + plotH * fy} y2={padT + plotH * fy} stroke="rgba(127, 199, 175, 0.12)" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#ctrend)" />
      <path d={path} fill="none" stroke="#2dd4a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r="3.2" fill="#041f18" stroke="#2dd4a8" strokeWidth="2" />
          <text x={c.x} y={h - 8} textAnchor="middle" fontSize="9" fill="var(--muted)">{c.p.when}</text>
        </g>
      ))}
      {labelVals.map((v, i) => {
        const y = padT + (i * (plotH / 2));
        return <text key={i} x={w - padR} y={y + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{v}</text>;
      })}
    </svg>
  );
}

function StatusBadge({ status }) {
  const value = String(status || "").toLowerCase();
  const active = value === "active";
  return (
    <span className={`${styles.badge} ${active ? styles.badgeActive : styles.badgeMuted}`}>
      {(status || "—").charAt(0).toUpperCase() + String(status || "").slice(1)}
    </span>
  );
}

function trendBadge(betterDirection, first, last) {
  if (!betterDirection || betterDirection === "neutral" || first === last) return { text: "No change", cls: styles.badgeMuted };
  const improved = betterDirection === "higher" ? last > first : last < first;
  return improved
    ? { text: "Improving", cls: styles.badgeActive }
    : { text: "Declining", cls: styles.badgeMuted };
}

export default function AthleteProfile({ session, athlete }) {
  const isAdmin = session?.user?.role === "admin";
  const series = React.useMemo(() => buildMetricSeries(athlete.assessments), [athlete.assessments]);

  /* first vs latest assessment results per metric for comparison */
  const comparisons = React.useMemo(() => {
    const out = [];
    if (!athlete.assessments?.length) return out;
    const firstAssessment = athlete.assessments[0];
    const lastAssessment = athlete.assessments[athlete.assessments.length - 1];
    const byKey = {};
    for (const r of firstAssessment.results) {
      if (r.valueDecimal === null) continue;
      byKey[r.metric.metricName] = { name: r.metric.metricName, first: Number(r.valueDecimal), direction: r.metric.betterDirection, firstDate: firstAssessment.assessmentDate };
    }
    for (const r of lastAssessment.results) {
      if (r.valueDecimal === null || !byKey[r.metric.metricName]) continue;
      byKey[r.metric.metricName].last = Number(r.valueDecimal);
      byKey[r.metric.metricName].lastDate = lastAssessment.assessmentDate;
    }
    for (const k of Object.values(byKey)) if (k.last !== undefined) out.push(k);
    return out;
  }, [athlete.assessments]);

  const latestAssessment = athlete.assessments?.[athlete.assessments.length - 1];
  const firstAssessment = athlete.assessments?.[0];

  return (
    <>
      <Head><title>{athlete.firstName} {athlete.lastName} | Athlete Profile</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Athlete" title="Profile" active="/athletes">
        <div className={styles.pageTitle}>
          <div>
            <p className={styles.eyebrow}>Performance record</p>
            <h1>{athlete.firstName} {athlete.middleName ? `${athlete.middleName} ` : ""}{athlete.lastName}</h1>
          </div>
          <div className={styles.actions}>
            <StatusBadge status={athlete.status} />
            <Link className={styles.secondary} href="/athletes">Back to athletes</Link>
          </div>
        </div>

        {/* Overview */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Information</p><h2>Overview</h2></div></div>
          <div className={styles.infoList}>
            <div><dt>Athlete code</dt><dd>{athlete.athleteCode}</dd></div>
            <div><dt>Gender</dt><dd>{athlete.gender || "—"}</dd></div>
            <div><dt>Birthdate</dt><dd>{fmtDate(athlete.birthdate)}</dd></div>
            <div><dt>Sport</dt><dd>{athlete.sport?.sportName || "—"}</dd></div>
            <div><dt>Event / discipline</dt><dd>{athlete.event?.eventName || "—"}</dd></div>
            <div><dt>School</dt><dd>{athlete.school?.schoolName || "—"}</dd></div>
            <div><dt>Coach</dt><dd>{athlete.coach ? `${athlete.coach.firstName} ${athlete.coach.lastName}` : "—"}</dd></div>
            <div><dt>Contact</dt><dd>{athlete.contactNumber || "—"}</dd></div>
            <div><dt>Email</dt><dd>{athlete.email || "—"}</dd></div>
            <div><dt>Registered</dt><dd>{fmtDate(athlete.dateRegistered)}</dd></div>
          </div>
        </section>

        {/* Progress summary */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Progress</p><h2>Summary</h2></div></div>
          <div className={styles.grid}>
            <div className={styles.detailPanel}>
              <h4>Assessments recorded</h4>
              <div className={styles.infoList}>
                <div><dt>Total</dt><dd>{athlete.assessments?.length || 0}</dd></div>
                <div><dt>First</dt><dd>{firstAssessment ? fmtDate(firstAssessment.assessmentDate) : "—"}</dd></div>
                <div><dt>Latest</dt><dd>{latestAssessment ? fmtDate(latestAssessment.assessmentDate) : "—"}</dd></div>
              </div>
            </div>
            <div className={styles.detailPanel}>
              <h4>Baseline vs present</h4>
              {comparisons.length ? (
                <div className={styles.infoList}>
                  {comparisons.map((c) => {
                    const t = trendBadge(c.direction, c.first, c.last);
                    const delta = c.last - c.first;
                    const arrow = delta === 0 ? "→" : delta > 0 ? "▲" : "▼";
                    return (
                      <div key={c.name}>
                        <dt>{c.name}</dt>
                        <dd>
                          <span>{fmtNum(c.first)} &rarr; {fmtNum(c.last)} </span>
                          <span style={{ color: t.cls === styles.badgeActive ? "var(--success)" : "var(--muted)" }}>{arrow} {Math.abs(Number(delta.toFixed(2)))}</span>
                          <small className={styles.badge} style={{ marginLeft: 8, background: t.cls === styles.badgeActive ? "rgba(45,212,168,.12)" : "rgba(127,199,175,.1)", color: t.cls === styles.badgeActive ? "var(--accent)" : "var(--muted)" }}>{t.text}</small>
                        </dd>
                      </div>
                    );
                  })}
                </div>
              ) : <p className={styles.empty}>No baseline comparison available yet.</p>}
            </div>
          </div>
        </section>

        {/* Timeline charts */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Trends</p><h2>Performance timeline</h2></div></div>
          {series.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {series.map((s) => (
                <div key={s.name}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--accent)" }}>{s.name}</h4>
                  <LineChart points={s.points} />
                </div>
              ))}
            </div>
          ) : <p className={styles.empty}>No trend data yet. Record assessments over time to see progress.</p>}
        </section>

        {/* Assessment history */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>History</p><h2>Assessment history</h2></div></div>
          {athlete.assessments?.length ? (
            <div className={styles.tableWrap}><table>
              <thead><tr><th>Date</th><th>Type</th><th>Metrics</th><th>Recorded by</th></tr></thead>
              <tbody>
                {[...athlete.assessments].reverse().map((a) => (
                  <tr key={a.id}>
                    <td>{fmtDate(a.assessmentDate)}</td>
                    <td>{a.assessmentType || "—"}</td>
                    <td>{a.results.length} value{a.results.length === 1 ? "" : "s"}</td>
                    <td>{a.recorder?.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <p className={styles.empty}>No assessments recorded.</p>}
        </section>

        <div className={styles.grid}>
          {/* Status history */}
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Timeline</p><h2>Status history</h2></div></div>
            {athlete.statusHistory?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {athlete.statusHistory.map((s) => (
                  <div key={s.id} className={styles.detailPanel} style={{ padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                      <strong style={{ fontSize: 13, textTransform: "capitalize" }}>{String(s.newStatus).replace("_", " ")}</strong>
                      <small style={{ color: "var(--muted)", fontSize: 12 }}>{fmtDate(s.changedAt)}</small>
                    </div>
                    {s.reason && <small style={{ color: "var(--muted)", fontSize: 12 }}>{s.reason}</small>}
                  </div>
                ))}
              </div>
            ) : <p className={styles.empty}>No status changes recorded.</p>}
          </section>

          {/* Achievements */}
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Recognition</p><h2>Achievements</h2></div></div>
            {athlete.achievements?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {athlete.achievements.map((a) => (
                  <div key={a.id} className={styles.detailPanel} style={{ padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                      <strong style={{ fontSize: 13 }}>{a.achievementTitle}</strong>
                      <small style={{ color: "var(--muted)", fontSize: 12 }}>{fmtDate(a.achievementDate)}</small>
                    </div>
                    {a.achievementType && <small style={{ display: "block", color: "var(--accent)", fontSize: 12, textTransform: "capitalize" }}>{a.achievementType}</small>}
                    {a.organization && <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{a.organization}</small>}
                    {a.description && <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{a.description}</small>}
                  </div>
                ))}
              </div>
            ) : <p className={styles.empty}>No achievements recorded.</p>}
          </section>
        </div>

        {/* Events participated */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Participation</p><h2>Events participated</h2></div></div>
          {athlete.participants?.length ? (
            <div className={styles.tableWrap}><table>
              <thead><tr><th>Event</th><th>Sport</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {athlete.participants.map((p) => (
                  <tr key={p.id}>
                    <td>{p.eventPlan?.eventName || "—"}</td>
                    <td>{p.sport?.sportName || "—"}</td>
                    <td><StatusBadge status={p.eventPlan?.status} /></td>
                    <td>{p.eventPlan?.startDate ? fmtDate(p.eventPlan.startDate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <p className={styles.empty}>Not enrolled in any events yet.</p>}
        </section>
      </AppShell>
    </>
  );
}
