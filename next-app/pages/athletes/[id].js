import Head from "next/head";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import AppShell from "../../components/AppShell";
import IdPhotoUpload from "../../components/IdPhotoUpload";
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
      healthLogs: { orderBy: { reportedAt: "desc" }, include: { reporter: { select: { username: true, email: true, coach: { select: { firstName: true, lastName: true } } } } } },
participants: {
        where: { status: "active" },
        include: { eventPlan: { select: { id: true, eventName: true, startDate: true, endDate: true, status: true } }, sport: { select: { sportName: true } } },
        orderBy: { createdAt: "desc" },
      },
      trainingPlans: {
        include: { plan: { select: { id: true, planName: true, frequency: true, startDate: true, endDate: true, status: true, sport: { select: { sportName: true } }, coach: { select: { firstName: true, lastName: true } } } } },
        orderBy: { plan: { startDate: "desc" } },
      },
      trainingAssessments: {
        orderBy: { assessmentDate: "desc" },
        include: { plan: { select: { id: true, planName: true } }, assessor: { select: { username: true, email: true } } },
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

  const catalog = {
    sports: await prisma.sport.findMany({ where: { status: "active" }, orderBy: { sportName: "asc" } }),
    events: await prisma.event.findMany({ where: { status: "active" }, include: { sport: true }, orderBy: { eventName: "asc" } }),
    schools: await prisma.school.findMany({ where: { status: "active" }, orderBy: { schoolName: "asc" } }),
    coaches: session.user.role === "admin"
      ? await prisma.coach.findMany({ where: { status: "active" }, orderBy: { lastName: "asc" }, select: { id: true, coachCode: true, firstName: true, lastName: true, schoolId: true, school: { select: { schoolName: true } } } })
      : [],
  };

  return {
    props: {
      session,
      athlete: JSON.parse(JSON.stringify(athlete)),
      catalog: JSON.parse(JSON.stringify(catalog)),
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

const HEALTH_META = {
  healthy: { label: "Healthy", cls: "badgeActive" },
  sick: { label: "Sick", cls: "badgeRejected" },
  injured: { label: "Injured", cls: "badgeRejected" },
  recovering: { label: "Recovering", cls: "badgePending" },
  inactive: { label: "Inactive", cls: "badgeMuted" },
};

function HealthBadge({ status }) {
  const meta = HEALTH_META[status] || { label: status || "—", cls: "badgeMuted" };
  return <span className={`${styles.badge} ${styles[meta.cls]}`}>{meta.label}</span>;
}

function trendBadge(betterDirection, first, last) {
  if (!betterDirection || betterDirection === "neutral" || first === last) return { text: "No change", cls: styles.badgeMuted };
  const improved = betterDirection === "higher" ? last > first : last < first;
  return improved
    ? { text: "Improving", cls: styles.badgeActive }
    : { text: "Declining", cls: styles.badgeMuted };
}

export default function AthleteProfile({ session, athlete, catalog }) {
  const isAdmin = session?.user?.role === "admin";
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
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
            <Link className={styles.primary} href={`/athletes/${athlete.id}/progress`}>View progress</Link>
            <Link className={styles.secondary} href="/athletes">Back to athletes</Link>
          </div>
        </div>

        {/* Overview */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Information</p><h2>Overview</h2></div>
            <button type="button" className={styles.secondary} onClick={() => setEditOpen(!editOpen)}>{editOpen ? "Cancel" : "Edit athlete"}</button>
          </div>
          {editOpen && <EditAthleteForm athlete={athlete} catalog={catalog} isAdmin={isAdmin} onDone={() => { setEditOpen(false); router.reload(); }} />}
          <div className={styles.grid}>
            <AthletePhotoCard athlete={athlete} />
            <div className={styles.detailPanel}>
              <h4>Personal</h4>
              <div className={styles.infoList}>
                <div><dt>Athlete code</dt><dd>{athlete.athleteCode}</dd></div>
                <div><dt>Gender</dt><dd>{athlete.gender || "—"}</dd></div>
                <div><dt>Birthdate</dt><dd>{fmtDate(athlete.birthdate)}</dd></div>
                <div><dt>Address</dt><dd>{athlete.address || "—"}</dd></div>
              </div>
            </div>
            <div className={styles.detailPanel}>
              <h4>Sport &amp; program</h4>
              <div className={styles.infoList}>
                <div><dt>Sport</dt><dd>{athlete.sport?.sportName || "—"}</dd></div>
                <div><dt>Event / discipline</dt><dd>{athlete.event?.eventName || "—"}</dd></div>
                <div><dt>School</dt><dd>{athlete.school?.schoolName || "—"}</dd></div>
                <div><dt>Coach</dt><dd>{athlete.coach ? `${athlete.coach.firstName} ${athlete.coach.lastName}` : "—"}</dd></div>
              </div>
            </div>
            <div className={styles.detailPanel}>
              <h4>Contact &amp; physical</h4>
              <div className={styles.infoList}>
                <div><dt>Contact</dt><dd>{athlete.contactNumber || "—"}</dd></div>
                <div><dt>Email</dt><dd>{athlete.email || "—"}</dd></div>
                <div><dt>Height</dt><dd>{athlete.height ? `${fmtNum(athlete.height)} cm` : "—"}</dd></div>
                <div><dt>Weight</dt><dd>{athlete.weight ? `${fmtNum(athlete.weight)} kg` : "—"}</dd></div>
              </div>
            </div>
          </div>
<div className={styles.infoList} style={{ marginTop: 14 }}>
            <div><dt>Health status</dt><dd><HealthBadge status={athlete.healthStatus} /></dd></div>
            {athlete.healthNotes ? <div><dt>Health notes</dt><dd>{athlete.healthNotes}</dd></div> : null}
            <div><dt>Registered</dt><dd>{fmtDate(athlete.dateRegistered)}</dd></div>
          </div>
        </section>

        {/* Health tracking */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Wellness</p><h2>Health tracking</h2></div><span style={{ alignSelf: "center" }}><HealthBadge status={athlete.healthStatus} /></span></div>
          <HealthForm athleteId={athlete.id} onComplete={() => router.reload()} />
          {athlete.healthLogs?.length ? (
            <div className={styles.tableWrap}><table>
              <thead><tr><th>Status</th><th>Notes</th><th>Reported</th><th>By</th></tr></thead>
              <tbody>
                {athlete.healthLogs.map((h) => (
                  <tr key={h.id}>
                    <td><HealthBadge status={h.status} /></td>
                    <td>{h.description || "—"}</td>
                    <td>{fmtDate(h.reportedAt)}</td>
                    <td>{healthReporterName(h.reporter)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <p className={styles.empty}>No health history recorded yet.</p>}
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
            <StatusForm athleteId={athlete.id} currentStatus={athlete.status} onComplete={() => router.reload()} />
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
            <AchievementForm athleteId={athlete.id} catalog={catalog} onComplete={() => router.reload()} />
            {athlete.achievements?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {athlete.achievements.map((a) => (
                  <div key={a.id} className={styles.detailPanel} style={{ padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                      <strong style={{ fontSize: 13 }}>{a.achievementTitle}</strong>
                      <small style={{ color: "var(--muted)", fontSize: 12 }}>{fmtDate(a.achievementDate)}</small>
                    </div>
                    {(a.medal || a.level) && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                        {a.medal && <span className={`${styles.badge} ${a.medal === "gold" ? styles.badgeActive : a.medal === "participation" ? styles.badgeMuted : styles.badgePending}`} style={{ textTransform: "capitalize" }}>{a.medal}</span>}
                        {a.level && <span className={`${styles.badge} ${styles.badgePending}`} style={{ textTransform: "capitalize" }}>{a.level}</span>}
                      </div>
                    )}
                    {a.achievementType && <small style={{ display: "block", color: "var(--accent)", fontSize: 12, textTransform: "capitalize", marginTop: 4 }}>{a.achievementType}</small>}
                    {a.organization && <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{a.organization}</small>}
                    {a.description && <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{a.description}</small>}
                    {a.certificateUrl && <small style={{ display: "block", marginTop: 2 }}><a href={a.certificateUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>View certificate</a></small>}
                  </div>
                ))}
              </div>
            ) : <p className={styles.empty}>No achievements recorded.</p>}
          </section>
        </div>

        {/* Coaching notes */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Observations</p><h2>Coaching notes</h2></div></div>
          <NoteForm athleteId={athlete.id} onComplete={() => router.reload()} />
          {athlete.notes?.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Note</th><th>Author</th><th>Date</th></tr></thead>
                <tbody>
                  {athlete.notes.map((n) => (
                    <tr key={n.id}>
                      <td>{n.note}</td>
                      <td>{noteAuthorName(n.author)}</td>
                      <td>{fmtDate(n.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={styles.empty}>No coaching notes yet.</p>}
        </section>

{/* Participation: events by the athlete */}
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

        {/* Training plans & assessments */}
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Training</p><h2>Training plan &amp; assessments</h2></div><Link href="/training-plans">Open training</Link></div>
          <div className={styles.grid}>
            <div className={styles.detailPanel}>
              <h4>Training plans</h4>
              {athlete.trainingPlans?.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {athlete.trainingPlans.map((tpl) => (
                    <div key={tpl.id} className={styles.detailPanel} style={{ padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                        <strong style={{ fontSize: 13 }}>{tpl.plan?.planName || "—"}</strong>
                        <small style={{ color: "var(--muted)", fontSize: 12, textTransform: "capitalize" }}>{tpl.plan?.frequency || "—"}</small>
                      </div>
                      <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{tpl.plan?.sport?.sportName || ""}{tpl.plan?.startDate ? ` · ${fmtDate(tpl.plan.startDate)}` : ""}{tpl.plan?.endDate ? ` – ${fmtDate(tpl.plan.endDate)}` : ""}</small>
                      {tpl.plan?.status === "completed" ? <span className={`${styles.badge} ${styles.badgeMuted}`}>Completed</span> : <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span>}
                    </div>
                  ))}
                </div>
              ) : <p className={styles.empty}>Not on any training plans yet.</p>}
            </div>
            <div className={styles.detailPanel}>
              <h4>Assessment history</h4>
              {athlete.trainingAssessments?.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {athlete.trainingAssessments.map((a) => (
                    <div key={a.id} className={styles.detailPanel} style={{ padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <strong style={{ fontSize: 13 }}>{fmtDate(a.assessmentDate)}</strong>
                        <span className={`${styles.badge} ${a.rating >= 8 ? styles.badgeActive : styles.badgePending}`}>{a.rating}/10</span>
                      </div>
                      {a.plan?.planName && <small style={{ display: "block", color: "var(--accent)", fontSize: 12 }}>{a.plan.planName}</small>}
                      {a.comments && <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{a.comments}</small>}
                    </div>
                  ))}
                </div>
              ) : <p className={styles.empty}>No training assessments recorded yet.</p>}
            </div>
          </div>
        </section>
      </AppShell>
    </>
  );
}

function StatusForm({ athleteId, currentStatus, onComplete }) {
  const [status, setStatus] = React.useState(currentStatus === "active" ? "inactive" : "active");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch(`/api/athletes/${athleteId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify({ status, reason }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    if (response && response.ok && !result.error) {
      setMessage(result.message || "Updated.");
      setReason("");
      onComplete();
    } else {
      setMessage(result.error || "Could not update status.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.formStack} style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ flex: "0 0 auto" }}>Set status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={styles.fieldControl}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label style={{ flex: "1 1 160px", minWidth: 0 }}>Reason
          <input name="reason" className={styles.fieldControl} type="text" maxLength="500" placeholder="e.g. returned from injury" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Update status"}</button>
      </div>
      {message && <p role="status" className={styles.formHint}>{message}</p>}
    </form>
  );
}

function AchievementForm({ athleteId, catalog, onComplete }) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [today] = React.useState(() => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); });
  const [sportId, setSportId] = React.useState(athleteId ? "" : "");
  const eventsForSport = catalog?.events?.filter((e) => e.sportId === Number(sportId)) || [];
  const currentSport = Number(sportId);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch(`/api/athletes/${athleteId}/achievements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify({
        title: form.get("title"),
        achievementType: form.get("achievementType"),
        organization: form.get("organization"),
        achievementDate: form.get("achievementDate"),
        description: form.get("description"),
        medal: form.get("medal"),
        level: form.get("level"),
        sportId: Number(form.get("sportId")) || null,
        eventId: Number(form.get("eventId")) || null,
        certificateUrl: form.get("certificateUrl"),
      }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    if (response && response.ok && !result.error) {
      setMessage("Achievement added.");
      event.currentTarget.reset();
      onComplete();
    } else {
      setMessage(result.error || "Could not add achievement.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.formStack} style={{ marginBottom: 14 }}>
      <label>Title *<input name="title" className={styles.fieldControl} required maxLength="150" placeholder="e.g. Gold medal, 100m sprint" /></label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 140px" }}>Medal / result
          <select name="medal" className={styles.fieldControl} defaultValue="">
            <option value="">None</option>
            <option value="gold">Gold (1st)</option>
            <option value="silver">Silver (2nd)</option>
            <option value="bronze">Bronze (3rd)</option>
            <option value="participation">Participation</option>
          </select>
        </label>
        <label style={{ flex: "1 1 160px" }}>Level
          <select name="level" className={styles.fieldControl} defaultValue="">
            <option value="">None</option>
            <option value="intramural">Intramural</option>
            <option value="district">District</option>
            <option value="regional">Regional</option>
            <option value="national">National</option>
            <option value="international">International</option>
          </select>
        </label>
        <label style={{ flex: "1 1 160px" }}>Date
          <input name="achievementDate" className={styles.fieldControl} type="date" defaultValue={today} />
        </label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 160px" }}>Sport
          <select name="sportId" className={styles.fieldControl} defaultValue="" onChange={(e) => setSportId(e.target.value)}>
            <option value="">None</option>
            {(catalog?.sports || []).map((s) => <option value={s.id} key={s.id}>{s.sportName}</option>)}
          </select>
        </label>
        <label style={{ flex: "1 1 160px" }}>Event / discipline
          <select name="eventId" className={styles.fieldControl} defaultValue="">
            <option value="">None</option>
            {eventsForSport.map((e) => <option value={e.id} key={e.id}>{e.eventName}</option>)}
          </select>
        </label>
      </div>
      <label>Type<input name="achievementType" className={styles.fieldControl} maxLength="100" placeholder="e.g. Medal, Record, Cert" /></label>
      <label>Organization<input name="organization" className={styles.fieldControl} maxLength="191" placeholder="e.g. PRISAA" /></label>
      <label>Certificate / photo link<input name="certificateUrl" className={styles.fieldControl} maxLength="500" placeholder="https://... (optional proof)" /></label>
      <label>Description<textarea name="description" className={styles.fieldControl} rows="2" maxLength="2000" /></label>
      <button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Add achievement"}</button>
      {message && <p role="status" className={styles.formHint}>{message}</p>}
    </form>
  );
}

function noteAuthorName(author) {
  if (!author) return "System";
  if (author.coach?.firstName || author.coach?.lastName) {
    return `${author.coach.firstName || ""} ${author.coach.lastName || ""}`.trim();
  }
  return author.username || author.email || "System";
}

function healthReporterName(reporter) {
  if (!reporter) return "System";
  if (reporter.coach?.firstName || reporter.coach?.lastName) {
    return `${reporter.coach.firstName || ""} ${reporter.coach.lastName || ""}`.trim();
  }
  return reporter.username || reporter.email || "System";
}

function HealthForm({ athleteId, onComplete }) {
  const [status, setStatus] = React.useState("healthy");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch(`/api/athletes/${athleteId}/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify({ status, description: description.trim() }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    if (response && response.ok && !result.error) {
      setDescription("");
      setMessage(result.message || "Health status updated.");
      onComplete();
    } else {
      setMessage(result.error || "Could not update health status.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.formStack} style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ flex: "0 0 auto" }}>Set health condition
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={styles.fieldControl}>
            <option value="healthy">Healthy</option>
            <option value="recovering">Recovering</option>
            <option value="sick">Sick</option>
            <option value="injured">Injured</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label style={{ flex: "1 1 200px", minWidth: 0 }}>Notes
          <input name="description" className={styles.fieldControl} type="text" maxLength="2000" placeholder="e.g. recovering well from knee strain" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Update health"}</button>
      </div>
      {message && <p role="status" className={styles.formHint}>{message}</p>}
    </form>
  );
}

function NoteForm({ athleteId, onComplete }) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  async function submit(event) {
    event.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    setMessage("");
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch(`/api/athletes/${athleteId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify({ note: note.trim() }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    if (response && response.ok && !result.error) {
      setNote("");
      setMessage("Coaching note added.");
      onComplete();
    } else {
      setMessage(result.error || "Could not add note.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.formStack} style={{ marginBottom: 14 }}>
      <label>Add an observation about the athlete{String.fromCharCode(39)}s progress</label>
      <textarea className={styles.fieldControl} rows="3" maxLength="5000" placeholder="e.g. Showing consistent gains in sprint endurance; needs focus on starts." value={note} onChange={(e) => setNote(e.target.value)} />
      <button className={styles.primary} disabled={busy || !note.trim()}>{busy ? "Saving..." : "Add note"}</button>
      {message && <p role="status" className={styles.formHint}>{message}</p>}
    </form>
  );
}

function AthletePhotoCard({ athlete }) {
  const [editing, setEditing] = React.useState(false);
  const [pictureUrl, setPictureUrl] = React.useState(athlete.pictureUrl || "");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const initials = `${(athlete.firstName || "?").charAt(0)}${(athlete.lastName || "?").charAt(0)}`.toUpperCase();

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch(`/api/athletes/${athlete.id}/photo`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify({ pictureUrl }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    if (response && response.ok && !result.error) {
      setMessage("Photo saved.");
      setEditing(false);
    } else {
      setMessage(result.error || "Could not save photo.");
    }
    setBusy(false);
  }

  return (
    <div className={styles.detailPanel}>
      <h4>Photo</h4>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {pictureUrl ? (
          <img src={pictureUrl} alt="Athlete" style={{ width: "88px", height: "88px", objectFit: "cover", borderRadius: "12px", border: "1px solid var(--border)" }} />
        ) : (
          <span className={styles.avatar} style={{ width: "88px", height: "88px", fontSize: "32px" }}>{initials}</span>
        )}
        <div>
          <button type="button" className={styles.secondary} onClick={() => { setEditing((c) => !c); setMessage(""); }}>{editing ? "Cancel" : "Edit photo"}</button>
          {!editing && pictureUrl && <p className={styles.formHint} style={{ marginTop: 6 }}>Photo shown on the athlete list and profile.</p>}
        </div>
      </div>
      {editing && (
        <form onSubmit={save} className={styles.formStack} style={{ marginTop: 12 }}>
          <IdPhotoUpload value={pictureUrl} onChange={setPictureUrl} label="Upload or paste photo URL" />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Save photo"}</button>
            {message && <p role="status" className={styles.formSuccess} style={{ margin: 0 }}>{message}</p>}
          </div>
        </form>
      )}
    </div>
  );
}

function EditAthleteForm({ athlete, catalog, isAdmin, onDone }) {
  const [sportId, setSportId] = React.useState(athlete.sportId || "");
  const [schoolId, setSchoolId] = React.useState(athlete.schoolId || "");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const eventsForSport = catalog?.events?.filter((e) => e.sportId === Number(sportId)) || [];
  const birthLocal = athlete.birthdate ? new Date(athlete.birthdate).toISOString().slice(0, 10) : "";

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    body.eventId = body.eventId || "";
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch(`/api/athletes/${athlete.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify(body),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    if (response && response.ok && !result.error) {
      setMessage("Athlete updated.");
      onDone();
    } else {
      setMessage(result.error || "Could not update athlete.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.formStack} style={{ marginBottom: 18 }}>
      <div className={styles.formGrid}>
        <label>First name *<input name="firstName" className={styles.fieldControl} type="text" required maxLength="100" defaultValue={athlete.firstName} /></label>
        <label>Middle name<input name="middleName" className={styles.fieldControl} type="text" maxLength="100" defaultValue={athlete.middleName || ""} /></label>
        <label>Last name *<input name="lastName" className={styles.fieldControl} type="text" required maxLength="100" defaultValue={athlete.lastName} /></label>
        <label>Suffix<input name="suffix" className={styles.fieldControl} type="text" maxLength="20" defaultValue={athlete.suffix || ""} /></label>
        <label>Birthdate<input name="birthdate" className={styles.fieldControl} type="date" defaultValue={birthLocal} /></label>
        <label>Gender<select name="gender" className={styles.fieldControl} defaultValue={athlete.gender || "prefer_not_to_say"}><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
        <label>Sport *<select name="sportId" className={styles.fieldControl} required value={sportId} onChange={(e) => setSportId(e.target.value)}>{catalog?.sports?.map((s) => <option value={s.id} key={s.id}>{s.sportName}</option>)}</select></label>
        <label>Event / discipline<select name="eventId" className={styles.fieldControl} defaultValue={athlete.eventId || ""}><option value="">No event</option>{eventsForSport.map((e) => <option value={e.id} key={e.id}>{e.eventName}</option>)}</select></label>
        {isAdmin && (
          <label>Coach *<select name="coachId" className={styles.fieldControl} required defaultValue={athlete.coachId || ""}>{catalog?.coaches?.map((c) => <option value={c.id} key={c.id}>{c.firstName} {c.lastName} ({c.coachCode})</option>)}</select></label>
        )}
        <label>School<select name="schoolId" className={styles.fieldControl} value={schoolId} onChange={(e) => setSchoolId(e.target.value)}><option value="">Unassigned</option>{catalog?.schools?.map((s) => <option value={s.id} key={s.id}>{s.schoolName}</option>)}</select></label>
<label>Contact number<input name="contactNumber" className={styles.fieldControl} type="text" maxLength="30" defaultValue={athlete.contactNumber || ""} /></label>
        <label>Email<input name="email" className={styles.fieldControl} type="email" maxLength="191" defaultValue={athlete.email || ""} /></label>
        <label>Height (cm)<input name="height" className={styles.fieldControl} type="number" step="0.01" min="1" max="300" defaultValue={athlete.height ?? ""} placeholder="e.g. 170" /></label>
        <label>Weight (kg)<input name="weight" className={styles.fieldControl} type="number" step="0.01" min="1" max="300" defaultValue={athlete.weight ?? ""} placeholder="e.g. 60" /></label>
        <label>Health status<select name="healthStatus" className={styles.fieldControl} defaultValue={athlete.healthStatus || "healthy"}><option value="healthy">Healthy</option><option value="recovering">Recovering</option><option value="sick">Sick</option><option value="injured">Injured</option><option value="inactive">Inactive</option></select></label>
        <label className={styles.fullField}>Health notes<textarea name="healthNotes" className={styles.fieldControl} rows="2" maxLength="2000" defaultValue={athlete.healthNotes || ""} /></label>
        <label className={styles.fullField}>Address<textarea name="address" className={styles.fieldControl} rows="2" maxLength="2000" defaultValue={athlete.address || ""} /></label>
      </div>
      <button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Save changes"}</button>
      {message && <p role="status" className={styles.formSuccess}>{message}</p>}
    </form>
  );
}
