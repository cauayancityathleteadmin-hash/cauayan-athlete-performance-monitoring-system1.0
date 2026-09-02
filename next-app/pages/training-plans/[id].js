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

  const assignedMap = new Map(athletes.map((a) => [a.id, a]));

  return (
    <>
      <Head><title>{plan.planName} | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Training" title={plan.planName} active="/training-plans">
        <div className={styles.pageActions}>
          <span className={styles.eyebrow}>{plan.sport?.sportName || "—"} · {isAdmin ? `Run by ${plan.coach?.firstName || ""} ${plan.coach?.lastName || ""}` : "Your plan"}</span>
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
            <div><p className={styles.eyebrow}>Activities</p><h2>Planned activities</h2></div>
            <button className={styles.primary} onClick={() => setShowAddActivity((c) => !c)}>{showAddActivity ? "Close form" : "Add activity"}</button>
          </div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>Add the work athletes should do in this {plan.frequency} period (e.g. endurance, strength, power). Set a target and, optionally, a different target per athlete.</p>

          {showAddActivity && (
            <AddActivityForm planId={plan.id} athletes={athletes} onCreated={() => { setShowAddActivity(false); refresh(); }} />
          )}

          {loading ? <p className={styles.empty}>Loading plan details...</p> : error ? <p className={styles.empty}>{error}</p> : activities.length === 0 ? (
            <p className={styles.empty}>No activities yet. Add the first activity to this plan.</p>
          ) : (
            <div className={styles.tableWrap}><table>
              <thead><tr><th>Activity</th><th>Fitness</th><th>Target</th><th>Athletes with custom target</th><th>Log progress</th><th></th></tr></thead>
              <tbody>
                {activities.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} athletes={athletes} assignedMap={assignedMap} logCountFor={logCountFor} onCreateLog={createLog} onRemove={removeActivity} isAdmin={isAdmin} />
                ))}
              </tbody>
            </table></div>
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
                    <td>{fmtDate(log.performedAt)}</td>
                    <td><strong>{log.athlete?.lastName}, {log.athlete?.firstName}</strong><small>{log.athlete?.athleteCode}</small></td>
                    <td>{log.activity?.activityName || "—"}</td>
                    <td>{renderStatus(log.status)}</td>
                    <td>{log.quantityDone != null ? `${log.quantityDone}` : "—"}</td>
                    <td>{log.notes || "—"}</td>
                    <td>{log.logger?.email || "—"}</td>
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
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Assess</p><h2>Physical fitness assessment</h2></div></div>
          <AssessmentForm planId={plan.id} athletes={athletes} onDone={refresh} />
        </section>
      </AppShell>
    </>
  );
}

function renderStatus(status) {
  const meta = LOG_STATUS[status] || LOG_STATUS.planned;
  return <span className={`${styles.badge} ${styles[meta.cls]}`}>{meta.label}</span>;
}

function ActivityRow({ activity, athletes, assignedMap, logCountFor, onCreateLog, onRemove }) {
  const [open, setOpen] = React.useState(false);
  const targets = activity.targets || [];
  const targetText = activity.targetQuantity != null ? `${activity.targetQuantity}${activity.targetUnit ? ` ${activity.targetUnit}` : ""}` : null;

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
        <td>{targets.length ? targets.map((t) => `${assignedMap.get(t.athleteId)?.lastName || "?"}`).join(", ") : "All athletes (same target)"}</td>
        <td><button className={styles.expandBtn} onClick={() => setOpen((c) => !c)}>{open ? "Close logging ▲" : "Log progress ▼"}</button></td>
        <td><button className={`${styles.danger} ${styles.btnSm}`} onClick={() => onRemove(activity.id)}>Remove</button></td>
      </tr>
      {open && (
        <tr><td colSpan="6" style={{ padding: 0, background: "transparent" }}>
          <div className={styles.detailPanel}>
            {athletes.length === 0 ? <div className={styles.detailEmpty}>No athletes on this plan.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {athletes.map((a) => {
                  const t = targets.find((x) => x.athleteId === a.id);
                  return (
                    <form key={a.id} onSubmit={(e) => { e.preventDefault(); onCreateLog(activity.id, a.id, e.currentTarget); e.currentTarget.reset(); }} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", background: "rgba(6,38,30,.25)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                        <strong style={{ minWidth: 150 }}>{a.lastName}, {a.firstName}</strong>
                        <small style={{ color: "var(--muted)" }}>{t ? `Custom: ${t.targetQuantity != null ? `${t.targetQuantity}${t.targetUnit ? ` ${t.targetUnit}` : ""}` : "—"}` : "Plan target"}</small>
                        <select className={styles.fieldControl} name={`status-${activity.id}-${a.id}`} defaultValue="done" style={{ width: 110 }}>
                          <option value="done">Done</option><option value="partial">Partial</option><option value="missed">Missed</option>
                        </select>
                        <input className={styles.fieldControl} name={`qty-${activity.id}-${a.id}`} type="number" min="0" step="any" placeholder={t?.targetUnit ? `Done (${t.targetUnit})` : "Done (qty)"} style={{ width: 130 }} />
                        <input className={styles.fieldControl} name={`date-${activity.id}-${a.id}`} type="date" style={{ width: 140 }} />
                        <input className={styles.fieldControl} name={`note-${activity.id}-${a.id}`} placeholder="Note" style={{ flex: 1, minWidth: 140 }} />
                        <button className={`${styles.primary} ${styles.btnSm}`}>Save</button>
                      </div>
                      {logCountFor(activity.id, a.id) > 0 && <small style={{ color: "var(--accent)" }}>{logCountFor(activity.id, a.id)} log(s)</small>}
                    </form>
                  );
                })}
              </div>
            )}
          </div>
        </td></tr>
      )}
    </React.Fragment>
  );
}

function AddActivityForm({ planId, athletes, onCreated }) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = {
      planId: Number(form.get("planId")),
      action: "create",
      activityName: form.get("activityName"),
      fitnessType: form.get("fitnessType"),
      targetQuantity: form.get("targetQuantity") || null,
      targetUnit: form.get("targetUnit") || null,
      targetSets: form.get("targetSets") || null,
      targetReps: form.get("targetReps") || null,
      targetDistance: form.get("targetDistance") || null,
      targetLoad: form.get("targetLoad") || null,
      instructions: form.get("instructions") || null,
      targets: athletes.map((a) => ({ athleteId: a.id, targetQuantity: form.get(`tqty-${a.id}`) || null, targetUnit: form.get(`tunit-${a.id}`) || null })),
    };
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/plan-activities", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { event.currentTarget.reset(); onCreated(); return; }
      setMessage(result.error || "Could not add the activity.");
    } catch (e) { setMessage("Unable to reach the server."); }
    setBusy(false);
  }

  return (
    <>
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Add</p><h2>New activity</h2></div></div>
      <form onSubmit={submit} className={styles.formGrid}>
        <input type="hidden" name="planId" value={planId} />
        <label className={styles.fullField}>Activity name *<input name="activityName" required maxLength="191" placeholder="e.g. Endurance run" /></label>
        <label>Fitness type *<select name="fitnessType" defaultValue="endurance">{Object.keys(FITNESS_META).map((k) => <option key={k} value={k}>{FITNESS_META[k]}</option>)}</select></label>
        <label>Target quantity<input name="targetQuantity" type="number" min="0" step="any" placeholder="e.g. 1" /></label>
        <label>Unit<input name="targetUnit" maxLength="50" placeholder="e.g. hour(s), km, laps" /></label>
        <label>Target sets<input name="targetSets" type="number" min="0" /></label>
        <label>Target reps<input name="targetReps" type="number" min="0" /></label>
        <label>Distance (m)<input name="targetDistance" type="number" min="0" step="any" /></label>
        <label>Load (kg)<input name="targetLoad" type="number" min="0" step="any" /></label>
        <label className={styles.fullField}>Instructions<textarea name="instructions" rows="2" maxLength="2000" placeholder="How to do it, safety notes, etc." /></label>

        <div className={styles.fullField} style={{ borderTop: "1px solid rgba(26,92,74,.5)", paddingTop: 16 }}>
          <p className={styles.eyebrow}>Per-athlete targets (optional)</p>
          <p className={styles.formHint}>Leave blank to use the plan target for everyone. Only fill in athletes who need something different.</p>
          {athletes.length ? (
            <div className={styles.checkboxList} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {athletes.map((a) => (
                <div key={a.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <strong style={{ fontSize: 13 }}>{a.lastName}, {a.firstName}</strong>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input className={styles.fieldControl} name={`tqty-${a.id}`} type="number" min="0" step="any" placeholder="Qty" style={{ width: "45%" }} />
                    <input className={styles.fieldControl} name={`tunit-${a.id}`} placeholder="Unit" style={{ width: "55%" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <p className={styles.empty}>No athletes on this plan.</p>}
        </div>

        <div className={styles.formActions}><button className={styles.primary} disabled={busy}>{busy ? "Adding..." : "Add activity"}</button></div>
        {message && <p role="status" className={`${styles.fullField} ${styles.formError}`}>{message}</p>}
      </form>
    </>
  );
}

const ASSESS_FITNESS = ["endurance", "strength", "power", "speed_agility", "skill_technique", "mobility", "recovery"];

function AssessmentForm({ planId, athletes, onDone }) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = {
      athleteId: Number(form.get("athleteId")),
      planId,
      rating: Number(form.get("rating")),
      fitnessDimension: form.get("fitnessDimension") || null,
      comments: form.get("comments"),
    };
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/training-assessments", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { event.currentTarget.reset(); setMessage(""); onDone(); return; }
      setMessage(result.error || "Could not record the assessment.");
    } catch (e) { setMessage("Unable to reach the server."); }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.formGrid}>
      <label>Athlete *<select name="athleteId" required defaultValue="">{athletes.map((a) => <option key={a.id} value={a.id}>{a.lastName}, {a.firstName}</option>)}</select></label>
      <label>Fitness dimension<select name="fitnessDimension" defaultValue=""><option value="">General</option>{ASSESS_FITNESS.map((k) => <option key={k} value={k}>{FITNESS_META[k]}</option>)}</select></label>
      <label>Rating (1–10) *<select name="rating" required defaultValue="5">{[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className={styles.fullField}>Comments<textarea name="comments" rows="2" maxLength="2000" /></label>
      <div className={styles.formActions}><button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Record assessment"}</button></div>
      {message && <p role="status" className={`${styles.fullField} ${styles.formError}`}>{message}</p>}
    </form>
  );
}