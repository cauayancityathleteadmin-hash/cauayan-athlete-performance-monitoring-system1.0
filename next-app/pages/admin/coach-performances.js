import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session || session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };
  const coaches = await prisma.coach.findMany({ where: { status: "active" }, select: { id: true, coachCode: true, firstName: true, lastName: true }, orderBy: { lastName: "asc" } });
  return { props: { session, coaches: JSON.parse(JSON.stringify(coaches)) } };
}

const CRITERIA = [
  { key: "sessionPlanning", label: "Session planning" },
  { key: "exerciseSelection", label: "Exercise selection" },
  { key: "technicalInstruction", label: "Technical instruction" },
  { key: "athleteDevelopment", label: "Athlete development" },
  { key: "communication", label: "Communication" },
  { key: "safetyCompliance", label: "Safety compliance" },
  { key: "trainingImplementation", label: "Training implementation" },
];

function fmtDate(value) {
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function round(v) {
  return Math.round(Number(v || 0) * 10) / 10;
}

function ratingColor(v) {
  const n = Number(v || 0);
  if (n >= 8) return "var(--success)";
  if (n >= 6) return "var(--warning)";
  return "var(--danger)";
}

function CoachTrend({ points }) {
  const w = 360;
  const h = 110;
  const padL = 8;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  if (!points || points.length < 2) return <p className={styles.empty}>Not enough evaluations to plot a trend yet.</p>;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const step = plotW / (points.length - 1 || 1);
  const coords = points.map((p, i) => ({ x: padL + i * step, y: padT + plotH - ((p.value - min) / range) * plotH, p }));
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${path} L${coords[coords.length - 1].x.toFixed(1)},${h - padB} L${coords[0].x.toFixed(1)},${h - padB} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Coach evaluation trend chart">
      <defs>
        <linearGradient id="ctrend2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(45, 212, 168, 0.35)" />
          <stop offset="100%" stopColor="rgba(45, 212, 168, 0.02)" />
        </linearGradient>
      </defs>
      {[0.1, 0.5, 0.9].map((fy) => (
        <line key={fy} x1={padL} x2={w - padR} y1={padT + plotH * fy} y2={padT + plotH * fy} stroke="rgba(127, 199, 175, 0.12)" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#ctrend2)" />
      <path d={path} fill="none" stroke="#2dd4a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r="3" fill="#041f18" stroke="#2dd4a8" strokeWidth="2" />
          <text x={c.x} y={h - 7} textAnchor="middle" fontSize="8" fill="var(--muted)">{c.p.when}</text>
        </g>
      ))}
    </svg>
  );
}

function CoachProgressPanel({ coaches, evals }) {
  const [coachId, setCoachId] = React.useState("");
  const list = (coaches || []).filter((c) => !coachId || c.id === Number(coachId));
  if (!evals || evals.length === 0) {
    return null;
  }
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div><p className={styles.eyebrow}>Progress</p><h2>Coach progress</h2></div>
        <select className={styles.fieldControl} style={{ width: 220 }} value={coachId} onChange={(e) => setCoachId(e.target.value)}>
          <option value="">All coaches</option>
          {(coaches || []).map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName}</option>)}
        </select>
      </div>
      <p className={styles.formHint} style={{ marginTop: 0 }}>Tracks each coach&apos;s evaluation scores over time to spot improvement or decline.</p>
      {list.map((coach) => {
        const coachEvals = evals
          .filter((e) => e.coach?.id === coach.id)
          .sort((a, b) => new Date(a.periodEnd) - new Date(b.periodEnd));
        if (coachEvals.length === 0) return <p key={coach.id} className={styles.empty}>No evaluations for {coach.firstName} {coach.lastName} yet.</p>;
        const points = coachEvals.map((e) => ({ when: fmtDate(e.periodEnd), value: Number(e.overallScore) }));
        const avgOverall = coachEvals.reduce((s, e) => s + Number(e.overallScore), 0) / coachEvals.length;
        const first = Number(coachEvals[0].overallScore);
        const last = Number(coachEvals[coachEvals.length - 1].overallScore);
        const delta = last - first;
        const trendText = coachEvals.length < 2 ? "Need 2+ evaluations to show a trend" : delta > 0.1 ? `Improving (+${round(delta)})` : delta < -0.1 ? `Declining (${round(delta)})` : "Holding steady";
        const trendColor = delta > 0.1 ? "var(--success)" : delta < -0.1 ? "var(--danger)" : "var(--muted)";
        return (
          <div key={coach.id} className={styles.detailPanel} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
              <strong style={{ fontSize: 15 }}>{coach.firstName} {coach.lastName} <small style={{ color: "var(--muted)" }}>({coach.coachCode})</small></strong>
              <small><span style={{ color: ratingColor(avgOverall), fontWeight: 700 }}>{round(avgOverall)}/10</span> avg · {coachEvals.length} evaluation{coachEvals.length === 1 ? "" : "s"} · <span style={{ color: trendColor, fontWeight: 700 }}>{trendText}</span></small>
            </div>
            <div style={{ marginTop: 12 }}>
              <CoachTrend points={points} />
            </div>
            <div style={{ marginTop: 12 }}>
              <h4 style={{ fontSize: 13, margin: "0 0 6px", color: "var(--accent)" }}>Average per criterion</h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {CRITERIA.map((c) => {
                  const avg = coachEvals.reduce((s, e) => s + Number(e[c.key] || 0), 0) / coachEvals.length;
                  return (
                    <span key={c.key} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "6px 10px", borderRadius: 10, background: "rgba(6,38,30,.35)", border: "1px solid var(--border)" }}>
                      <strong style={{ color: ratingColor(avg), fontSize: 14 }}>{round(avg)}</strong>
                      <small style={{ color: "var(--muted)", fontSize: 10, textAlign: "center" }}>{c.label}</small>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default function CoachPerformances({ session, coaches }) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [evals, setEvals] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(() => {
    fetch("/api/coach-performances").then((r) => r.json()).then((data) => { setEvals(Array.isArray(data) ? data : []); setLoading(false); }).catch(() => { setLoading(false); setError("Could not load evaluations."); });
  }, []);
  React.useEffect(() => { load(); }, [load]);

  return (
    <>
      <Head><title>Coach evaluations | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin eyebrow="Administration" title="Coach Evaluations" active="/admin/coach-performances">
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Quality assurance</p><h2>Coach evaluations</h2></div>
            <button className={styles.primary} onClick={() => setCreateOpen((c) => !c)}>{createOpen ? "Close form" : "New evaluation"}</button>
          </div>

          {coaches.length === 0 && <p className={styles.empty}>No active coaches to evaluate.</p>}

          {createOpen && coaches.length > 0 && (
            <div className={styles.panel} style={{ marginBottom: 22, marginTop: 0 }}>
              <CreatePerformance coaches={coaches} onCreated={(ev) => { setEvals((current) => [ev, ...current]); setCreateOpen(false); }} />
            </div>
          )}

          {loading ? <p className={styles.empty}>Loading evaluations...</p> : error ? <p className={styles.empty}>{error}</p> : evals.length === 0 ? (
            <p className={styles.empty}>No evaluations recorded yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Coach</th>
                    <th>Period</th>
                    <th>Session planning</th>
                    <th>Exercise selection</th>
                    <th>Technical</th>
                    <th>Athlete dev</th>
                    <th>Communication</th>
                    <th>Safety</th>
                    <th>Training impl</th>
                    <th>Overall</th>
                    <th>Evaluator</th>
                  </tr>
                </thead>
                <tbody>
                  {evals.map((e) => (
                    <tr key={e.id}>
                      <td><strong>{e.coach?.lastName}, {e.coach?.firstName}</strong><small>{e.coach?.coachCode || "—"}</small></td>
                      <td>{fmtDate(e.periodStart)} – {fmtDate(e.periodEnd)}</td>
                      <td>{e.sessionPlanning}</td>
                      <td>{e.exerciseSelection}</td>
                      <td>{e.technicalInstruction}</td>
                      <td>{e.athleteDevelopment}</td>
                      <td>{e.communication}</td>
                      <td>{e.safetyCompliance}</td>
                      <td>{e.trainingImplementation}</td>
                      <td><strong style={{ color: ratingColor(e.overallScore) }}>{round(e.overallScore)}</strong></td>
                      <td>{e.evaluator?.username || e.evaluator?.email || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <CoachProgressPanel coaches={coaches} evals={evals} />
      </AppShell>
    </>
  );
}

function CreatePerformance({ coaches, onCreated }) {
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [scores, setScores] = React.useState({ sessionPlanning: "0", exerciseSelection: "0", technicalInstruction: "0", athleteDevelopment: "0", communication: "0", safetyCompliance: "0", trainingImplementation: "0" });

  function setScore(key, value) {
    setScores((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = {
      coachId: Number(form.get("coachId")),
      periodStart: form.get("periodStart"),
      periodEnd: form.get("periodEnd"),
      ...scores,
      strengths: form.get("strengths"),
      areasForImprovement: form.get("areasForImprovement"),
      actionPlan: form.get("actionPlan"),
    };
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/coach-performances", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { event.currentTarget.reset(); onCreated(result); return; }
      setMessage(result.error || "Could not save evaluation.");
    } catch (err) { setMessage("Unable to reach the server."); }
    setBusy(false);
  }

  return (
    <>
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Create</p><h2>New coach evaluation</h2></div></div>
      <p className={styles.formHint} style={{ marginTop: 0 }}>Rate each criterion from 0 (poor) to 10 (perfect). The overall score is averaged automatically.</p>
      <form onSubmit={submit} className={styles.formGrid}>
        <label>Coach *<select name="coachId" required><option value="">Select a coach</option>{coaches.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName}{c.coachCode ? ` (${c.coachCode})` : ""}</option>)}</select></label>
        <label>Period start *<input name="periodStart" type="date" required /></label>
        <label>Period end *<input name="periodEnd" type="date" required /></label>
        <div className={styles.fullField} style={{ borderTop: "1px solid rgba(26, 92, 74, .5)", paddingTop: 16 }}>
          <p className={styles.eyebrow}>Scores</p>
          <div className={styles.checkboxList} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {CRITERIA.map((c) => (
              <label key={c.key} style={{ flexDirection: "column", alignItems: "flex-start" }}>
                {c.label}
                <select className={styles.fieldControl} value={scores[c.key]} onChange={(e) => setScore(c.key, e.target.value)}>
                  <option value="0">0 — Not observed</option>
                  <option value="1">1 — Very poor</option>
                  <option value="2">2 — Poor</option>
                  <option value="3">3 — Below average</option>
                  <option value="4">4 — Fair</option>
                  <option value="5">5 — Average</option>
                  <option value="6">6 — Above average</option>
                  <option value="7">7 — Good</option>
                  <option value="8">8 — Very good</option>
                  <option value="9">9 — Excellent</option>
                  <option value="10">10 — Perfect</option>
                </select>
              </label>
            ))}
          </div>
        </div>
        <label className={styles.fullField}>Strengths<textarea name="strengths" rows="2" maxLength="2000" /></label>
        <label className={styles.fullField}>Areas for improvement<textarea name="areasForImprovement" rows="2" maxLength="2000" /></label>
        <label className={styles.fullField}>Action plan<textarea name="actionPlan" rows="2" maxLength="2000" /></label>
        <div className={styles.formActions}><button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Save evaluation"}</button></div>
        {message && <p role="status" className={`${styles.fullField} ${message.includes("Could") ? styles.formError : styles.formSuccess}`}>{message}</p>}
      </form>
    </>
  );
}
