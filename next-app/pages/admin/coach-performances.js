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
  if (n >= 4) return "var(--success)";
  if (n >= 3) return "var(--warning)";
  return "var(--danger)";
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
                      <td><strong style={{ color: ratingColor(e.overallScore) }}>{round(e.overallScore)}</strong></td>
                      <td>{e.evaluator?.username || e.evaluator?.email || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </AppShell>
    </>
  );
}

function CreatePerformance({ coaches, onCreated }) {
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [scores, setScores] = React.useState({ sessionPlanning: "0", exerciseSelection: "0", technicalInstruction: "0", athleteDevelopment: "0", communication: "0", safetyCompliance: "0" });

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
      <p className={styles.formHint} style={{ marginTop: 0 }}>Rate each criterion from 0 (poor) to 5 (excellent). The overall score is averaged automatically.</p>
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
                  <option value="1">1 — Poor</option>
                  <option value="2">2 — Fair</option>
                  <option value="3">3 — Good</option>
                  <option value="4">4 — Very good</option>
                  <option value="5">5 — Excellent</option>
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
