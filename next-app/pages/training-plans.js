import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const isAdmin = session.user.role === "admin";
  let coachId = null;
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    coachId = coach?.id ?? null;
    if (!coachId) return { redirect: { destination: "/dashboard", permanent: false } };
  }
  const [sports, coaches, athletes] = await Promise.all([
    prisma.sport.findMany({ where: { status: "active" }, select: { id: true, sportName: true }, orderBy: { sportName: "asc" } }),
    isAdmin ? prisma.coach.findMany({ where: { status: "active" }, select: { id: true, coachCode: true, firstName: true, lastName: true, sports: { select: { sportId: true } } }, orderBy: { lastName: "asc" } }) : Promise.resolve([]),
    prisma.athlete.findMany({ where: { status: "active", ...(coachId ? { coachId } : {}) }, select: { id: true, athleteCode: true, firstName: true, lastName: true, sportId: true, coachId: true }, orderBy: { lastName: "asc" } }),
  ]);
  return { props: { session, isAdmin, coachId, sports, coaches: JSON.parse(JSON.stringify(coaches)), athletes: JSON.parse(JSON.stringify(athletes)) } };
}

const FREQ_META = { day: "Daily", week: "Weekly", month: "Monthly" };

function fmtDate(value) {
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function ratingChip(rating) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: "rgba(45,212,168,.14)", color: "var(--accent)" }}>{rating}<small style={{ fontSize: 9, opacity: .7 }}>/10</small></span>;
}

export default function TrainingPlans({ session, isAdmin, sports, coaches, athletes }) {
  const [showPlanForm, setShowPlanForm] = React.useState(false);
  const [showAssessmentForm, setShowAssessmentForm] = React.useState(false);
  const [plans, setPlans] = React.useState([]);
  const [assessments, setAssessments] = React.useState([]);
  const [loadingPlans, setLoadingPlans] = React.useState(true);
  const [loadingAssessments, setLoadingAssessments] = React.useState(true);
  const [error, setError] = React.useState("");

  function loadPlans() {
    fetch("/api/training-plans").then((r) => r.json()).then((data) => { setPlans(Array.isArray(data) ? data : []); setLoadingPlans(false); }).catch(() => { setLoadingPlans(false); setError("Could not load training plans."); });
  }
  function loadAssessments() {
    fetch("/api/training-assessments").then((r) => r.json()).then((data) => { setAssessments(Array.isArray(data) ? data : []); setLoadingAssessments(false); }).catch(() => { setLoadingAssessments(false); setError("Could not load assessments."); });
  }
  React.useEffect(() => {
    loadPlans();
    loadAssessments();
  }, []);
  function refresh() {
    setLoadingPlans(true);
    setLoadingAssessments(true);
    loadPlans();
    loadAssessments();
  }

  return (
    <>
      <Head><title>Training | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Training" title="Plans &amp; assessments" active="/training-plans">
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Coaching</p><h2>Training plans</h2></div>
            <div className={styles.actions}>
              <Link className={styles.secondary} href="/training-sessions">Sessions log</Link>
              <button className={styles.primary} onClick={() => setShowPlanForm((c) => !c)}>{showPlanForm ? "Close form" : "New plan"}</button>
            </div>
          </div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>Coaches build a plan for their athletes over a day, week, or month. Coaches and the admin can then record assessments against it to track progress.</p>

          {showPlanForm && (
            <div style={{ marginBottom: 22 }}>
              <CreatePlanForm isAdmin={isAdmin} sports={sports} coaches={coaches} athletes={athletes} onCreated={() => { setShowPlanForm(false); refresh(); }} />
            </div>
          )}

          {loadingPlans ? <p className={styles.empty}>Loading plans...</p> : plans.length === 0 ? (
            <p className={styles.empty}>No training plans yet. Create the first plan to get started.</p>
          ) : (
            <div className={styles.tableWrap}><table>
              <thead><tr><th>Plan</th><th>Frequency</th><th>Sport</th><th>Coach</th><th>Period</th><th>Athletes</th><th>Assessments</th><th>Status</th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.planName}</strong>{p.description ? <small>{p.description}</small> : null}</td>
                    <td>{FREQ_META[p.frequency] || p.frequency}</td>
                    <td>{p.sport?.sportName || "—"}</td>
                    <td>{p.coach ? `${p.coach.firstName} ${p.coach.lastName}` : "—"}</td>
                    <td>{fmtDate(p.startDate)}{p.endDate ? ` – ${fmtDate(p.endDate)}` : ""}</td>
                    <td>{p.athletes?.length ?? 0}</td>
                    <td>{p.assessments?.filter((a) => a.planId === p.id).length ?? 0}</td>
                    <td>{p.status === "completed" ? <span className={`${styles.badge} ${styles.badgeMuted}`}>Completed</span> : <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Progress</p><h2>Training assessments</h2></div>
            <button className={styles.secondary} onClick={() => setShowAssessmentForm((c) => !c)}>{showAssessmentForm ? "Close form" : "Record assessment"}</button>
          </div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>Rate how each athlete is performing in their training. Ratings (1–10) are used to monitor athlete progress and coaching effectiveness.</p>

          {showAssessmentForm && (
            <div style={{ marginBottom: 22 }}>
              <CreateAssessmentForm isAdmin={isAdmin} plans={plans} athletes={athletes} onCreated={() => { setShowAssessmentForm(false); refresh(); }} />
            </div>
          )}

          {loadingAssessments ? <p className={styles.empty}>Loading assessments...</p> : assessments.length === 0 ? (
            <p className={styles.empty}>No assessments recorded yet.</p>
          ) : (
            <div className={styles.tableWrap}><table>
              <thead><tr><th>Athlete</th><th>Plan</th><th>Rating</th><th>Comments</th><th>Date</th><th>Recorded by</th></tr></thead>
              <tbody>
                {assessments.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.athlete?.firstName} {a.athlete?.lastName}</strong><small>{a.athlete?.sport?.sportName || "—"}</small></td>
                    <td>{a.plan?.planName || "—"}</td>
                    <td>{ratingChip(a.rating)}</td>
                    <td>{a.comments || "—"}</td>
                    <td>{fmtDate(a.assessmentDate)}</td>
                    <td>{a.assessor?.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
      </AppShell>
    </>
  );
}

function CreatePlanForm({ isAdmin, sports, coaches, athletes, onCreated }) {
  const [sportId, setSportId] = React.useState(sports[0]?.id || "");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [selectedAthletes, setSelectedAthletes] = React.useState([]);

  const coachOptions = coaches.filter((c) => !c.sports?.length || c.sports.some((s) => s.sportId === Number(sportId)));
  const athleteOptions = athletes.filter((a) => !sportId || a.sportId === Number(sportId));

  function toggleAthlete(id) {
    setSelectedAthletes((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = {
      planName: form.get("planName"),
      description: form.get("description"),
      sportId: Number(form.get("sportId")),
      coachId: Number(form.get("coachId") || (isAdmin ? 0 : athletes[0]?.coachId)),
      frequency: form.get("frequency"),
      startDate: form.get("startDate"),
      endDate: form.get("endDate") || null,
      status: form.get("status"),
      athleteIds: selectedAthletes,
    };
    if (body.coachId === 0) body.coachId = null;
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/training-plans", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { event.currentTarget.reset(); setSelectedAthletes([]); setMessage(""); onCreated(); return; }
      setMessage(result.error || "Could not create the plan.");
    } catch (e) { setMessage("Unable to reach the server."); }
    setBusy(false);
  }

  return (
    <>
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Create</p><h2>New training plan</h2></div></div>
      <form onSubmit={submit} className={styles.formGrid}>
        <label className={styles.fullField}>Plan name *<input name="planName" required maxLength="191" placeholder="e.g. Pre-season conditioning month" /></label>
        <label>Sport *<select name="sportId" value={sportId} required onChange={(e) => setSportId(e.target.value)}>{sports.map((s) => <option key={s.id} value={s.id}>{s.sportName}</option>)}</select></label>
        {isAdmin && <label>Coach *<select name="coachId" required><option value="">Select a coach</option>{coachOptions.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName}{c.coachCode ? ` (${c.coachCode})` : ""}</option>)}</select></label>}
        <label>Frequency *<select name="frequency" defaultValue="day"><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></label>
        <label>Start date *<input name="startDate" type="date" required /></label>
        <label>End date (optional)<input name="endDate" type="date" /></label>
        {isAdmin && <label>Status<select name="status" defaultValue="active"><option value="active">Active</option><option value="completed">Completed</option></select></label>}
        <label className={styles.fullField}>Description<textarea name="description" rows="2" maxLength="2000" placeholder="Goals and focus of the plan" /></label>

        <div className={styles.fullField} style={{ borderTop: "1px solid rgba(26, 92, 74, .5)", paddingTop: 16 }}>
          <p className={styles.eyebrow}>Athletes on this plan ({selectedAthletes.length})</p>
          {athleteOptions.length ? (
            <div className={styles.checkboxList}>
              {athleteOptions.map((a) => {
                const done = selectedAthletes.includes(a.id);
                return (
                  <label key={a.id}>
                    <input type="checkbox" checked={done} disabled={busy} onChange={() => toggleAthlete(a.id)} />
                    <span>{a.lastName}, {a.firstName} ({a.athleteCode})</span>
                  </label>
                );
              })}
            </div>
          ) : <p className={styles.empty}>No athletes available for this sport.</p>}
        </div>

        <div className={styles.formActions}>
          <button className={styles.primary} disabled={busy}>{busy ? "Creating..." : "Create plan"}</button>
        </div>
        {message && <p role="status" className={`${styles.fullField} ${styles.formError}`}>{message}</p>}
      </form>
    </>
  );
}

function CreateAssessmentForm({ isAdmin, plans, athletes, onCreated }) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = {
      athleteId: Number(form.get("athleteId")),
      planId: Number(form.get("planId") || 0) || null,
      rating: Number(form.get("rating")),
      comments: form.get("comments"),
    };
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/training-assessments", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { event.currentTarget.reset(); setMessage(""); onCreated(); return; }
      setMessage(result.error || "Could not record the assessment.");
    } catch (e) { setMessage("Unable to reach the server."); }
    setBusy(false);
  }

  return (
    <>
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Record</p><h2>Assess an athlete</h2></div></div>
      <form onSubmit={submit} className={styles.formGrid}>
        <label>Athlete *<select name="athleteId" required>{athletes.map((a) => <option key={a.id} value={a.id}>{a.lastName}, {a.firstName} ({a.athleteCode})</option>)}</select></label>
        <label>Training plan<select name="planId"><option value="">No plan</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.planName}</option>)}</select></label>
        <label>Rating (1–10) *<select name="rating" required defaultValue="5"><option value="1">1 – Very poor</option><option value="2">2 – Poor</option><option value="3">3 – Below average</option><option value="4">4 – Fair</option><option value="5">5 – Average</option><option value="6">6 – Above average</option><option value="7">7 – Good</option><option value="8">8 – Very good</option><option value="9">9 – Excellent</option><option value="10">10 – Perfect</option></select></label>
        <label className={styles.fullField}>Comments<textarea name="comments" rows="2" maxLength="2000" placeholder="Observations about the athlete's effort, technique, and progress" /></label>
        <div className={styles.formActions}>
          <button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Record assessment"}</button>
        </div>
        {message && <p role="status" className={`${styles.fullField} ${styles.formError}`}>{message}</p>}
      </form>
    </>
  );
}