import Head from "next/head";
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
  if (!isAdmin) return { redirect: { destination: "/dashboard", permanent: false } };
  const [sports, coaches] = await Promise.all([
    prisma.sport.findMany({ where: { status: "active" }, select: { id: true, sportName: true }, orderBy: { sportName: "asc" } }),
    prisma.coach.findMany({ where: { status: "active" }, select: { id: true, coachCode: true, firstName: true, lastName: true, sports: { select: { sportId: true } } }, orderBy: { lastName: "asc" } }),
  ]);
  const athletes = await prisma.athlete.findMany({ where: { status: "active" }, select: { id: true, athleteCode: true, firstName: true, lastName: true, sportId: true }, orderBy: { lastName: "asc" } });
  return { props: { session, sports, coaches: JSON.parse(JSON.stringify(coaches)), athletes: JSON.parse(JSON.stringify(athletes)) } };
}

const TYPE_META = {
  regular: { label: "Regular", color: "#34d399" },
  conditioning: { label: "Conditioning", color: "#fbbf24" },
  technical: { label: "Technical", color: "#60a5fa" },
  tactical: { label: "Tactical", color: "#c084fc" },
  recovery: { label: "Recovery", color: "#22d3ee" },
  competition_simulation: { label: "Competition sim", color: "#f87171" },
  tryout: { label: "Tryout", color: "#f472b6" },
};
const CATEGORY_META = {
  warmup: "Warm-up", mobility: "Mobility", strength: "Strength", power: "Power", speed_agility: "Speed/Agility", endurance: "Endurance", skill_technique: "Skill/Technique", tactical: "Tactical", cooldown: "Cool-down", recovery: "Recovery",
};

function typeChip(type) {
  const meta = TYPE_META[type] || { label: type, color: "#9db6c7" };
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", background: `color-mix(in srgb, ${meta.color} 18%, transparent)`, color: meta.color, whiteSpace: "nowrap" }}>{meta.label}</span>;
}

function fmtDate(value) {
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function fmtTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const emptyExercise = { exerciseName: "", category: "skill_technique", targetSets: "", targetReps: "", targetDuration: "", targetLoad: "", targetDistance: "", equipment: "", description: "" };

export default function TrainingSessions({ session, sports, coaches, athletes }) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [sessions, setSessions] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [filter, setFilter] = React.useState("");

  React.useEffect(() => {
    fetch("/api/training-sessions").then((r) => r.json()).then((data) => { setSessions(Array.isArray(data) ? data : []); setLoading(false); }).catch(() => { setLoading(false); setError("Could not load training sessions."); });
  }, []);

  const filtered = filter ? sessions.filter((s) => s.sport.sportName === filter) : sessions;

  return (
    <>
      <Head><title>Training sessions | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin eyebrow="Training" title="Training sessions" active="/training-sessions">
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Training</p><h2>Training sessions</h2></div>
            <button className={styles.primary} onClick={() => setCreateOpen((c) => !c)}>{createOpen ? "Close form" : "New session"}</button>
          </div>

          {createOpen && (
            <div className={styles.panel} style={{ marginBottom: 22, marginTop: 0 }}>
              <CreateSession sports={sports} coaches={coaches} athletes={athletes} onCreated={(created) => { setSessions((current) => [created, ...current]); setCreateOpen(false); }} />
            </div>
          )}

          {sports.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              <button className={styles.expandBtn} onClick={() => setFilter("")} style={{ background: !filter ? "rgba(45,212,168,.16)" : undefined, color: !filter ? "var(--accent)" : undefined }}>All</button>
              {sports.map((sport) => <button key={sport.id} className={styles.expandBtn} onClick={() => setFilter(sport.sportName)} style={{ background: filter === sport.sportName ? "rgba(45,212,168,.16)" : undefined, color: filter === sport.sportName ? "var(--accent)" : undefined }}>{sport.sportName}</button>)}
            </div>
          )}

          {loading ? <p className={styles.empty}>Loading sessions...</p> : error ? <p className={styles.empty}>{error}</p> : filtered.length === 0 ? (
            <p className={styles.empty}>No training sessions yet. Create the first one to get started.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Sport</th>
                    <th>Coach</th>
                    <th>Time</th>
                    <th>Venue</th>
                    <th>Exercises</th>
                    <th>Athletes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tr) => (
                    <tr key={tr.id}>
                      <td><strong>{fmtDate(tr.sessionDate)}</strong></td>
                      <td>{typeChip(tr.sessionType)}</td>
                      <td>{tr.sport?.sportName || "—"}</td>
                      <td>{tr.coach ? `${tr.coach.lastName}, ${tr.coach.firstName}` : "—"}</td>
                      <td>{fmtTime(tr.startTime)}{tr.endTime ? ` – ${fmtTime(tr.endTime)}` : ""}</td>
                      <td>{tr.venue || "—"}</td>
                      <td>{tr.exercises?.length ?? 0}</td>
                      <td>{tr.attendances?.length ?? 0}</td>
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

function CreateSession({ sports, coaches, athletes, onCreated }) {
  const router = useRouter();
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sportId, setSportId] = React.useState(sports[0]?.id || "");
  const [selectedAthletes, setSelectedAthletes] = React.useState([]);
  const [exercises, setExercises] = React.useState([]);

  const coachOptions = coaches.filter((c) => !c.sports?.length || c.sports.some((s) => s.sportId === Number(sportId)));

  function toggleAthlete(id) {
    setSelectedAthletes((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }
  function addExercise() {
    setExercises((current) => [...current, { ...emptyExercise, key: current.length + 1 }]);
  }
  function updateExercise(key, field, value) {
    setExercises((current) => current.map((ex) => (ex.key === key ? { ...ex, [field]: value } : ex)));
  }
  function removeExercise(key) {
    setExercises((current) => current.filter((ex) => ex.key !== key));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = {
      sessionDate: form.get("sessionDate"),
      sessionType: form.get("sessionType"),
      sportId: Number(form.get("sportId")),
      coachId: Number(form.get("coachId")),
      venue: form.get("venue"),
      notes: form.get("notes"),
      startTime: form.get("startTime"),
      endTime: form.get("endTime"),
      athleteIds: selectedAthletes,
      exercises: exercises.map(({ key, ...ex }) => ex),
    };
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/training-sessions", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { event.currentTarget.reset(); setExercises([]); setSelectedAthletes([]); onCreated(result); return; }
      setMessage(result.error || "Could not create session.");
    } catch (err) { setMessage("Unable to reach the server."); }
    setBusy(false);
  }

  return (
    <>
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Create</p><h2>New training session</h2></div></div>
      <p className={styles.formHint} style={{ marginTop: 0 }}>Record a planned or held training session, its exercises, and the athletes expected to attend.</p>
      <form onSubmit={submit} className={styles.formGrid}>
        <label>Date *<input name="sessionDate" type="date" required /></label>
        <label>Type *<select name="sessionType" defaultValue="regular">{Object.keys(TYPE_META).map((k) => <option key={k} value={k}>{TYPE_META[k].label}</option>)}</select></label>
        <label>Start time<input name="startTime" type="time" /></label>
        <label>End time<input name="endTime" type="time" /></label>
        <label>Sport *<select name="sportId" value={sportId} required onChange={(e) => setSportId(e.target.value)}>{sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.sportName}</option>)}</select></label>
        <label>Coach *<select name="coachId" required><option value="">Select a coach</option>{coachOptions.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName}{c.coachCode ? ` (${c.coachCode})` : ""}</option>)}</select></label>
        <label className={styles.fullField}>Venue<input name="venue" maxLength="191" placeholder="e.g. City Sports Complex Field B" /></label>
        <label className={styles.fullField}>Notes<textarea name="notes" rows="2" maxLength="2000" /></label>

        <div className={styles.fullField} style={{ borderTop: "1px solid rgba(26, 92, 74, .5)", paddingTop: 16 }}>
          <p className={styles.eyebrow}>Athletes expected ({selectedAthletes.length})</p>
          <div className={styles.checkboxList}>
            {athletes.map((a) => {
              const done = selectedAthletes.includes(a.id);
              return (
                <label key={a.id}>
                  <input type="checkbox" checked={done} disabled={busy} onChange={() => toggleAthlete(a.id)} />
                  <span>{a.lastName}, {a.firstName} ({a.athleteCode})</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className={styles.fullField} style={{ borderTop: "1px solid rgba(26, 92, 74, .5)", paddingTop: 16 }}>
          <p className={styles.eyebrow}>Exercises ({exercises.length})</p>
          {exercises.map((ex) => (
            <div key={ex.key} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", background: "rgba(6, 38, 30, .4)", marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input name={`exerciseName-${ex.key}`} className={styles.fieldControl} placeholder="Exercise name *" value={ex.exerciseName} onChange={(e) => updateExercise(ex.key, "exerciseName", e.target.value)} required />
                <select className={styles.fieldControl} value={ex.category} onChange={(e) => updateExercise(ex.key, "category", e.target.value)}>{Object.keys(CATEGORY_META).map((k) => <option key={k} value={k}>{CATEGORY_META[k]}</option>)}</select>
                <button type="button" className={`${styles.danger} ${styles.btnSm}`} onClick={() => removeExercise(ex.key)}>Remove</button>
              </div>
              <div className={styles.formGrid} style={{ marginTop: 0 }}>
                <label>Sets<input className={styles.fieldControl} type="number" min="0" value={ex.targetSets} onChange={(e) => updateExercise(ex.key, "targetSets", e.target.value)} /></label>
                <label>Reps<input className={styles.fieldControl} type="number" min="0" value={ex.targetReps} onChange={(e) => updateExercise(ex.key, "targetReps", e.target.value)} /></label>
                <label>Duration (sec)<input className={styles.fieldControl} type="number" min="0" value={ex.targetDuration} onChange={(e) => updateExercise(ex.key, "targetDuration", e.target.value)} /></label>
                <label>Load (kg)<input className={styles.fieldControl} type="number" min="0" step="any" value={ex.targetLoad} onChange={(e) => updateExercise(ex.key, "targetLoad", e.target.value)} /></label>
                <label>Distance (m)<input className={styles.fieldControl} type="number" min="0" step="any" value={ex.targetDistance} onChange={(e) => updateExercise(ex.key, "targetDistance", e.target.value)} /></label>
                <label>Equipment<input className={styles.fieldControl} value={ex.equipment} onChange={(e) => updateExercise(ex.key, "equipment", e.target.value)} /></label>
              </div>
              <input className={styles.fieldControl} placeholder="Notes" value={ex.description} onChange={(e) => updateExercise(ex.key, "description", e.target.value)} />
            </div>
          ))}
          <button type="button" className={styles.secondary} onClick={addExercise}>+ Add exercise</button>
        </div>

        <div className={styles.formActions}>
          <button className={styles.primary} disabled={busy}>{busy ? "Creating..." : "Create session"}</button>
        </div>
        {message && <p role="status" className={`${styles.fullField} ${message.includes("created") ? styles.formSuccess : styles.formError}`}>{message}</p>}
      </form>
    </>
  );
}