import React from "react";
import { METRIC_TYPES, METRIC_LABELS } from "../lib/activity-score";
import styles from "../styles/Dashboard.module.css";

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

function computeProgress(activity, log) {
  if (!log) return null;
  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  let done = null;
  let target = null;
  const lowerBetter = activity.metricType === "time";
  if (activity.metricType === "time" && activity.targetTimeSec != null) {
    done = log.timeSec != null ? toNum(log.timeSec) : null;
    target = toNum(activity.targetTimeSec);
  } else if (activity.targetQuantity != null) {
    done = toNum(log.quantityDone);
    target = toNum(activity.targetQuantity);
  } else if (activity.targetDistance != null) {
    done = lowerBetter ? (log.timeSec != null ? toNum(log.timeSec) : null) : toNum(log.quantityDone);
    target = toNum(activity.targetDistance);
  } else if (activity.targetSets != null) {
    done = log.setsDone != null ? toNum(log.setsDone) : null;
    target = toNum(activity.targetSets);
  } else if (activity.targetReps != null) {
    done = log.repsDone != null ? toNum(log.repsDone) : null;
    target = toNum(activity.targetReps);
  }
  if (done == null || target == null || target <= 0 || (lowerBetter && done <= 0)) return null;
  const ratio = lowerBetter ? target / done : done / target;
  const percent = Math.round(Math.min(100, Math.max(0, ratio * 100)));
  return { percent, done, target };
}

function logResultText(log) {
  if (!log) return "";
  const parts = [];
  if (log.timeSec != null) parts.push(`${log.timeSec} sec`);
  if (log.distanceDone != null) parts.push(`${log.distanceDone} m`);
  if (log.loadUsed != null) parts.push(`${log.loadUsed} kg`);
  if (log.quantityDone != null) parts.push(`${log.quantityDone}${log.activity?.targetUnit ? ` ${log.activity.targetUnit}` : ""}`);
  if (log.setsDone != null) parts.push(`${log.setsDone} sets`);
  if (log.repsDone != null) parts.push(`${log.repsDone} reps`);
  if (log.attempts != null) parts.push(`${log.attempts} attempts`);
  return parts.join(" · ");
}

export function AthleteActivitiesBlock({ planId, athlete, activities, logs, onRemove, onEdit, onChanged, readOnly = false }) {
  const [adding, setAdding] = React.useState(false);
  const [showActivities, setShowActivities] = React.useState(true);
  const [editingId, setEditingId] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  function startEdit(act) {
    setDraft({
      id: act.id,
      activityName: act.activityName,
      fitnessType: act.fitnessType,
      metricType: act.metricType || "none",
      targetTimeSec: act.targetTimeSec != null ? String(act.targetTimeSec) : "",
      targetQuantity: act.targetQuantity != null ? String(act.targetQuantity) : "",
      targetUnit: act.targetUnit || "",
      targetSets: act.targetSets != null ? String(act.targetSets) : "",
      targetReps: act.targetReps != null ? String(act.targetReps) : "",
      targetDistance: act.targetDistance != null ? String(act.targetDistance) : "",
      targetLoad: act.targetLoad != null ? String(act.targetLoad) : "",
      instructions: act.instructions || "",
      dayIndex: act.dayIndex != null ? String(act.dayIndex) : "",
      weekNumber: act.weekNumber != null ? String(act.weekNumber) : "",
    });
    setEditingId(act.id);
  }

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

  function submitEdit(e) {
    e.preventDefault();
    setSaving(true);
    onEdit(draft.id, {
      activityName: draft.activityName,
      fitnessType: draft.fitnessType,
      metricType: draft.metricType,
      targetTimeSec: draft.metricType === "time" ? draft.targetTimeSec || null : null,
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
    setEditingId(null);
    setSaving(false);
  }

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
                  const firstActivity = groupActs[0];
                  const latestLogs = groupActs.map((a) => {
                    const aLogs = logs.filter((l) => l.activityId === a.id && l.athleteId === athlete.id);
                    return aLogs.length ? [...aLogs].sort((a2, b) => new Date(b.performedAt) - new Date(a2.performedAt))[0] : null;
                  });
                  const latest = latestLogs.length ? [...latestLogs].filter(Boolean).sort((a2, b) => new Date(b.performedAt) - new Date(a2.performedAt))[0] : null;
                  const p = latest ? computeProgress(firstActivity, latest) : null;
                  const meta = LOG_STATUS[latest?.status] || LOG_STATUS.planned;
                  const targetText = (() => {
                    if (firstActivity.metricType === "time" && firstActivity.targetTimeSec != null) return `${firstActivity.targetTimeSec} sec (time)`;
                    if (firstActivity.targetQuantity != null) return `${firstActivity.targetQuantity}${firstActivity.targetUnit ? ` ${firstActivity.targetUnit}` : ""}`;
                    if (firstActivity.targetDistance != null) return `${firstActivity.targetDistance} m`;
                    return "—";
                  })();
                  const isEditing = editingId === firstActivity.id;
                  return (
                    <React.Fragment key={fitnessType}>
                      <tr>
                        <td data-label="Fitness Type">
                          <span className={styles.badge} style={{ background: "rgba(45,212,168,.16)", color: "var(--accent)" }}>{FITNESS_META[fitnessType] || fitnessType}</span>
                        </td>
                        <td data-label="Target">{targetText}</td>
                        <td data-label="Latest status" style={{ textAlign: "center" }}>
                          {(() => {
                            if (!latest) return <span className={styles.badge} style={{ background: "rgba(26,92,74,.08)", color: "var(--muted)", border: "1px dashed rgba(100,116,139,.3)", fontSize: "11px" }}>Not started</span>;
                            return (
                              <span title={`${fmtDate(latest.performedAt)}${logResultText(latest) ? ` · ${logResultText(latest)}` : ""}`} className={`${styles.badge} ${styles[meta.cls]}`} style={{ fontSize: "11px" }}>
                                {meta.label}
                                <small style={{ marginLeft: 6, opacity: 0.7 }}>{fmtDate(latest.performedAt)}</small>
                              </span>
                            );
                          })()}
                        </td>
                        {!readOnly && <td><button className={`${styles.secondary} ${styles.btnSm}`} onClick={() => { if (isEditing) setEditingId(null); else startEdit(firstActivity); }} style={{ padding: "4px 8px", fontSize: "12px" }}>{isEditing ? "Cancel" : "Edit"}</button> <button className={`${styles.danger} ${styles.btnSm}`} onClick={() => onRemove(firstActivity.id)}>Remove</button></td>}
                      </tr>
                      {isEditing && draft && (
                        <tr><td colSpan="4" style={{ padding: 0, background: "transparent" }}>
                          <div className={styles.detailPanel}>
                            <form onSubmit={submitEdit} className={styles.formGrid} style={{ marginTop: 0 }}>
                              <label className={styles.fullField}>Activity name *<input className={styles.fieldControl} value={draft.activityName} onChange={(e) => setField("activityName", e.target.value)} required maxLength="191" /></label>
                              <label>Fitness dimension<select className={styles.fieldControl} value={draft.fitnessType} onChange={(e) => setField("fitnessType", e.target.value)}>{Object.keys(FITNESS_META).map((k) => <option key={k} value={k}>{FITNESS_META[k]}</option>)}</select></label>
                              <label>What to measure<select className={styles.fieldControl} value={draft.metricType} onChange={(e) => setField("metricType", e.target.value)} title="How this activity is measured. Time = how fast.">{METRIC_TYPES.map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}</select></label>
                              {draft.metricType === "time" && <label>Time target (seconds)<input className={styles.fieldControl} type="number" min="0" step="any" value={draft.targetTimeSec} onChange={(e) => setField("targetTimeSec", e.target.value)} placeholder="e.g. 60" /></label>}
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
                                <button type="button" className={styles.secondary} onClick={() => setEditingId(null)} disabled={saving}>Cancel</button>
                                <button className={styles.primary} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
                              </div>
                            </form>
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
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

export function AddAthleteActivitiesForm({ planId, athlete, onCreated }) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [rows, setRows] = React.useState([{ id: 0, name: "", fitness: "endurance", metric: "none", tsec: "", qty: "", unit: "", sets: "", reps: "", dist: "", load: "", instr: "", day: "", week: "" }]);

  function addRow() {
    setRows((cur) => [...cur, { id: Date.now(), name: "", fitness: "endurance", metric: "none", tsec: "", qty: "", unit: "", sets: "", reps: "", dist: "", load: "", instr: "", day: "", week: "" }]);
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
      metricType: r.metric,
      targetTimeSec: r.metric === "time" ? r.tsec || null : null,
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
      if (response.ok && !result.error) { setRows([{ id: 0, name: "", fitness: "endurance", metric: "none", tsec: "", qty: "", unit: "", sets: "", reps: "", dist: "", load: "", instr: "", day: "", week: "" }]); onCreated(); return; }
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
                <label style={{ flex: "1 1 150px" }}>What to measure<select value={r.metric} onChange={(e) => updateRow(r.id, "metric", e.target.value)} title="How this activity is measured. Time = how fast.">{METRIC_TYPES.map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}</select></label>
                {r.metric === "time" && <label style={{ flex: "0 1 120px" }}>Time target (sec)<input value={r.tsec} onChange={(e) => updateRow(r.id, "tsec", e.target.value)} type="number" min="0" step="any" placeholder="e.g. 60" /></label>}
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