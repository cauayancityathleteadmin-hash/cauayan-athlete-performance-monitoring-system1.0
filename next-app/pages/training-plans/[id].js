import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { getSession } from "next-auth/react";
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { prisma } from "../../lib/prisma";
import { buildMonitoringGrid } from "../../lib/plan-monitoring";
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

  const [allActivities, notes] = await Promise.all([
    prisma.planActivity.findMany({
      where: { planId: id },
      orderBy: { orderIndex: "asc" },
      include: {
        athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } },
        logs: {
          orderBy: { performedAt: "desc" },
          include: { athlete: { select: { id: true, firstName: true, lastName: true } }, logger: { select: { email: true, username: true } } },
        },
      },
    }),
    prisma.trainingNote.findMany({
      where: { planId: id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, email: true, username: true, role: true } } },
    }),
  ]);

  const activityIds = allActivities.map((a) => a.id);
  const logs = await prisma.planActivityLog.findMany({
    where: { activityId: { in: activityIds } },
    orderBy: [{ performedAt: "desc" }],
    include: {
      athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } },
      logger: { select: { id: true, email: true, username: true } },
      activity: { select: { id: true, activityName: true, fitnessType: true } },
    },
    take: 500,
  });

  const monitoringActivities = allActivities.map((a) => {
    const latest = a.logs.find((l) => ["done", "partial", "missed"].includes(l.status)) || null;
    return { ...a, logs: latest ? [latest] : [] };
  });
  const monitoring = buildMonitoringGrid({ activities: monitoringActivities, planAthletes, week: 1 });

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
      initialActivities: JSON.parse(JSON.stringify(allActivities)),
      initialLogs: JSON.parse(JSON.stringify(logs)),
      initialNotes: JSON.parse(JSON.stringify(notes)),
      initialMonitoringData: JSON.parse(
        JSON.stringify({
          plan: { id: plan.id, durationDays: plan.durationDays, durationWeeks: plan.durationWeeks, startDate: plan.startDate.toISOString() },
          currentWeek: 1,
          maxWeek: (plan.durationDays != null ? Math.ceil(plan.durationDays / 7) : null) || plan.durationWeeks || 1,
          ...monitoring,
        })
      ),
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

export default function PlanDetail({ session, isAdmin, plan, athletes, initialActivities = [], initialLogs = [], initialNotes = [], initialMonitoringData = null }) {
  const router = useRouter();
  const [activities, setActivities] = React.useState(initialActivities);
  const [logs, setLogs] = React.useState(initialLogs);
  const [notes, setNotes] = React.useState(initialNotes);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [showAddActivity, setShowAddActivity] = React.useState(false);
  const [showBulkAssess, setShowBulkAssess] = React.useState(true);
  const [currentWeek, setCurrentWeek] = React.useState(initialMonitoringData?.currentWeek || 1);
  const [monitoringData, setMonitoringData] = React.useState(initialMonitoringData);
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

  const loadMonitoring = React.useCallback(() => {
    fetch(`/api/plan-activities/monitoring?planId=${plan.id}&weekNumber=${currentWeek}`)
      .then((r) => r.json())
      .then((data) => { setMonitoringData(data); setError(""); })
      .catch(() => { setError("Could not load monitoring grid."); });
  }, [plan.id, currentWeek]);

  const skippedFirstMonitoringRefresh = React.useRef(false);
  React.useEffect(() => {
    if (!skippedFirstMonitoringRefresh.current) {
      skippedFirstMonitoringRefresh.current = true;
      return;
    }
    loadMonitoring();
  }, [loadMonitoring]);

  function refresh() {
    loadActivities(true);
    loadLogs(true);
    loadNotes(true);
    loadMonitoring();
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

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Overview</p><h2>Progress overview</h2></div>
            <span className={styles.formHint} style={{ alignSelf: "center" }}>{plan.durationDays ? `${plan.durationDays} days` : plan.durationWeeks ? `${plan.durationWeeks} wks` : "No duration set"}</span>
          </div>
          <TrainingCharts plan={plan} athletes={athletes} activities={activities} logs={logs} />
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
                  logs={logs}
                  onRemove={removeActivity}
                  onEdit={updateActivity}
                  onChanged={refresh}
                  readOnly={isAdmin}
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
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Monitor</p><h2>Daily training monitoring</h2></div>
          </div>
          {monitoringData ? (
            <MonitoringGrid
              data={monitoringData}
              athletes={athletes}
              maxWeek={monitoringData.maxWeek}
              currentWeek={monitoringData.currentWeek}
              onWeekChange={setCurrentWeek}
            />
          ) : (
            <p className={styles.empty}>Loading daily training monitoring...</p>
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
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Admin guidance</p><h2>Guidance per athlete</h2></div></div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>
            {isAdmin ? "Add targeted guidance for an athlete; the implementing coach can read it." : "Guidance written by the administrator for each athlete appears here."}
          </p>
          {athletes.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {athletes.map((athlete) => (
                <AthleteGuidanceRow key={athlete.id} planId={plan.id} athlete={athlete} isAdmin={isAdmin} />
              ))}
            </div>
          ) : <p className={styles.empty}>No athletes on this plan yet.</p>}
        </section>

        {!isAdmin && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div><p className={styles.eyebrow}>Training plan &amp; assessment</p><h2>Assess an athlete</h2></div>
              <button className={styles.secondary} onClick={() => setShowBulkAssess((c) => !c)}>{showBulkAssess ? "Close assessment" : "Assess an athlete"}</button>
            </div>
            <p className={styles.formHint} style={{ marginTop: 0 }}>Pick an athlete and set status + effort for every activity in one go, then save once. Optionally add an overall rating (1&ndash;10) and summary comment for the athlete&apos;s training assessment. If you add a rating, it is filed automatically under the fitness area the athlete scored most in.</p>
            {showBulkAssess && (
              <BulkAssessForm planId={plan.id} athletes={athletes} activities={activities} logs={logs} onDone={refresh} />
            )}
          </section>
        )}
      </AppShell>
    </>
  );
}

function renderStatus(status) {
  const meta = LOG_STATUS[status] || LOG_STATUS.planned;
  return <span className={`${styles.badge} ${styles[meta.cls]}`}>{meta.label}</span>;
}

function computeProgress(activity, log) {
  if (!log) return null;
  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  let done = null;
  let target = null;
  if (activity.targetQuantity != null) {
    done = toNum(log.quantityDone);
    target = toNum(activity.targetQuantity);
  } else if (activity.targetDistance != null) {
    done = toNum(log.quantityDone);
    target = toNum(activity.targetDistance);
  } else if (activity.targetSets != null) {
    done = log.setsDone != null ? toNum(log.setsDone) : null;
    target = toNum(activity.targetSets);
  } else if (activity.targetReps != null) {
    done = log.repsDone != null ? toNum(log.repsDone) : null;
    target = toNum(activity.targetReps);
  }
  if (done == null || target == null || target <= 0) return null;
  const percent = Math.round(Math.min(100, Math.max(0, (done / target) * 100)));
  return { percent, done, target };
}

function AthleteActivitiesBlock({ planId, athlete, activities, logs, onRemove, onEdit, onChanged, readOnly = false }) {
  const [adding, setAdding] = React.useState(false);
  const [showActivities, setShowActivities] = React.useState(true);
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", background: "rgba(6,38,30,.35)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <strong>{athlete.lastName}, {athlete.firstName}</strong>
          {athlete.athleteCode ? <small style={{ color: "var(--muted)", display: "block" }}>{athlete.athleteCode}</small> : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className={styles.secondary} onClick={() => setShowActivities((c) => !c)}>{showActivities ? "Hide activities" : "Show activities"}</button>
          {!readOnly && <button className={styles.secondary} onClick={() => setAdding((c) => !c)}>{adding ? "Close add" : "Add activities"}</button>}
        </div>
      </div>

      {adding && (
        <AddAthleteActivitiesForm
          key={activities.length}
          planId={planId}
          athlete={athlete}
          onCreated={() => { setAdding(false); onChanged && onChanged(); }}
        />
      )}

      {showActivities && (activities.length === 0 ? (
        <p className={styles.empty} style={{ marginTop: 12 }}>{readOnly ? "No activities defined yet for this athlete." : "No activities for this athlete yet."}</p>
      ) : (
        <div className={styles.tableWrap} style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Activity</th><th>Fitness</th><th>Target</th><th>Latest status</th>{!readOnly && <th></th>}</tr></thead>
            <tbody>
              {activities.map((activity) => (
                <ActivityRow key={activity.id} athlete={athlete} activity={activity} logs={logs} onRemove={onRemove} onEdit={onEdit} readOnly={readOnly} />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ActivityRow({ athlete, activity, logs, onRemove, onEdit, readOnly = false }) {
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const targetText = activity.targetQuantity != null ? `${activity.targetQuantity}${activity.targetUnit ? ` ${activity.targetUnit}` : ""}` : null;

  // Find latest log for this activity + athlete
  const activityLogs = logs.filter((l) => l.activityId === activity.id && l.athleteId === athlete.id);
  const latestLog = activityLogs.length ? [...activityLogs].sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt))[0] : null;

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
    dayIndex: activity.dayIndex != null ? String(activity.dayIndex) : "",
    weekNumber: activity.weekNumber != null ? String(activity.weekNumber) : "",
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
      dayIndex: activity.dayIndex != null ? String(activity.dayIndex) : "",
      weekNumber: activity.weekNumber != null ? String(activity.weekNumber) : "",
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
      dayIndex: draft.dayIndex ? parseInt(draft.dayIndex) : null,
      weekNumber: draft.weekNumber ? parseInt(draft.weekNumber) : null,
    });
    setEditing(false);
    setSaving(false);
  }

  function renderLatestStatus(log) {
    if (!log) return <span style={{ color: "var(--muted)", fontSize: "12px" }}>Not logged</span>;
    const meta = LOG_STATUS[log.status] || LOG_STATUS.planned;
    return (
      <span className={`${styles.badge} ${styles[meta.cls]}`} style={{ fontSize: "11px" }}>
        {meta.label}
        {log.quantityDone != null && <span style={{ marginLeft: 6, fontWeight: 400 }}>{log.quantityDone}{log.activity?.targetUnit ? ` ${log.activity.targetUnit}` : ""}</span>}
        <small style={{ marginLeft: 6, opacity: 0.7 }}>{fmtDate(log.performedAt)}</small>
      </span>
    );
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
          {activity.dayIndex ? <small>Day {activity.dayIndex}{activity.weekNumber ? ` | W${activity.weekNumber}` : ""}</small> : null}
        </td>
        <td>
          {renderLatestStatus(latestLog)}
          {(() => {
            const p = computeProgress(activity, latestLog);
            if (!p) return null;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <div style={{ width: 90, height: 6, borderRadius: 4, background: "rgba(255,255,255,.12)", overflow: "hidden" }}>
                  <div style={{ width: `${p.percent}%`, height: "100%", borderRadius: 4, background: p.percent >= 80 ? "var(--accent)" : p.percent >= 50 ? "#fbbf24" : "var(--danger)" }} />
                </div>
                <small style={{ color: "var(--muted)", fontSize: "11px", whiteSpace: "nowrap" }}>{p.percent}%</small>
              </div>
            );
          })()}
        </td>
        {!readOnly && <td><button className={`${styles.secondary} ${styles.btnSm}`} onClick={() => { if (editing) setEditing(false); else startEdit(); }} style={{ padding: "4px 8px", fontSize: "12px" }}>{editing ? "Cancel" : "Edit"}</button> <button className={`${styles.danger} ${styles.btnSm}`} onClick={() => onRemove(activity.id)}>Remove</button></td>}
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
              <label>Day (1–7)<input className={styles.fieldControl} type="number" min="1" max="7" value={draft.dayIndex} onChange={(e) => setField("dayIndex", e.target.value)} placeholder="Day" /></label>
              <label>Week<input className={styles.fieldControl} type="number" min="1" value={draft.weekNumber} onChange={(e) => setField("weekNumber", e.target.value)} placeholder="Week" /></label>
              <label className={styles.fullField}>Instructions<textarea className={styles.fieldControl} rows="2" maxLength="2000" value={draft.instructions} onChange={(e) => setField("instructions", e.target.value)} /></label>

              <div className={styles.formActions}>
                <button type="button" className={styles.secondary} onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                <button className={styles.primary} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
              </div>
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
  const [rows, setRows] = React.useState([{ id: 0, name: "", fitness: "endurance", qty: "", unit: "", sets: "", reps: "", dist: "", load: "", instr: "", day: "", week: "" }]);

  function addRow() {
    setRows((cur) => [...cur, { id: Date.now(), name: "", fitness: "endurance", qty: "", unit: "", sets: "", reps: "", dist: "", load: "", instr: "", day: "", week: "" }]);
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
      dayIndex: r.day ? parseInt(r.day) : null,
      weekNumber: r.week ? parseInt(r.week) : null,
    }));
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/plan-activities", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ planId, action: "bulk", activities }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { setRows([{ id: 0, name: "", fitness: "endurance", qty: "", unit: "", sets: "", reps: "", dist: "", load: "", instr: "", day: "", week: "" }]); onCreated(); return; }
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
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <label style={{ flex: "0 1 90px" }}>Day (1–7)<input value={r.day} onChange={(e) => updateRow(r.id, "day", e.target.value)} type="number" min="1" max="7" placeholder="Day" /></label>
                <label style={{ flex: "0 1 90px" }}>Week<input value={r.week} onChange={(e) => updateRow(r.id, "week", e.target.value)} type="number" min="1" placeholder="Week" /></label>
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
  const [openAthleteId, setOpenAthleteId] = React.useState(null);

  if (!athletes.length) return <p className={styles.empty}>No athletes on this plan to assess.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {athletes.map((athlete) => {
        const isOpen = openAthleteId === athlete.id;
        return (
          <div key={athlete.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", background: "rgba(6,38,30,.35)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <strong>{athlete.lastName}, {athlete.firstName}</strong>
                {athlete.athleteCode ? <small style={{ color: "var(--muted)", display: "block" }}>{athlete.athleteCode}</small> : null}
              </div>
              <button className={isOpen ? styles.secondary : styles.primary} onClick={() => setOpenAthleteId(isOpen ? null : athlete.id)}>
                {isOpen ? "Close assessment" : "Assess"}
              </button>
            </div>
            {isOpen && (
              <div style={{ borderTop: "1px solid rgba(26,92,74,.5)", marginTop: 12, paddingTop: 12 }}>
                <AthleteAssessForm planId={planId} athlete={athlete} activities={activities} logs={logs} onDone={onDone} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AthleteAssessForm({ planId, athlete, activities, logs, onDone }) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState(null);
  const [drafts, setDrafts] = React.useState(() => {
    const out = {};
    for (const activity of activities.filter((a) => a.athleteId === athlete.id)) {
      const existing = logs.find((l) => l.athleteId === athlete.id && l.activityId === activity.id);
      out[activity.id] = {
        status: existing?.status || "done",
        qty: existing?.quantityDone != null ? String(existing.quantityDone) : "",
        sets: existing?.setsDone != null ? String(existing.setsDone) : "",
        reps: existing?.repsDone != null ? String(existing.repsDone) : "",
        note: existing?.notes || "",
      };
    }
    return out;
  });

  function update(activityId, key, value) {
    setDrafts((cur) => ({ ...cur, [activityId]: { ...cur[activityId], [key]: value } }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    const rows = activities
      .filter((a) => a.athleteId === athlete.id)
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
      athleteId: athlete.id,
      performedAt: form.get("performedAt") || null,
      rows,
      summaryRating: form.get("summaryRating") || null,
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

  const athleteActivities = activities.filter((a) => a.athleteId === athlete.id);

  return (
    <form onSubmit={submit} className={styles.formGrid}>
      <label>Date performed<input name="performedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
      <label>Overall rating (1–10, optional)<select name="summaryRating" defaultValue=""><option value="">No summary rating</option>{[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>

      <div className={styles.fullField} style={{ borderTop: "1px solid rgba(26,92,74,.5)", paddingTop: 14 }}>
        <p className={styles.eyebrow}>Activities for {athlete.firstName} {athlete.lastName}</p>
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

      <label className={styles.fullField}>Summary comment (optional)<textarea name="summaryComments" rows="2" maxLength="2000" placeholder="Overall observations about this athlete's effort and progress." /></label>

      <div className={styles.formActions}>
        <button className={styles.primary} disabled={busy || !athleteActivities.length}>{busy ? "Saving..." : "Save assessment"}</button>
      </div>
      {message && <p role="status" className={`${styles.fullField} ${message.kind === "error" ? styles.formError : ""}`} style={message.kind === "success" ? { color: "var(--accent)" } : undefined}>{message.text}</p>}
    </form>
  );
}

function MonitoringGrid({ data, athletes, maxWeek, currentWeek, onWeekChange }) {
  const days = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];
  const grid = data?.grid || {};

  const getDayStatus = (dayData) => {
    if (dayData.total === 0) return "none";
    if (dayData.done === dayData.total) return "done";
    if (dayData.done > 0 || dayData.partial > 0 || dayData.missed > 0) return "partial";
    return "pending";
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "done": return "day-done";
      case "partial": return "day-partial";
      case "pending": return "day-pending";
      default: return "day-none";
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div className={styles.fullField} style={{ minWidth: 160 }}>
          <label>Week<select value={currentWeek} onChange={(e) => onWeekChange(parseInt(e.target.value))} className={styles.fieldControl}>
            {[...Array(maxWeek)].map((_, i) => <option key={i + 1} value={i + 1}>Week {i + 1}</option>)}
          </select></label>
        </div>
        <p className={styles.formHint} style={{ margin: 0, color: "var(--muted)" }}>
          {maxWeek ? `Plan weeks: ${maxWeek}` : "No duration set"}
        </p>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 180 }}>Athlete</th>
              {days.map((d, i) => <th key={i} style={{ textAlign: "center" }}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {athletes.map((athlete) => {
              const row = grid[athlete.id];
              return (
                <tr key={athlete.id}>
                  <td data-label="Athlete">
                    <strong>{athlete.lastName}, {athlete.firstName}</strong><br />
                    <small>{athlete.athleteCode}</small>
                    {(() => { const p = data?.progress?.[athlete.id]; if (!p || p.total === 0) return null; return (
                      <div style={{ marginTop: 6, fontSize: 11 }}>
                        <span style={{ color: "var(--accent)", fontWeight: 700 }}>Week {currentWeek}: {p.percent}%</span>
                        <small style={{ color: "var(--muted)" }}> ({p.completed}/{p.total})</small>
                      </div>
                    ); })()}
                  </td>
                  {days.map((_, i) => {
                    const dayData = row?.days[i + 1] || { total: 0, done: 0, partial: 0, missed: 0, pending: 0 };
                    const status = getDayStatus(dayData);
                    return (
                      <td key={i} style={{ textAlign: "center", verticalAlign: "middle" }}>
                        <span className={`day-badge ${getStatusClass(status)}`}>
                          {dayData.total > 0 ? `${dayData.done}/${dayData.total}` : "—"}
                        </span>
                        {dayData.total > 0 && (
                          <>
                            <div style={{ marginTop: 6, fontSize: 10, lineHeight: 1.6, color: "var(--muted)" }}>
                              <div>Done: <strong style={{ color: "var(--accent)" }}>{dayData.done}</strong></div>
                              <div>Partial: <strong>{dayData.partial}</strong></div>
                              <div>Missed: <strong style={{ color: "var(--danger)" }}>{dayData.missed}</strong></div>
                              <div>Open: <strong>{dayData.pending}</strong></div>
                            </div>
                            <div style={{ marginTop: 6, fontSize: 10, color: "var(--muted)" }}>
                              {dayData.activities.map(a => (
                                <div key={a.id} title={a.activityName}>
                                  <span style={a.log ? { color: "var(--accent)", fontWeight: 600 } : { color: "var(--muted)" }}>
                                    {a.log ? "DONE" : "open"} {a.activityName}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .day-badge { display: inline-block; min-width: 48px; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 12px; }
        .day-done { background: rgba(45,212,168,.2); color: var(--accent); border: 1px solid rgba(45,212,168,.4); }
        .day-partial { background: rgba(255,193,7,.2); color: #ffc107; border: 1px solid rgba(255,193,7,.4); }
        .day-pending { background: rgba(26,92,74,.1); color: var(--muted); border: 1px solid rgba(26,92,74,.2); }
        .day-none { background: transparent; color: var(--muted); border: 1px dashed var(--border); }
      `}</style>
    </div>
  );
}

const CHART_PALETTE = ["#2dd4a8", "#86efac", "#14b8a6", "#34d399", "#4ade80", "#0d9488", "#5eead4", "#6ee7b7"];

function percentColor(p) {
  if (p == null) return "#64748b";
  if (p >= 80) return "#2dd4a8";
  if (p >= 50) return "#fbbf24";
  return "#f87171";
}

const chartTooltip = {
  contentStyle: { background: "#06261e", border: "1px solid rgba(45,212,168,.35)", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#e7f7f1", fontWeight: 700 },
  itemStyle: { color: "#9db6c7" },
};

function TrainingCharts({ plan, athletes, activities, logs }) {
  const [focusAthleteId, setFocusAthleteId] = React.useState(athletes[0]?.id ?? null);

  const perAthlete = React.useMemo(() => {
    return athletes.map((a) => {
      const acts = activities.filter((act) => act.athleteId === a.id);
      let done = 0, partial = 0, missed = 0, open = 0;
      const byActivity = acts.map((act) => {
        const al = logs.filter((l) => l.activityId === act.id && l.athleteId === a.id);
        const latest = al.length ? [...al].sort((x, y) => new Date(y.performedAt) - new Date(x.performedAt))[0] : null;
        const status = latest ? latest.status : "open";
        if (status === "done") done++;
        else if (status === "partial") partial++;
        else if (status === "missed") missed++;
        else open++;
        const p = computeProgress(act, latest);
        return { id: act.id, name: act.activityName, fitness: act.fitnessType, status, percent: p ? p.percent : 0 };
      });
      const total = acts.length;
      const percent = total ? Math.round(((done + partial) / total) * 100) : 0;
      return { id: a.id, code: a.athleteCode, name: `${a.firstName} ${a.lastName}`, total, done, partial, missed, open, percent, byActivity };
    });
  }, [athletes, activities, logs]);

  const overallCompletion = React.useMemo(() => {
    const withActs = perAthlete.filter((r) => r.total > 0);
    return withActs.length ? Math.round(withActs.reduce((s, r) => s + r.percent, 0) / withActs.length) : 0;
  }, [perAthlete]);

  const barData = perAthlete.slice(0, 20).map((r) => ({ name: r.name.split(" ")[0], full: r.name, percent: r.total ? r.percent : 0, total: r.total }));

  const fitnessDist = React.useMemo(() => {
    const map = new Map();
    for (const act of activities) map.set(act.fitnessType, (map.get(act.fitnessType) || 0) + 1);
    const arr = [...map.entries()].map(([key, count]) => ({ key, name: FITNESS_META[key] || key, count })).sort((x, y) => y.count - x.count);
    const top = arr.slice(0, 5);
    const rest = arr.slice(5);
    if (rest.length) top.push({ key: "other", name: "Other", count: rest.reduce((s, r) => s + r.count, 0) });
    return top.map((d, i) => ({ ...d, color: CHART_PALETTE[i % CHART_PALETTE.length] }));
  }, [activities]);

  const weekly = React.useMemo(() => {
    const maxWeek = (plan.durationDays != null ? Math.ceil(plan.durationDays / 7) : null) || plan.durationWeeks || 1;
    const weeks = [];
    for (let w = 1; w <= maxWeek; w++) {
      const acts = activities.filter((act) => act.weekNumber == null || Number(act.weekNumber) === w);
      if (!acts.length) { weeks.push({ week: w, percent: 0, total: 0 }); continue; }
      let done = 0, partial = 0;
      for (const act of acts) {
        const latest = logs.filter((l) => l.activityId === act.id).sort((x, y) => new Date(y.performedAt) - new Date(x.performedAt))[0];
        if (!latest) continue;
        if (latest.status === "done") done++;
        else if (latest.status === "partial") partial++;
      }
      weeks.push({ week: w, percent: Math.round(((done + partial) / acts.length) * 100), total: acts.length });
    }
    return weeks;
  }, [activities, logs, plan.durationDays, plan.durationWeeks]);

  const focus = perAthlete.find((r) => r.id === focusAthleteId) || perAthlete[0];

  const radarData = React.useMemo(() => {
    if (!focus) return [];
    const byFitness = new Map();
    for (const act of focus.byActivity) {
      if (!byFitness.has(act.fitness)) byFitness.set(act.fitness, []);
      byFitness.get(act.fitness).push(act.status);
    }
    return [...byFitness.entries()].map(([f, statuses]) => {
      const done = statuses.filter((s) => s === "done").length;
      const partial = statuses.filter((s) => s === "partial").length;
      return { fitness: FITNESS_META[f] || f, value: Math.round(((done + partial) / statuses.length) * 100) };
    });
  }, [focus]);

  return (
    <div>
      <style jsx>{`
        .statGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; margin-bottom: 20px; }
        .chartGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; align-items: stretch; }
        .panelBox { margin: 0 !important; min-width: 0; }
        .drillHead { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        @media (max-width: 560px) { .statGrid, .chartGrid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="statGrid">
        <div className={`${styles.detailPanel} panelBox`}><h4>Athletes on plan</h4><div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)" }}>{athletes.length}</div><small style={{ color: "var(--muted)" }}>{totalActivitiesLabel(activities)}</small></div>
        <div className={`${styles.detailPanel} panelBox`}><h4>Overall completion</h4><div style={{ fontSize: 26, fontWeight: 800, color: percentColor(overallCompletion) }}>{overallCompletion}%</div><small style={{ color: "var(--muted)" }}>Across planned activities</small></div>
        <div className={`${styles.detailPanel} panelBox`}><h4>Duration</h4><div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)" }}>{plan.durationDays ? `${plan.durationDays}d` : plan.durationWeeks ? `${plan.durationWeeks}w` : "—"}</div><small style={{ color: "var(--muted)" }}>Plan length</small></div>
      </div>

      <div className="chartGrid" style={{ marginBottom: 16 }}>
        <div className={`${styles.detailPanel} panelBox`}>
          <h4>Completion rate by athlete <small style={{ color: "var(--muted)", fontWeight: 400 }}>(green ≥ 80%, yellow ≥ 50%, red &lt; 50%)</small></h4>
          {perAthlete.length && perAthlete.some((r) => r.total > 0) ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(127,199,175,0.12)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#9db6c7", fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#9db6c7", fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip {...chartTooltip} formatter={(v) => [`${v}%`, "Completion"]} labelFormatter={(l, p) => p?.[0]?.payload?.full || l} cursor={{ fill: "rgba(45,212,168,0.08)" }} />
                <Bar dataKey="percent" radius={[4, 4, 0, 0]}>{barData.map((d) => <Cell key={d.full} fill={percentColor(d.percent)} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>No planned activities yet.</p>}
          {perAthlete.length > 20 && <small style={{ color: "var(--muted)" }}>Showing first 20 of {perAthlete.length} athletes.</small>}
        </div>
      </div>

      <div className="chartGrid" style={{ marginBottom: 16 }}>
        <div className={`${styles.detailPanel} panelBox`}>
          <h4>Activities by fitness dimension</h4>
          {fitnessDist.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={fitnessDist} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2}>
                  {fitnessDist.map((s) => <Cell key={s.key} fill={s.color} />)}
                </Pie>
                <Tooltip {...chartTooltip} formatter={(v, name) => [`${v} activities`, name]} />
                <Legend iconType="circle" wrapperStyle={{ color: "#9db6c7", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>No activities on this plan yet.</p>}
        </div>

        <div className={`${styles.detailPanel} panelBox`}>
          <h4>Weekly completion trend <small style={{ color: "var(--muted)", fontWeight: 400 }}>(done + partial ÷ planned)</small></h4>
          {weekly.some((w) => w.total > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={weekly} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(127,199,175,0.12)" strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fill: "#9db6c7", fontSize: 12 }} tickFormatter={(v) => `W${v}`} />
                <YAxis domain={[0, 100]} tick={{ fill: "#9db6c7", fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip {...chartTooltip} formatter={(v) => [`${v}%`, "Completion"]} labelFormatter={(l) => `Week ${l}`} cursor={{ stroke: "rgba(45,212,168,0.4)" }} />
                <Line type="monotone" dataKey="percent" name="Completion" stroke="#2dd4a8" strokeWidth={2} dot={{ fill: "#2dd4a8", r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>No planned activities yet.</p>}
        </div>
      </div>

      <div className={`${styles.detailPanel} panelBox`}>
        <div className="drillHead">
          <h4 style={{ margin: 0 }}>Per-athlete drill-down</h4>
          <label style={{ minWidth: 220 }}>Athlete
            <select value={focusAthleteId || ""} onChange={(e) => setFocusAthleteId(Number(e.target.value))} className={styles.fieldControl}>
              {perAthlete.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
            </select>
          </label>
        </div>
        {focus && focus.total > 0 ? (
          <div className="chartGrid">
            <div className={`${styles.detailPanel} panelBox`}>
              <h4>Fitness balance <small style={{ color: "var(--muted)", fontWeight: 400 }}>{focus.name}</small></h4>
              {radarData.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(127,199,175,0.2)" />
                    <PolarAngleAxis dataKey="fitness" tick={{ fill: "#9db6c7", fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "#9db6c7", fontSize: 10 }} tickCount={5} />
                    <Radar name="Completion" dataKey="value" stroke="#2dd4a8" fill="#2dd4a8" fillOpacity={0.35} />
                    <Tooltip {...chartTooltip} formatter={(v) => [`${v}%`, "Completion"]} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : <p className={styles.empty}>No fitness data for this athlete yet.</p>}
            </div>
            <div className={`${styles.detailPanel} panelBox`}>
              <h4>Activity completion <small style={{ color: "var(--muted)", fontWeight: 400 }}>{focus.name}</small></h4>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={focus.byActivity} layout="vertical" margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(127,199,175,0.12)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: "#9db6c7", fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" width={170} tick={{ fill: "#9db6c7", fontSize: 12 }} />
                  <Tooltip {...chartTooltip} formatter={(v) => [`${v}%`, "Completion"]} cursor={{ fill: "rgba(45,212,168,0.08)" }} />
                  <Bar dataKey="percent" radius={[0, 4, 4, 0]}>{focus.byActivity.map((act) => <Cell key={act.id} fill={percentColor(act.percent)} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
              {focus.byActivity.length > 10 && <small style={{ color: "var(--muted)" }}>Showing all {focus.byActivity.length} activities.</small>}
            </div>
          </div>
        ) : (
          <p className={styles.empty}>{focus ? `${focus.name} has no planned activities yet.` : "No athletes on this plan."}</p>
        )}
      </div>
    </div>
  );
}

function totalActivitiesLabel(activities) {
  return `${activities.length} planned activit${activities.length === 1 ? "y" : "ies"}`;
}

function commentAuthorName(author) {
  if (!author) return "Admin";
  if (author.coach?.firstName || author.coach?.lastName) return `${author.coach.firstName} ${author.coach.lastName}`.trim();
  return author.username || author.email || "Admin";
}

function AthleteGuidanceRow({ planId, athlete, isAdmin }) {
  const [open, setOpen] = React.useState(false);
  const [comments, setComments] = React.useState(null);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  async function load() {
    const res = await fetch(`/api/training-plans/${planId}/athlete/${athlete.id}/comments`).then((r) => r.json()).catch(() => ({}));
    setComments(Array.isArray(res.comments) ? res.comments : []);
  }

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next && comments === null) load();
      return next;
    });
  }

  async function post(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setMsg("");
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const res = await fetch(`/api/training-plans/${planId}/athlete/${athlete.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify({ body: draft.trim() }),
    }).then((r) => r.json()).catch(() => ({}));
    setBusy(false);
    if (res.comment) {
      setDraft("");
      setComments((c) => [...(c || []), res.comment]);
    } else {
      setMsg(res.error || "Could not post guidance.");
    }
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", background: "rgba(6,38,30,.35)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <strong>{athlete.lastName}, {athlete.firstName}</strong>
          {athlete.athleteCode ? <small style={{ color: "var(--muted)", display: "block" }}>{athlete.athleteCode}</small> : null}
        </div>
        <button type="button" className={styles.secondary} onClick={toggle}>{open ? "Close" : comments === null ? "View guidance" : `Guidance (${comments.length})`}</button>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid rgba(26,92,74,.5)", marginTop: 12, paddingTop: 12 }}>
          {comments === null ? <p className={styles.empty}>Loading guidance...</p> : comments.length === 0 ? <p className={styles.empty}>No guidance yet for {athlete.firstName}.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
              {comments.map((c) => (
                <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", background: "rgba(6,38,30,.4)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <strong style={{ fontSize: 13 }}>{commentAuthorName(c.author)}</strong>
                    <small style={{ color: "var(--muted)" }}>{fmtDate(c.createdAt)}</small>
                  </div>
                  <p style={{ margin: 0 }}>{c.body}</p>
                </div>
              ))}
            </div>
          )}
          {isAdmin && (
            <form onSubmit={post} className={styles.formStack} style={{ margin: 0 }}>
              <label>Add guidance for {athlete.firstName}</label>
              <textarea className={styles.fieldControl} rows="2" maxLength="2000" placeholder="e.g. Focus on form before adding load; watch the knee." value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className={styles.primary} disabled={busy || !draft.trim()}>{busy ? "Posting..." : "Post guidance"}</button>
                {msg && <small style={{ color: "var(--danger)" }}>{msg}</small>}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

