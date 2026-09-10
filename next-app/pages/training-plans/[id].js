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
            <p className={styles.formHint} style={{ marginTop: 0 }}>Score everyone on the plan in one pass: set status for each athlete&apos;s activity, then save once with an optional 1&ndash;10 rating per athlete. Untouched cells are skipped; existing records are preserved until you save.</p>
            {showBulkAssess && (
              <AssessStudio planId={plan.id} athletes={athletes} activities={activities} logs={logs} onDone={refresh} />
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

const TARGET_FIELD_RULES = {
  endurance: { quantity: true, sets: false, reps: false, distance: true, load: false },
  strength: { quantity: true, sets: true, reps: true, distance: false, load: true },
  power: { quantity: true, sets: true, reps: true, distance: false, load: true },
  speed_agility: { quantity: true, sets: true, reps: true, distance: true, load: false },
  skill_technique: { quantity: true, sets: true, reps: true, distance: false, load: false },
  mobility: { quantity: true, sets: true, reps: true, distance: false, load: false },
  recovery: { quantity: true, sets: false, reps: false, distance: false, load: false },
};

function targetFieldRules(fitnessType) {
  return TARGET_FIELD_RULES[fitnessType] || { quantity: true, sets: true, reps: true, distance: false, load: false };
}

function sanitizeTargetFields(fitnessType, fields) {
  const rules = targetFieldRules(fitnessType);
  const out = { ...fields };
  if (!rules.sets) out.targetSets = null;
  if (!rules.reps) out.targetReps = null;
  if (!rules.distance) out.targetDistance = null;
  if (!rules.load) out.targetLoad = null;
  return out;
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
            <thead><tr><th>Fitness Type</th><th>Target</th><th>Latest status</th>{!readOnly && <th></th>}</tr></thead>
            <tbody>
              {(() => {
                const grouped = activities.reduce((acc, act) => {
                  const ft = act.fitnessType || "endurance";
                  if (!acc[ft]) acc[ft] = [];
                  acc[ft].push(act);
                  return acc;
                }, {});
                return Object.entries(grouped).map(([fitnessType, groupActs]) => {
                  const latestLogs = groupActs.map((a) => {
                    const aLogs = logs.filter((l) => l.activityId === a.id && l.athleteId === athlete.id);
                    return aLogs.length ? [...aLogs].sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt))[0] : null;
                  });
                  const latest = latestLogs.length ? [...latestLogs].sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt))[0] : null;
                  const p = latest ? computeProgress(groupActs[0], latest) : null;
                  const meta = LOG_STATUS[latest?.status] || LOG_STATUS.planned;
                  const targetText = groupActs[0].targetQuantity != null ? `${groupActs[0].targetQuantity}${groupActs[0].targetUnit ? ` ${groupActs[0].targetUnit}` : ""}` : groupActs[0].targetDistance != null ? `${groupActs[0].targetDistance} m` : "—";
                  return (
                    <tr key={fitnessType}>
                      <td>
                        <span className={styles.badge} style={{ background: "rgba(45,212,168,.16)", color: "var(--accent)" }}>{FITNESS_META[fitnessType] || fitnessType}</span>
                      </td>
                      <td>{targetText}</td>
                      <td>
                        {(() => {
                          if (!latest) return <span style={{ color: "var(--muted)", fontSize: "12px" }}>Not logged</span>;
                          return (
                            <span title={`${fmtDate(latest.performedAt)}${latest.quantityDone != null ? ` · ${latest.quantityDone}${latest.activity?.targetUnit ? ` ${latest.activity.targetUnit}` : ""}` : ""}`} className={`${styles.badge} ${styles[meta.cls]}`} style={{ fontSize: "11px" }}>
                              {meta.label}
                              <small style={{ marginLeft: 6, opacity: 0.7 }}>{fmtDate(latest.performedAt)}</small>
                            </span>
                          );
                        })()}
                      </td>
                      {!readOnly && <td><button className={`${styles.secondary} ${styles.btnSm}`} onClick={() => { if (editing) setEditing(false); else startEdit(); }} style={{ padding: "4px 8px", fontSize: "12px" }}>{editing ? "Cancel" : "Edit"}</button> <button className={`${styles.danger} ${styles.btnSm}`} onClick={() => onRemove(groupActs[0].id)}>Remove</button></td>}
                    </tr>
                  );
                });
              })()}
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
        const rules = targetFieldRules(value);
        if (!rules.sets) next.targetSets = "";
        if (!rules.reps) next.targetReps = "";
        if (!rules.distance) next.targetDistance = "";
        if (!rules.load) next.targetLoad = "";
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
          {(() => {
            if (!latestLog) return <span style={{ color: "var(--muted)", fontSize: "12px" }}>Not logged</span>;
            const meta = LOG_STATUS[latestLog.status] || LOG_STATUS.planned;
            const p = computeProgress(activity, latestLog);
            const title = `${fmtDate(latestLog.performedAt)}${latestLog.quantityDone != null ? ` · ${latestLog.quantityDone}${latestLog.activity?.targetUnit ? ` ${latestLog.activity.targetUnit}` : ""}` : ""}`;
            if (!p) {
              return (
                <span title={title} className={`${styles.badge} ${styles[meta.cls]}`} style={{ fontSize: "11px" }}>
                  {meta.label}
                  <small style={{ marginLeft: 6, opacity: 0.7 }}>{fmtDate(latestLog.performedAt)}</small>
                </span>
              );
            }
            return (
              <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <strong style={{ color: percentColor(p.percent), fontSize: 14 }}>{p.percent}%</strong>
                <small style={{ opacity: 0.75, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>{meta.label}</small>
              </span>
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
              {targetFieldRules(draft.fitnessType).quantity && <>
                <label>Target quantity<input className={styles.fieldControl} type="number" min="0" step="any" value={draft.targetQuantity} onChange={(e) => setField("targetQuantity", e.target.value)} placeholder="e.g. 20" /></label>
                <label>Target unit<select className={styles.fieldControl} value={draft.targetUnit} onChange={(e) => setField("targetUnit", e.target.value)}><option value="">— select —</option>{(UNITS_BY_FITNESS[draft.fitnessType] || []).map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
              </>}
              {targetFieldRules(draft.fitnessType).sets && <label>Sets<input className={styles.fieldControl} type="number" min="0" value={draft.targetSets} onChange={(e) => setField("targetSets", e.target.value)} /></label>}
              {targetFieldRules(draft.fitnessType).reps && <label>Reps<input className={styles.fieldControl} type="number" min="0" value={draft.targetReps} onChange={(e) => setField("targetReps", e.target.value)} /></label>}
              {targetFieldRules(draft.fitnessType).distance && <label>Distance (m)<input className={styles.fieldControl} type="number" min="0" step="any" value={draft.targetDistance} onChange={(e) => setField("targetDistance", e.target.value)} /></label>}
              {targetFieldRules(draft.fitnessType).load && <label>Load (kg)<input className={styles.fieldControl} type="number" min="0" step="any" value={draft.targetLoad} onChange={(e) => setField("targetLoad", e.target.value)} /></label>}
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
        const fRules = targetFieldRules(value);
        if (!fRules.sets) next.sets = "";
        if (!fRules.reps) next.reps = "";
        if (!fRules.distance) next.dist = "";
        if (!fRules.load) next.load = "";
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
          const fRules = targetFieldRules(r.fitness);
          return (
            <div key={r.id} className={styles.fullField} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong style={{ fontSize: 13 }}>Activity {rows.indexOf(r) + 1}</strong>
                {rows.length > 1 && <button type="button" className={`${styles.danger} ${styles.btnSm}`} onClick={() => removeRow(r.id)}>Remove</button>}
              </div>
              <label className={styles.fullField} style={{ marginBottom: 8 }}>Name *<input value={r.name} onChange={(e) => updateRow(r.id, "name", e.target.value)} maxLength="191" placeholder="e.g. Endurance run" /></label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <label style={{ flex: "1 1 150px" }}>Fitness type<select value={r.fitness} onChange={(e) => updateRow(r.id, "fitness", e.target.value)}>{Object.keys(FITNESS_META).map((k) => <option key={k} value={k}>{FITNESS_META[k]}</option>)}</select></label>
                {fRules.quantity && <label style={{ flex: "0 1 110px" }}>Quantity<input value={r.qty} onChange={(e) => updateRow(r.id, "qty", e.target.value)} type="number" min="0" step="any" placeholder="e.g. 1" /></label>}
                {fRules.quantity && <label style={{ flex: "0 1 120px" }}>Unit<select value={r.unit} onChange={(e) => updateRow(r.id, "unit", e.target.value)}><option value="">— select —</option>{allowedUnits.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>}
                {fRules.sets && <label style={{ flex: "0 1 90px" }}>Sets<input value={r.sets} onChange={(e) => updateRow(r.id, "sets", e.target.value)} type="number" min="0" /></label>}
                {fRules.reps && <label style={{ flex: "0 1 90px" }}>Reps<input value={r.reps} onChange={(e) => updateRow(r.id, "reps", e.target.value)} type="number" min="0" /></label>}
                {fRules.distance && <label style={{ flex: "0 1 100px" }}>Dist (m)<input value={r.dist} onChange={(e) => updateRow(r.id, "dist", e.target.value)} type="number" min="0" step="any" /></label>}
                {fRules.load && <label style={{ flex: "0 1 90px" }}>Load (kg)<input value={r.load} onChange={(e) => updateRow(r.id, "load", e.target.value)} type="number" min="0" step="any" /></label>}
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


function AssessStudio({ planId, athletes, activities, logs, onDone }) {
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [dayFilter, setDayFilter] = React.useState("all");
  const [cells, setCells] = React.useState({});
  const [ratings, setRatings] = React.useState({});
  const [openRatingId, setOpenRatingId] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const undoRef = React.useRef(null);

  const key = (aid, actId) => `${aid}:${actId}`;

  const byAthlete = React.useMemo(() => {
    const out = {};
    for (const a of activities) { (out[a.athleteId] = out[a.athleteId] || []).push(a); }
    return out;
  }, [activities]);

  const latestByKey = React.useMemo(() => {
    const map = {};
    for (const l of logs) {
      const k = `${l.athleteId}:${l.activityId}`;
      if (!map[k] || new Date(l.performedAt) > new Date(map[k].performedAt)) map[k] = l;
    }
    return map;
  }, [logs]);

  function visibleActivities(athleteId) {
    const all = byAthlete[athleteId] || [];
    if (dayFilter === "all") return all;
    return all.filter((a) => a.dayIndex == null || a.dayIndex === Number(dayFilter));
  }

  const columns = (() => {
    const out = [];
    const seen = new Set();
    for (const athlete of athletes) {
      for (const activity of visibleActivities(athlete.id)) {
        if (seen.has(activity.id)) continue;
        seen.add(activity.id);
        out.push(activity);
      }
    }
    return out;
  })();

  function effective(athleteId, activityId, field) {
    const c = cells[key(athleteId, activityId)];
    if (c) return field === "status" ? c.status : c[field] != null ? c[field] : null;
    const l = latestByKey[key(athleteId, activityId)];
    if (!l) return null;
    if (field === "status") return l.status;
    if (field === "qty") return l.quantityDone != null ? Number(l.quantityDone) : null;
    if (field === "sets") return l.setsDone != null ? Number(l.setsDone) : null;
    if (field === "reps") return l.repsDone != null ? Number(l.repsDone) : null;
    if (field === "note") return l.notes || null;
    return null;
  }

  function targetOf(activity) {
    const toNum = (v) => (v == null ? null : Number(v));
    if (activity.targetQuantity != null) return { n: toNum(activity.targetQuantity), unit: activity.targetUnit, kind: "qty" };
    if (activity.targetDistance != null) return { n: toNum(activity.targetDistance), unit: "m", kind: "qty" };
    if (activity.targetSets != null) return { n: toNum(activity.targetSets), unit: "sets", kind: "sets" };
    if (activity.targetReps != null) return { n: toNum(activity.targetReps), unit: "reps", kind: "reps" };
    return null;
  }

  function autoStatusFor(activity, value) {
    const t = targetOf(activity);
    if (!t || t.kind !== "qty" || value == null || value === "") return null;
    const q = Number(value);
    if (!Number.isFinite(q) || q < 0 || t.n <= 0) return null;
    const ratio = q / t.n;
    return ratio >= 0.9 ? "done" : ratio >= 0.5 ? "partial" : "missed";
  }

  function setCell(athleteId, activityId, patch) {
    const k = key(athleteId, activityId);
    setCells((cur) => ({ ...cur, [k]: { touched: true, status: null, qty: "", sets: "", reps: "", note: "", ...cur[k], ...patch } }));
  }

  function cycleStatus(athleteId, activityId, activity) {
    const current = effective(athleteId, activityId, "status");
    const next = current === "done" ? "partial" : current === "partial" ? "missed" : "done";
    const patch = { status: next };
    if (next === "done") {
      const t = targetOf(activity);
      if (t && t.kind === "qty") patch.qty = t.n;
    }
    setCell(athleteId, activityId, patch);
  }

  function clearCell(athleteId, activityId) {
    const k = key(athleteId, activityId);
    setCells((cur) => { const n = { ...cur }; delete n[k]; return n; });
  }

  function onQty(athleteId, activityId, activity, value) {
    const patch = { qty: value };
    const auto = autoStatusFor(activity, value);
    if (auto) patch.status = auto;
    setCell(athleteId, activityId, patch);
  }

  function applyPreset(athleteId, preset) {
    const acts = visibleActivities(athleteId);
    setCells((cur) => {
      const n = { ...cur };
      for (const a of acts) {
        const t = targetOf(a);
        const prevLog = latestByKey[key(athleteId, a.id)];
        if (preset === "copy" && !prevLog) continue;
        if (preset === "copy") {
          n[key(athleteId, a.id)] = { touched: true, status: prevLog.status || "done", qty: prevLog.quantityDone != null ? Number(prevLog.quantityDone) : "", sets: prevLog.setsDone != null ? Number(prevLog.setsDone) : "", reps: prevLog.repsDone != null ? Number(prevLog.repsDone) : "", note: prevLog.notes || "" };
          continue;
        }
        const cell = { touched: true, status: preset === "full" ? "done" : preset === "light" ? "partial" : "missed", qty: "", sets: "", reps: "", note: "" };
        if (preset === "full" && t) {
          if (t.kind === "qty") cell.qty = t.n;
          else if (t.kind === "sets") cell.sets = t.n;
          else cell.reps = t.n;
        }
        if (preset === "light" && t && t.kind === "qty") cell.qty = Math.max(0, Math.round(t.n * 0.5));
        n[key(athleteId, a.id)] = cell;
      }
      return n;
    });
  }

  function applyColumn(activity, status) {
    setCells((cur) => {
      const n = { ...cur };
      for (const athlete of athletes) {
        if (!(byAthlete[athlete.id] || []).some((a) => a.id === activity.id)) continue;
        const t = targetOf(activity);
        const cell = { touched: true, status, qty: "", sets: "", reps: "", note: "" };
        if (status === "done" && t && t.kind === "qty") cell.qty = t.n;
        n[key(athlete.id, activity.id)] = cell;
      }
      return n;
    });
  }

  function setRating(athleteId, patch) {
    setRatings((cur) => ({ ...cur, [athleteId]: { rating: null, comments: "", ...cur[athleteId], ...patch } }));
  }

  function suggestRating(athleteId) {
    const statuses = (byAthlete[athleteId] || []).map((a) => cells[key(athleteId, a.id)] && cells[key(athleteId, a.id)].status).filter(Boolean);
    if (!statuses.length) return null;
    const score = statuses.reduce((sum, s) => sum + (s === "done" ? 1 : s === "partial" ? 0.6 : 0.2), 0) / statuses.length;
    return Math.max(1, Math.min(10, Math.round(score * 10)));
  }

  function summary() {
    const done = Object.values(cells).filter((c) => c.status === "done").length;
    const partial = Object.values(cells).filter((c) => c.status === "partial").length;
    const missed = Object.values(cells).filter((c) => c.status === "missed").length;
    const athletesCount = new Set(Object.keys(cells).map((k) => k.split(":")[0])).size;
    const rated = Object.values(ratings).filter((r) => r.rating).length;
    return { done, partial, missed, athletes: athletesCount, rated };
  }

  function buildPayload() {
    const rows = Object.keys(cells).map((k) => {
      const [aid, actId] = k.split(":");
      const c = cells[k];
      return { athleteId: Number(aid), activityId: Number(actId), status: c.status, quantityDone: c.qty !== "" ? c.qty : null, setsDone: c.sets !== "" ? c.sets : null, repsDone: c.reps !== "" ? c.reps : null, notes: c.note || null };
    });
    const assessments = Object.keys(ratings).filter((aid) => ratings[aid].rating).map((aid) => ({ athleteId: Number(aid), rating: ratings[aid].rating, comments: ratings[aid].comments || null }));
    return { rows, assessments };
  }

  async function save() {
    const payload = buildPayload();
    if (!payload.rows.length && !payload.assessments.length) { setToast({ kind: "info", text: "Nothing to save yet." }); return; }
    if (!confirm) {
      const s = summary();
      setConfirm({ ...s });
      return;
    }
    setBusy(true); setConfirm(null);
    undoRef.current = { date, rows: {}, hasRatings: payload.assessments.length > 0 };
    for (const k of Object.keys(cells)) {
      const prevLog = latestByKey[k];
      undoRef.current.rows[k] = prevLog ? { status: prevLog.status, qty: prevLog.quantityDone != null ? Number(prevLog.quantityDone) : null, sets: prevLog.setsDone != null ? Number(prevLog.setsDone) : null, reps: prevLog.repsDone != null ? Number(prevLog.repsDone) : null, note: prevLog.notes || null } : null;
    }
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/plan-activity-logs/batch-assess", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ planId, performedAt: date, rows: payload.rows, assessments: payload.assessments }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success) {
        setToast({ kind: "success", text: `Saved ${result.logged} activit${result.logged === 1 ? "y" : "ies"}${result.ratings ? ` and ${result.ratings} rating${result.ratings === 1 ? "" : "s"}` : ""} across ${result.athletes} athlete${result.athletes === 1 ? "" : "s"}`, undo: true });
        onDone();
      } else { setToast({ kind: "error", text: result.error || "Could not save the assessment." }); }
    } catch (e) { setToast({ kind: "error", text: "Unable to reach the server." }); }
    setBusy(false);
  }

  async function undo() {
    const snap = undoRef.current;
    if (!snap || busy) return;
    const rows = Object.keys(snap.rows)
      .map((k) => {
        const [aid, actId] = k.split(":");
        const prev = snap.rows[k];
        return prev ? { athleteId: Number(aid), activityId: Number(actId), status: prev.status, quantityDone: prev.qty != null ? prev.qty : null, setsDone: prev.sets != null ? prev.sets : null, repsDone: prev.reps != null ? prev.reps : null, notes: prev.note || null } : { athleteId: Number(aid), activityId: Number(actId), status: null };
      })
      .filter((r) => r);
    setCells((cur) => {
      const n = { ...cur };
      for (const k of Object.keys(snap.rows)) {
        const prev = snap.rows[k];
        if (!prev) { delete n[k]; continue; }
        n[k] = { touched: true, status: prev.status, qty: prev.qty != null ? prev.qty : "", sets: prev.sets != null ? prev.sets : "", reps: prev.reps != null ? prev.reps : "", note: prev.note || "" };
      }
      return n;
    });
    setBusy(true);
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/plan-activity-logs/batch-assess", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ planId, performedAt: snap.date || new Date().toISOString().slice(0, 10), rows, assessments: [] }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success) { setToast({ kind: "info", text: "Undone — previous activity statuses restored. Saved rating rows are kept (you can clear them in the rating row)." }); onDone(); }
      else { setToast({ kind: "error", text: result.error || "Could not undo." }); }
    } catch (e) { setToast({ kind: "error", text: "Unable to reach the server." }); }
    setBusy(false); undoRef.current = null;
  }

  function latestAthleteDate(athleteId) {
    let best = null;
    for (const l of logs) {
      if (l.athleteId !== athleteId) continue;
      if (!best || new Date(l.performedAt) > new Date(best)) best = l.performedAt;
    }
    return best;
  }

  if (!athletes.length) return <p className={styles.empty}>No athletes on this plan to assess.</p>;

  return (
    <div>
      <style jsx>{`
        .studioBar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
        .mkWrap { overflow: auto; border: 1px solid rgba(26,92,74,.55); border-radius: 10px; background: rgba(6,38,30,.25); max-height: 560px; }
        .mkTable { border-collapse: collapse; min-width: 100%; font-size: 12px; }
        .mkTable th, .mkTable td { border-bottom: 1px solid rgba(26,92,74,.45); padding: 6px 8px; text-align: left; vertical-align: middle; }
        .mkTable tbody tr:last-child td { border-bottom: none; }
        .mkTable thead th { position: sticky; top: 0; background: #0a3228; z-index: 2; }
        .mkTable th.fix, .mkTable td.fix { position: sticky; left: 0; background: #0d3d31; z-index: 1; min-width: 185px; }
        .mkTable thead th.fix { z-index: 3; }
        .mkCell { display: flex; align-items: center; gap: 4px; flex-wrap: nowrap; }
        .dotBtn { width: 26px; height: 24px; border-radius: 6px; border: 1px solid var(--border); background: rgba(255,255,255,.04); color: var(--muted); font-size: 11px; font-weight: 700; cursor: pointer; transition: .12s; flex: 0 0 auto; }
        .dotBtn:hover { border-color: rgba(45,212,168,.6); color: var(--foreground); }
        .dotBtn.on { background: rgba(45,212,168,.2); color: var(--accent); border-color: rgba(45,212,168,.5); }
        .dotBtn.part { background: rgba(255,193,7,.18); color: #ffc107; border-color: rgba(255,193,7,.45); }
        .dotBtn.miss { background: rgba(248,113,113,.16); color: #f87171; border-color: rgba(248,113,113,.45); }
        .dotBtn.touchedD { outline: 1px solid rgba(45,212,168,.4); }
        .qtyIn { width: 56px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--border); background: rgba(255,255,255,.04); color: var(--foreground); font-size: 11px; }
        .rowHead { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
        .rowActions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
        .miniBtn { padding: 2px 6px; font-size: 10px; border-radius: 5px; border: 1px solid var(--border); background: rgba(255,255,255,.04); color: var(--muted); cursor: pointer; }
        .miniBtn:hover { color: var(--accent); border-color: rgba(45,212,168,.5); }
      `}</style>

      <div className="studioBar">
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={styles.fieldControl} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>Day
          <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} className={styles.fieldControl}>
            <option value="all">All days</option>
            {[1,2,3,4,5,6,7].map((d) => <option key={d} value={d}>Day {d}</option>)}
          </select>
        </label>
        <button className={styles.primary} disabled={busy} onClick={save}>{busy ? "Saving..." : "Save assessment"}</button>
        {toast && (
          <span role="status" style={{ color: toast.kind === "error" ? "var(--danger)" : toast.kind === "info" ? "var(--muted)" : "var(--accent)", fontSize: 12, lineHeight: 1.4 }}>
            {toast.text}
            {toast.undo && <button className={styles.secondary} style={{ marginLeft: 8, padding: "3px 8px", fontSize: 11 }} onClick={undo} disabled={busy}>Undo</button>}
          </span>
        )}
      </div>

      <p className={styles.formHint} style={{ marginTop: 0, marginBottom: 12 }}>Tap a cell&apos;s button to flip its status (D → P → M → open). Untouched cells are not part of the save. Type an amount and the status picks itself. Row buttons fill one athlete; the ✓ / ✗ buttons above each activity fill that activity for everyone.</p>

      {confirm && (
        <div style={{ border: "1px solid rgba(45,212,168,.5)", borderRadius: 10, padding: "12px 14px", background: "rgba(6,38,30,.5)", marginBottom: 12 }}>
          Save {confirm.athletes} athlete{confirm.athletes === 1 ? "" : "s"}: <strong style={{ color: "var(--accent)" }}>{confirm.done} done</strong>, <strong style={{ color: "#ffc107" }}>{confirm.partial} partial</strong>, <strong style={{ color: "#f87171" }}>{confirm.missed} missed</strong>{confirm.rated ? `, ${confirm.rated} rating${confirm.rated === 1 ? "" : "s"}` : ""} for {date}?
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}><button className={styles.primary} onClick={save} disabled={busy}>Confirm save</button><button className={styles.secondary} onClick={() => setConfirm(null)} disabled={busy}>Back</button></div>
        </div>
      )}

      <div className="mkWrap">
        <table className="mkTable">
          <thead>
            <tr>
              <th className="fix">Athlete</th>
              {columns.map((activity) => (
                <th key={activity.id} style={{ minWidth: 132 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <strong>{activity.activityName}</strong>
                    <small style={{ color: "var(--muted)", fontWeight: 400 }}>{FITNESS_META[activity.fitnessType] || activity.fitnessType}{activity.dayIndex ? ` · Day ${activity.dayIndex}` : ""}</small>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="miniBtn" title="Mark this activity Done for every athlete" onClick={() => applyColumn(activity, "done")}>✓ all</button>
                      <button className="miniBtn" title="Mark this activity Missed for every athlete" onClick={() => applyColumn(activity, "missed")}>✗ all</button>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {athletes.map((athlete) => {
              const lastDate = latestAthleteDate(athlete.id);
              return (
                <React.Fragment key={athlete.id}>
                  <tr>
                    <td className="fix">
                      <div className="rowHead">
                        <strong>{athlete.lastName}, {athlete.firstName}</strong>
                        <span className={`${styles.badge} ${styles.badgeMuted}`} style={{ fontSize: 9 }}>{lastDate ? `Assessed ${fmtDate(lastDate)}` : "Open"}</span>
                      </div>
                      <small style={{ color: "var(--muted)", display: "block" }}>{athlete.athleteCode}</small>
                      <div className="rowActions">
                        <button className="miniBtn" title="Mark all this athlete's shown activities as done" onClick={() => applyPreset(athlete.id, "full")}>Full</button>
                        <button className="miniBtn" title="Mark all partial at half target" onClick={() => applyPreset(athlete.id, "light")}>Light</button>
                        <button className="miniBtn" title="Mark all missed" onClick={() => applyPreset(athlete.id, "rest")}>Rest</button>
                        <button className="miniBtn" title="Start from this athlete's last assessment" onClick={() => applyPreset(athlete.id, "copy")}>Copy last</button>
                        <button className={`miniBtn ${openRatingId === athlete.id ? "on" : ""}`} onClick={() => setOpenRatingId(openRatingId === athlete.id ? null : athlete.id)}>Rating</button>
                      </div>
                    </td>
                    {columns.map((activity) => {
                      const has = (byAthlete[athlete.id] || []).some((a) => a.id === activity.id);
                      if (!has) return <td key={activity.id} />;
                      const status = effective(athlete.id, activity.id, "status");
                      const touched = !!cells[key(athlete.id, activity.id)];
                      const qty = effective(athlete.id, activity.id, "qty");
                      const target = targetOf(activity);
                      return (
                        <td key={activity.id}>
                          <span className="mkCell">
                            <button className={`dotBtn ${status === "done" ? "on" : status === "partial" ? "part" : status === "missed" ? "miss" : ""} ${touched ? "touchedD" : ""}`} title={status ? `Status: ${status === "done" ? "Done" : status === "partial" ? "Partial" : "Missed"}. Tap to change.` : "Open. Tap to mark Done."} onClick={() => cycleStatus(athlete.id, activity.id, activity)}>{status === "done" ? "D" : status === "partial" ? "P" : status === "missed" ? "M" : "–"}</button>
                            <input className="qtyIn" type="number" min="0" step="any" placeholder={target && target.unit ? `amt (${target.unit})` : "amt"} value={qty != null ? qty : ""} onChange={(e) => onQty(athlete.id, activity.id, activity, e.target.value)} />
                            {touched && <button className="miniBtn" title="Clear this cell (not part of the save)" onClick={() => clearCell(athlete.id, activity.id)}>✕</button>}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                  {openRatingId === athlete.id && (
                    <tr>
                      <td className="fix"><strong style={{ fontSize: 11 }}>Rating &amp; comment</strong></td>
                      <td colSpan={columns.length} style={{ padding: 0 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "10px 12px", alignItems: "center" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>Score
                            <select className={styles.fieldControl} value={ratings[athlete.id]?.rating || ""} onChange={(e) => setRating(athlete.id, { rating: e.target.value ? Number(e.target.value) : null })}>
                              <option value="">No score</option>
                              {[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n}/10</option>)}
                            </select>
                          </label>
                          {suggestRating(athlete.id) != null && (
                            <button className={styles.secondary} style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => setRating(athlete.id, { rating: suggestRating(athlete.id) })}>Use suggestion ({suggestRating(athlete.id)}/10)</button>
                          )}
                          <input className={styles.fieldControl} style={{ flex: "1 1 200px", minWidth: 160 }} value={ratings[athlete.id]?.comments || ""} onChange={(e) => setRating(athlete.id, { comments: e.target.value })} placeholder="Summary comment (optional)" />
                          <small style={{ color: "var(--muted)" }}>10 = exceeded · 7–8 = solid · 5–6 = partial · 1–4 = needs work</small>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
                            <div style={{ marginTop: 6, fontSize: 10, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 3 }}>
                              {dayData.activities.map(a => {
                                const p = computeProgress(a, a.log);
                                return (
                                  <div key={a.id} title={`${a.activityName}${p ? `: ${p.percent}% complete` : ""}`} style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: 170 }}>
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto", textAlign: "left" }}>{a.activityName}</span>
                                    {p ? (
                                      <strong style={{ color: percentColor(p.percent), flex: "0 0 auto" }}>{p.percent}%</strong>
                                    ) : (
                                      <span style={{ flex: "0 0 auto", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.8 }}>{a.log ? a.log.status : "open"}</span>
                                    )}
                                  </div>
                                );
                              })}
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

