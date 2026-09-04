import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const id = Number(context.params?.id);
  if (!Number.isSafeInteger(id) || id < 1) return { redirect: { destination: "/training-plans", permanent: false } };
  const isAdmin = session.user.role === "admin";

  const plan = await prisma.trainingPlan.findUnique({
    where: { id },
    include: { sport: { select: { id: true, sportName: true } }, coach: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!plan) return { redirect: { destination: "/training-plans", permanent: false } };
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || plan.coachId !== coach.id) return { redirect: { destination: "/training-plans", permanent: false } };
  }

  const planAthletes = await prisma.trainingPlanAthlete.findMany({
    where: { planId: id },
    select: { athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true, sportId: true, healthStatus: true, status: true } } },
    orderBy: { athlete: { lastName: "asc" } },
  });

  return {
    props: {
      session,
      isAdmin,
      plan: {
        ...plan,
        startDate: plan.startDate.toISOString(),
        endDate: plan.endDate ? plan.endDate.toISOString() : null,
      },
      athletes: JSON.parse(JSON.stringify(planAthletes.map((a) => a.athlete))),
    },
  };
}

const FITNESS_META = {
  endurance: "Endurance",
  strength: "Strength",
  power: "Power",
  speed_agility: "Speed / Agility",
  skill_technique: "Skill / Technique",
  mobility: "Mobility",
  recovery: "Recovery",
};

const UNITS_BY_FITNESS = {
  endurance: ["km", "m", "miles", "min", "hr"],
  strength: ["kg", "lb", "reps", "sets"],
  power: ["w", "kg", "lb", "reps"],
  speed_agility: ["sec", "m", "reps"],
  skill_technique: ["reps", "attempts", "rating"],
  mobility: ["min", "sec", "deg", "reps"],
  recovery: ["min", "hr", "sessions"],
};

const LOG_STATUS = {
  planned: { label: "Planned", cls: "badgeMuted" },
  done: { label: "Done", cls: "badgeActive" },
  partial: { label: "Partial", cls: "badgePending" },
  missed: { label: "Missed", cls: "badgeRejected" },
};

function fmtDate(value) {
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function PlanDetail({ session, isAdmin, plan, athletes }) {
  const router = useRouter();
  const [activities, setActivities] = React.useState([]);
  const [logs, setLogs] = React.useState([]);
  const [notes, setNotes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [showAddActivity, setShowAddActivity] = React.useState(false);
  const [showBulkAssess, setShowBulkAssess] = React.useState(true);
  const [message, setMessage] = React.useState(null);

  const loadActivities = React.useCallback((show) => {
    fetch(`/api/plan-activities?planId=${plan.id}`).then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) { setActivities(data); setError(""); show && setLoading(false); }
      else { setError(data.error || "Could not load activities."); show && setLoading(false); }
    }).catch(() => { setError("Could not load activities."); show && setLoading(false); });
  }, [plan.id]);

  const loadLogs = React.useCallback((show) => {
    fetch(`/api/plan-activity-logs?planId=${plan.id}`).then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) { setLogs(data); setError(""); show && setLoading(false); }
      else setError(data.error || "Could not load progress.");
    }).catch(() => { setError("Could not load progress."); });
  }, [plan.id]);

  const loadNotes = React.useCallback((show) => {
    fetch(`/api/training-notes?planId=${plan.id}`).then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) { setNotes(data); setError(""); show && setLoading(false); }
      else setError(data.error || "Could not load notes.");
    }).catch(() => { setError("Could not load notes."); });
  }, [plan.id]);

  React.useEffect(() => {
    loadActivities(true);
    loadLogs(false);
    loadNotes(false);
  }, [loadActivities, loadLogs, loadNotes]);

  function refresh() {
    loadActivities(true);
    loadLogs(true);
    loadNotes(true);
  }

  function logCountFor(activityId, athleteId) {
    return logs.filter((l) => l.activityId === activityId && l.athleteId === athleteId).length;
  }

  function createLog(activityId, athleteId, form) {
    const body = {
      activityId,
      athleteId,
      status: form.get(`status-${activityId}-${athleteId}`),
      quantityDone: form.get(`qty-${activityId}-${athleteId}`) || null,
      notes: form.get(`note-${activityId}-${athleteId}`) || null,
      performedAt: form.get(`date-${activityId}-${athleteId}`) || null,
    };
    fetch("/api/csrf").then((r) => r.json()).then((csrf) =>
      fetch("/api/plan-activity-logs", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) })
        .then((r) => r.json()).then((res) => { if (res.error) setMessage({ kind: "error", text: res.error }); else { setMessage({ kind: "success", text: "Progress saved." }); refresh(); } })
        .catch(() => setMessage({ kind: "error", text: "Could not save progress." }))
    );
  }

  function removeActivity(activityId) {
    if (!window.confirm("Remove this activity from the plan?")) return;
    fetch("/api/csrf").then((r) => r.json()).then((csrf) =>
      fetch("/api/plan-activities", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ planId: plan.id, action: "delete", activityId }) })
        .then((r) => r.json()).then((res) => { if (res.error) setMessage({ kind: "error", text: res.error }); else { setMessage({ kind: "success", text: res.message }); refresh(); } })
        .catch(() => setMessage({ kind: "error", text: "Could not remove activity." }))
    );
  }

  function updateActivity(activityId, payload) {
    fetch("/api/csrf").then((r) => r.json()).then((csrf) =>
      fetch("/api/plan-activities", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ planId: plan.id, action: "update", activityId, ...payload }) })
        .then((r) => r.json()).then((res) => { if (res.error) setMessage({ kind: "error", text: res.error }); else { setMessage({ kind: "success", text: "Activity updated." }); refresh(); } })
        .catch(() => setMessage({ kind: "error", text: "Could not update activity." }))
    );
  }

  function postNote(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const bodyText = form.get("body");
    fetch("/api/csrf").then((r) => r.json()).then((csrf) =>
      fetch("/api/training-notes", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ planId: plan.id, body: bodyText }) })
        .then((r) => r.json()).then((res) => { if (res.error) setMessage({ kind: "error", text: res.error }); else { setMessage({ kind: "success", text: "Comment posted." }); event.currentTarget.reset(); refresh(); } })
        .catch(() => setMessage({ kind: "error", text: "Could not post comment." }))
    );
  }

  function deleteNote(noteId) {
    if (!window.confirm("Remove this comment?")) return;
    fetch("/api/csrf").then((r) => r.json()).then((csrf) =>
      fetch("/api/training-notes", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ planId: plan.id, action: "delete", noteId }) })
        .then((r) => r.json()).then((res) => { if (res.error) setMessage({ kind: "error", text: res.error }); else { setMessage({ kind: "success", text: res.message }); refresh(); } })
        .catch(() => setMessage({ kind: "error", text: "Could not remove comment." }))
    );
  }

  return (
    <>
      <Head><title>{plan.planName} | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Training" title={plan.planName} active="/training-plans">
        <div className={styles.pageActions}>
          <span className={styles.eyebrow}>{plan.sport?.sportName || "—"} | {isAdmin ? `Run by ${plan.coach?.firstName || ""} ${plan.coach?.lastName || ""}` : "Your plan"}</span>
          <button className={styles.secondary} onClick={() => router.push("/training-plans")}>Back to plans</button>
        </div>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Plan</p>
              <h2>{plan.planName}</h2>
              <p style={{ color: "var(--muted)" }}>{fmtDate(plan.startDate)}{plan.endDate ? ` – ${fmtDate(plan.endDate)}` : ""}</p>
            </div>
            <span className={styles.badge}>{plan.status === "completed" ? "Completed" : "Active"}</span>
          </div>
          {plan.description ? <p>{plan.description}</p> : null}
        </section>

        {message && (
          <p role="status" style={{ margin: "0 0 16px", padding: "12px 14px", borderRadius: "8px", border: `1px solid ${message.kind === "error" ? "var(--danger)" : "var(--accent)"}`, background: `rgba(${message.kind === "error" ? "248,113,113" : "45,212,168"}, .14)`, color: message.kind === "error" ? "var(--danger)" : "var(--foreground)" }}>
            {message.text}
          </p>
        )}

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Training plan &amp; assessment</p><h2>Planned activities</h2></div>
          </div>

          {loading ? <p className={styles.empty}>Loading plan details...</p> : error ? <p className={styles.empty}>{error}</p> : athletes.length === 0 ? (
            <p className={styles.empty}>No athletes on this plan.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {athletes.map((athlete) => (
                <AthleteActivitiesBlock
                  key={athlete.id}
                  planId={plan.id}
                  athlete={athlete}
                  activities={activities.filter((act) => act.athleteId === athlete.id)}
                  logCountFor={logCountFor}
                  onCreateLog={createLog}
                  onRemove={removeActivity}
                  onEdit={updateActivity}
                  onChanged={refresh}
                />
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Monitor</p><h2>Recent progress</h2></div></div>
          {logs.length === 0 ? <p className={styles.empty}>No progress logged yet for this plan.</p> : (
            <div className={styles.tableWrap}><table>
              <thead><tr><th>Date</th><th>Athlete</th><th>Activity</th><th>Status</th><th>Done</th><th>Notes</th><th>Logged by</th></tr></thead>
              <tbody>
                {logs.slice(0, 100).map((log) => (
                  <tr key={log.id}>
                    <td data-label="Date">{fmtDate(log.performedAt)}</td>
                    <td data-label="Athlete"><strong>{log.athlete?.lastName}, {log.athlete?.firstName}</strong><small>{log.athlete?.athleteCode}</small></td>
                    <td data-label="Activity">{log.activity?.activityName || "—"}</td>
                    <td data-label="Status">{renderStatus(log.status)}</td>
                    <td data-label="Done">{log.quantityDone != null ? `${log.quantityDone}` : "—"}</td>
                    <td data-label="Notes">{log.notes || "—"}</td>
                    <td data-label="Logged by">{log.logger?.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Notes</p><h2>Comments from the admin</h2></div></div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>{isAdmin ? "Leave a note for the implementing coach to see." : "Notes from the admin about this plan appear here."}</p>

          {notes.length === 0 ? <p className={styles.empty}>No comments yet.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {notes.map((note) => (
                <div key={note.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", background: "rgba(6,38,30,.35)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <strong style={{ fontSize: 13 }}>{note.author?.username || note.author?.email || "Admin"}</strong>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <small style={{ color: "var(--muted)" }}>{fmtDate(note.createdAt)}</small>
                      {isAdmin && note.authorId === Number(session.user.id) && <button className={`${styles.danger} ${styles.btnSm}`} onClick={() => deleteNote(note.id)}>Remove</button>}
                    </div>
                  </div>
                  <p style={{ margin: 0 }}>{note.body}</p>
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <form onSubmit={postNote} className={styles.formGrid} style={{ marginTop: 16 }}>
              <label className={styles.fullField}>Comment for the coach<textarea name="body" rows="2" maxLength="2000" required placeholder="e.g. Please add more recovery work for the injured athletes." /></label>
              <div className={styles.formActions}><button className={styles.primary}>Post comment</button></div>
            </form>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Training plan &amp; assessment</p><h2>Assess an athlete</h2></div>
            <button className={styles.secondary} onClick={() => setShowBulkAssess((c) => !c)}>{showBulkAssess ? "Close assessment" : "Assess an athlete"}</button>
          </div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>Pick an athlete and set status + effort for every activity in one go, then save once. Optionally add an overall rating (1–10) and summary comment for the athlete's training assessment.</p>
          {showBulkAssess && (
            <BulkAssessForm planId={plan.id} athletes={athletes} activities={activities} logs={logs} onDone={refresh} />
          )}
        </section>
      </AppShell>
    </>
  );
}

function renderStatus(status) {
  const meta = LOG_STATUS[status] || LOG_STATUS.planned;
  return <span className={`${styles.badge} ${styles[meta.cls]}`}>{meta.label}</span>;
}

function AthleteActivitiesBlock({ planId, athlete, activities, logCountFor, onCreateLog, onRemove, onEdit, onChanged }) {
  const [adding, setAdding] = React.useState(false);
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", background: "rgba(6,38,30,.35)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <strong>{athlete.lastName}, {athlete.firstName}</strong>
          {athlete.athleteCode ? <small style={{ color: "var(--muted)", display: "block" }}>{athlete.athleteCode}</small> : null}
        </div>
        <button className={styles.secondary} onClick={() => setAdding((c) => !c)}>{adding ? "Close add" : "Add activities"}</button>
      </div>

      {adding && (
        <AddAthleteActivitiesForm
          key={activities.length}
          planId={planId}
          athlete={athlete}
          onCreated={() => { setAdding(false); onChanged && onChanged(); }}
        />
      )}

      {activities.length === 0 ? (
        <p className={styles.empty} style={{ marginTop: 12 }}>No activities for this athlete yet.</p>
      ) : (
        <div className={styles.tableWrap} style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Activity</th><th>Fitness</th><th>Target</th><th>Log progress</th><th></th></tr></thead>
            <tbody>
              {activities.map((activity) => (
                <ActivityRow key={activity.id} athlete={athlete} activity={activity} logCountFor={logCountFor} onCreateLog={onCreateLog} onRemove={onRemove} onEdit={onEdit} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ athlete, activity, logCountFor, onCreateLog, onRemove, onEdit }) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [today] = React.useState(() => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); });

  const targetText = activity.targetQuantity != null ? `${activity.targetQuantity}${activity.targetUnit ? ` ${activity.targetUnit}` : ""}` : null;

  const [draft, setDraft] = React.useState(() => ({
    activityName: activity.activityName,
    fitnessType: activity.fitnessType,
    targetQuantity: activity.targetQuantity != null ? String(activity.targetQuantity) : "",
    targetUnit: activity.targetUnit || "",
    targetSets: activity.targetSets != null ? String(activity.targetSets) : "",
    targetReps: activity.targetReps != null ? String(activity.targetReps) : "",
    targetDistance: activity.targetDistance != null ? String(activity.targetDistance) : "",
    targetLoad: activity.targetLoad != null ? String(activity.targetLoad) : "",
    instructions: activity.instructions || "",
  }));

  function setField(name, value) {
    setDraft((d) => {
      const next = { ...d, [name]: value };
      if (name === "fitnessType") {
        const allowed = UNITS_BY_FITNESS[value] || [];
        if (!allowed.includes(next.targetUnit)) next.targetUnit = allowed[0] || "";
      }
      return next;
    });
  }

  function startEdit() {
    setDraft({
      activityName: activity.activityName,
      fitnessType: activity.fitnessType,
      targetQuantity: activity.targetQuantity != null ? String(activity.targetQuantity) : "",
      targetUnit: activity.targetUnit || "",
      targetSets: activity.targetSets != null ? String(activity.targetSets) : "",
      targetReps: activity.targetReps != null ? String(activity.targetReps) : "",
      targetDistance: activity.targetDistance != null ? String(activity.targetDistance) : "",
      targetLoad: activity.targetLoad != null ? String(activity.targetLoad) : "",
      instructions: activity.instructions || "",
    });
    setEditing(true);
  }

  function submitEdit(e) {
    e.preventDefault();
    setSaving(true);
    onEdit(activity.id, {
      activityName: draft.activityName,
      fitnessType: draft.fitnessType,
      targetQuantity: draft.targetQuantity || null,
      targetUnit: draft.targetUnit || null,
      targetSets: draft.targetSets || null,
      targetReps: draft.targetReps || null,
      targetDistance: draft.targetDistance || null,
      targetLoad: draft.targetLoad || null,
      instructions: draft.instructions || null,
    });
    setEditing(false);
    setSaving(false);
  }

  return (
    <React.Fragment>
      <tr>
        <td><strong>{activity.activityName}</strong>{activity.instructions ? <small>{activity.instructions}</small> : null}</td>
        <td><span className={styles.badge} style={{ background: "rgba(45,212,168,.16)", color: "var(--accent)" }}>{FITNESS_META[activity.fitnessType] || activity.fitnessType}</span></td>
        <td>
          {targetText ? <strong>{targetText}</strong> : "—"}
          {activity.targetSets ? <small>{activity.targetSets} sets</small> : null}
          {activity.targetReps ? <small>{activity.targetReps} reps</small> : null}
          {activity.targetDistance != null ? <small>{activity.targetDistance} m</small> : null}
          {activity.targetLoad != null ? <small>{activity.targetLoad} kg</small> : null}
        </td>
        <td><button className={styles.expandBtn} onClick={() => setOpen((c) => !c)}>{open ? "Close logging ▲" : "Log progress ▼"}</button></td>
        <td><button className={`${styles.secondary} ${styles.btnSm}`} onClick={() => { if (editing) setEditing(false); else startEdit(); }} style={{ padding: "4px 8px", fontSize: "12px" }}>{editing ? "Cancel" : "Edit"}</button> <button className={`${styles.danger} ${styles.btnSm}`} onClick={() => onRemove(activity.id)}>Remove</button></td>
      </tr>
      {editing && (
        <tr><td colSpan="5" style={{ padding: 0, background: "transparent" }}>
          <div className={styles.detailPanel}>
            <form onSubmit={submitEdit} className={styles.formGrid} style={{ marginTop: 0 }}>
              <label className={styles.fullField}>Activity name *<input className={styles.fieldControl} value={draft.activityName} onChange={(e) => setField("activityName", e.target.value)} required maxLength="191" /></label>
              <label>Fitness dimension<select className={styles.fieldControl} value={draft.fitnessType} onChange={(e) => setField("fitnessType", e.target.value)}>{Object.keys(FITNESS_META).map((k) => <option key={k} value={k}>{FITNESS_META[k]}</option>)}</select></label>
              <label>Target quantity<input className={styles.fieldControl} type="number" min="0" step="any" value={draft.targetQuantity} onChange={(e) => setField("targetQuantity", e.target.value)} placeholder="e.g. 20" /></label>
              <label>Target unit<select className={styles.fieldControl} value={draft.targetUnit} onChange={(e) => setField("targetUnit", e.target.value)}><option value="">— select —</option>{(UNITS_BY_FITNESS[draft.fitnessType] || []).map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
              <label>Sets<input className={styles.fieldControl} type="number" min="0" value={draft.targetSets} onChange={(e) => setField("targetSets", e.target.value)} /></label>
              <label>Reps<input className={styles.fieldControl} type="number" min="0" value={draft.targetReps} onChange={(e) => setField("targetReps", e.target.value)} /></label>
              <label>Distance (m)<input className={styles.fieldControl} type="number" min="0" step="any" value={draft.targetDistance} onChange={(e) => setField("targetDistance", e.target.value)} /></label>
              <label>Load (kg)<input className={styles.fieldControl} type="number" min="0" step="any" value={draft.targetLoad} onChange={(e) => setField("targetLoad", e.target.value)} /></label>
              <label className={styles.fullField}>Instructions<textarea className={styles.fieldControl} rows="2" maxLength="2000" value={draft.instructions} onChange={(e) => setField("instructions", e.target.value)} /></label>

              <div className={styles.formActions}>
                <button type="button" className={styles.secondary} onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                <button className={styles.primary} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
              </div>
            </form>
          </div>
        </td></tr>
      )}
      {open && (
        <tr><td colSpan="5" style={{ padding: 0, background: "transparent" }}>
          <div className={styles.detailPanel}>
            <form onSubmit={(e) => { e.preventDefault(); onCreateLog(activity.id, athlete.id, e.currentTarget); e.currentTarget.reset(); }} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", background: "rgba(6,38,30,.25)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <strong style={{ minWidth: 150 }}>{athlete.lastName}, {athlete.firstName}</strong>
                <select className={styles.fieldControl} name={`status-${activity.id}-${athlete.id}`} defaultValue="done" style={{ width: 110 }}>
                  <option value="done">Done</option><option value="partial">Partial</option><option value="missed">Missed</option>
                </select>
                <input className={styles.fieldControl} name={`qty-${activity.id}-${athlete.id}`} type="number" min="0" step="any" placeholder={activity.targetUnit ? `Done (${activity.targetUnit})` : "Done (qty)"} style={{ width: 130 }} />
                <input className={styles.fieldControl} name={`date-${activity.id}-${athlete.id}`} type="date" defaultValue={today} style={{ width: 140 }} />
                <input className={styles.fieldControl} name={`note-${activity.id}-${athlete.id}`} placeholder="Note" style={{ flex: 1, minWidth: 140 }} />
                <button className={`${styles.primary} ${styles.btnSm}`}>Save</button>
              </div>
              {logCountFor(activity.id, athlete.id) > 0 && <small style={{ color: "var(--accent)" }}>{logCountFor(activity.id, athlete.id)} log(s)</small>}
            </form>
          </div>
        </td></tr>
      )}
    </React.Fragment>
  );
}


function AddAthleteActivitiesForm({ planId, athlete, onCreated }) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [rows, setRows] = React.useState([{ id: 0, name: "", fitness: "endurance", qty: "", unit: "", sets: "", reps: "", dist: "", load: "", instr: "" }]);

  function addRow() {
    setRows((cur) => [...cur, { id: Date.now(), name: "", fitness: "endurance", qty: "", unit: "", sets: "", reps: "", dist: "", load: "", instr: "" }]);
  }
  function removeRow(id) {
    setRows((cur) => cur.filter((r) => r.id !== id));
  }
  function updateRow(id, key, value) {
    setRows((cur) => cur.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, [key]: value };
      if (key === "fitness") {
        const allowed = UNITS_BY_FITNESS[value] || [];
        if (!allowed.includes(next.unit)) next.unit = allowed[0] || "";
      }
      return next;
    }));
  }

  async function submit(event) {
    event.preventDefault();
    const valid = rows.filter((r) => r.name.trim());
    if (!valid.length) { setMessage("Enter at least one activity with a name."); return; }
    setBusy(true); setMessage("");
    const activities = valid.map((r) => ({
      athleteId: athlete.id,
      activityName: r.name.trim(),
      fitnessType: r.fitness,
      targetQuantity: r.qty || null,
      targetUnit: r.unit || null,
      targetSets: r.sets || null,
      targetReps: r.reps || null,
      targetDistance: r.dist || null,
      targetLoad: r.load || null,
      instructions: r.instr || null,
    }));
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/plan-activities", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ planId, action: "bulk", activities }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { setRows([{ id: 0, name: "", fitness: "endurance", qty: "", unit: "", sets: "", reps: "", dist: "", load: "", instr: "" }]); onCreated(); return; }
      setMessage(result.error || "Could not add the activities.");
    } catch (e) { setMessage("Unable to reach the server."); }
    setBusy(false);
  }

  return (
    <div style={{ borderTop: "1px solid rgba(26,92,74,.5)", marginTop: 12, paddingTop: 12 }}>
      <form onSubmit={submit} className={styles.formGrid}>
        {rows.map((r) => {
          const allowedUnits = UNITS_BY_FITNESS[r.fitness] || [];
          return (
            <div key={r.id} className={styles.fullField} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong style={{ fontSize: 13 }}>Activity {rows.indexOf(r) + 1}</strong>
                {rows.length > 1 && <button type="button" className={`${styles.danger} ${styles.btnSm}`} onClick={() => removeRow(r.id)}>Remove</button>}
              </div>
              <label className={styles.fullField} style={{ marginBottom: 8 }}>Name *<input value={r.name} onChange={(e) => updateRow(r.id, "name", e.target.value)} maxLength="191" placeholder="e.g. Endurance run" /></label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <label style={{ flex: "1 1 150px" }}>Fitness type<select value={r.fitness} onChange={(e) => updateRow(r.id, "fitness", e.target.value)}>{Object.keys(FITNESS_META).map((k) => <option key={k} value={k}>{FITNESS_META[k]}</option>)}</select></label>
                <label style={{ flex: "0 1 110px" }}>Quantity<input value={r.qty} onChange={(e) => updateRow(r.id, "qty", e.target.value)} type="number" min="0" step="any" placeholder="e.g. 1" /></label>
                <label style={{ flex: "0 1 120px" }}>Unit<select value={r.unit} onChange={(e) => updateRow(r.id, "unit", e.target.value)}><option value="">— select —</option>{allowedUnits.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
                <label style={{ flex: "0 1 90px" }}>Sets<input value={r.sets} onChange={(e) => updateRow(r.id, "sets", e.target.value)} type="number" min="0" /></label>
                <label style={{ flex: "0 1 90px" }}>Reps<input value={r.reps} onChange={(e) => updateRow(r.id, "reps", e.target.value)} type="number" min="0" /></label>
                <label style={{ flex: "0 1 100px" }}>Dist (m)<input value={r.dist} onChange={(e) => updateRow(r.id, "dist", e.target.value)} type="number" min="0" step="any" /></label>
                <label style={{ flex: "0 1 90px" }}>Load (kg)<input value={r.load} onChange={(e) => updateRow(r.id, "load", e.target.value)} type="number" min="0" step="any" /></label>
              </div>
              <label className={styles.fullField}>Instructions<textarea value={r.instr} onChange={(e) => updateRow(r.id, "instr", e.target.value)} rows="1" maxLength="2000" placeholder="How to do it, safety notes, etc." /></label>
            </div>
          );
        })}

        <div className={styles.fullField}>
          <button type="button" className={styles.secondary} onClick={addRow}>+ Add another activity</button>
        </div>

        <div className={styles.formActions}>
          <button type="button" className={styles.secondary} onClick={onCreated} disabled={busy}>Cancel</button>
          <button className={styles.primary} disabled={busy}>{busy ? "Adding..." : `Add ${rows.filter((r) => r.name.trim()).length || rows.length} activit${rows.length === 1 ? "y" : "ies"} for ${athlete.firstName}`}</button>
        </div>
        {message && <p role="status" className={`${styles.fullField} ${styles.formError}`}>{message}</p>}
      </form>
    </div>
  );
}


function BulkAssessForm({ planId, athletes, activities, logs, onDone }) {
  const [selectedAthlete, setSelectedAthlete] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState(null);
  const [drafts, setDrafts] = React.useState({});

  function pickAthlete(id) {
    setSelectedAthlete(id);
    const draftsFor = {};
    for (const activity of activities.filter((a) => a.athleteId === Number(id))) {
      const existing = logs.find((l) => l.athleteId === Number(id) && l.activityId === activity.id);
      draftsFor[activity.id] = {
        status: existing?.status || "done",
        qty: existing?.quantityDone != null ? String(existing.quantityDone) : "",
        sets: existing?.setsDone != null ? String(existing.setsDone) : "",
        reps: existing?.repsDone != null ? String(existing.repsDone) : "",
        note: existing?.notes || "",
      };
    }
    setDrafts(draftsFor);
    setMessage(null);
  }

  function update(activityId, key, value) {
    setDrafts((cur) => ({ ...cur, [activityId]: { ...cur[activityId], [key]: value } }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedAthlete) { setMessage({ kind: "error", text: "Select an athlete first." }); return; }
    setBusy(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    const rows = activities
      .filter((a) => a.athleteId === Number(selectedAthlete))
      .filter((a) => drafts[a.id])
      .map((a) => ({
        activityId: a.id,
        status: drafts[a.id].status,
        quantityDone: drafts[a.id].qty || null,
        setsDone: drafts[a.id].sets || null,
        repsDone: drafts[a.id].reps || null,
        notes: drafts[a.id].note || null,
      }));
    const body = {
      planId,
      athleteId: Number(selectedAthlete),
      performedAt: form.get("performedAt") || null,
      rows,
      summaryRating: form.get("summaryRating") || null,
      summaryFitness: form.get("summaryFitness") || null,
      summaryComments: form.get("summaryComments") || null,
    };
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/plan-activity-logs/bulk-assess", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { setMessage({ kind: "success", text: `Assessment saved for ${rows.length} activit${rows.length === 1 ? "y" : "ies"}.` }); onDone(); return; }
      setMessage({ kind: "error", text: result.error || "Could not save the assessment." });
    } catch (e) { setMessage({ kind: "error", text: "Unable to reach the server." }); }
    setBusy(false);
  }

  const athlete = athletes.find((a) => a.id === Number(selectedAthlete)) || null;
  const athleteActivities = activities.filter((a) => a.athleteId === Number(selectedAthlete));

  return (
    <form onSubmit={submit} className={styles.formGrid}>
      <label className={styles.fullField}>Athlete *<select value={selectedAthlete} onChange={(e) => pickAthlete(e.target.value)} required defaultValue=""><option value="">Select an athlete on this plan</option>{athletes.map((a) => <option key={a.id} value={a.id}>{a.lastName}, {a.firstName} ({a.athleteCode})</option>)}</select></label>
      <label>Date performed<input name="performedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
      <label>Overall rating (1–10, optional)<select name="summaryRating" defaultValue=""><option value="">No summary rating</option>{[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      <label>Fitness dimension (for summary)<select name="summaryFitness" defaultValue=""><option value="">General</option>{Object.keys(FITNESS_META).map((k) => <option key={k} value={k}>{FITNESS_META[k]}</option>)}</select></label>

      {selectedAthlete ? (
        <div className={styles.fullField} style={{ borderTop: "1px solid rgba(26,92,74,.5)", paddingTop: 14 }}>
          <p className={styles.eyebrow}>Activities for {athlete ? `${athlete.firstName} ${athlete.lastName}` : ""}</p>
          {athleteActivities.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {athleteActivities.map((activity) => {
                const d = drafts[activity.id] || { status: "done", qty: "", sets: "", reps: "", note: "" };
                return (
                  <div key={activity.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", background: "rgba(6,38,30,.25)" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <strong style={{ minWidth: 170, flex: "1 1 170px" }}>{activity.activityName}</strong>
                      <select className={styles.fieldControl} value={d.status} onChange={(e) => update(activity.id, "status", e.target.value)} style={{ width: 110 }}>
                        <option value="done">Done</option><option value="partial">Partial</option><option value="missed">Missed</option>
                      </select>
                      <input className={styles.fieldControl} value={d.qty} onChange={(e) => update(activity.id, "qty", e.target.value)} type="number" min="0" step="any" placeholder="Qty done" style={{ width: 110 }} />
                      <input className={styles.fieldControl} value={d.sets} onChange={(e) => update(activity.id, "sets", e.target.value)} type="number" min="0" placeholder="Sets" style={{ width: 80 }} />
                      <input className={styles.fieldControl} value={d.reps} onChange={(e) => update(activity.id, "reps", e.target.value)} type="number" min="0" placeholder="Reps" style={{ width: 80 }} />
                      <input className={styles.fieldControl} value={d.note} onChange={(e) => update(activity.id, "note", e.target.value)} placeholder="Note (optional)" style={{ flex: "1 1 140px", minWidth: 120 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className={styles.empty}>This athlete has no activities yet.</p>}
        </div>
      ) : null}

      <label className={styles.fullField}>Summary comment (optional)<textarea name="summaryComments" rows="2" maxLength="2000" placeholder="Overall observations about this athlete's effort and progress." /></label>

      <div className={styles.formActions}>
        <button className={styles.primary} disabled={busy || !selectedAthlete || !athleteActivities.length}>{busy ? "Saving..." : "Save assessment"}</button>
      </div>
      {message && <p role="status" className={`${styles.fullField} ${message.kind === "error" ? styles.formError : ""}`} style={message.kind === "success" ? { color: "var(--accent)" } : undefined}>{message.text}</p>}
    </form>
  );
}

