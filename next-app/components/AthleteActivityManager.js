import React from "react";
import { resultFieldFor, resultUnitFor, targetValueFor } from "../lib/activity-score";
import { FITNESS_OPTIONS, allowedTargetKeysFor, defaultUnitFor, metricFieldsFor } from "../lib/training-metrics";
import styles from "../styles/Dashboard.module.css";

const ROW_TARGET_KEYS = ["targetTimeSec", "targetDistance", "targetLoad", "targetReps", "targetSets", "targetQuantity"];

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

/* Target text honoring the activity's own unit (e.g. kg/km/lb/sessions). */
function targetDisplay(activity) {
  const t = targetValueFor(activity);
  if (t == null) return "—";
  const unit = activity.targetUnit || resultUnitFor(activity.metricType) || "";
  return `${t}${unit ? ` ${unit}` : ""}`;
}

function computeProgress(activity, log) {
  if (!log) return null;
  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const field = resultFieldFor(activity.metricType);
  let target = targetValueFor(activity);
  let done = field && target != null ? toNum(log[field]) : null;
  if (target == null && activity.targetQuantity != null) {
    target = toNum(activity.targetQuantity);
    done = toNum(log.quantityDone);
  }
  if (done == null || target == null || target <= 0 || (activity.metricType === "time" && done <= 0)) return null;
  const ratio = activity.metricType === "time" ? target / done : done / target;
  const percent = Math.round(Math.min(100, Math.max(0, ratio * 100)));
  return { percent, done, target };
}

function logResultText(log) {
  if (!log) return "";
  const parts = [];
  if (log.timeSec != null) parts.push(`${log.timeSec} sec`);
  if (log.distanceDone != null) parts.push(`${log.distanceDone} m`);
  if (log.loadUsed != null) parts.push(`${log.loadUsed}${log.activity?.targetUnit ? ` ${log.activity.targetUnit}` : " kg"}`);
  if (log.quantityDone != null) parts.push(`${log.quantityDone}${log.activity?.targetUnit ? ` ${log.activity.targetUnit}` : ""}`);
  if (log.setsDone != null) parts.push(`${log.setsDone} sets`);
  if (log.repsDone != null) parts.push(`${log.repsDone} reps`);
  if (log.attempts != null) parts.push(`${log.attempts} attempts`);
  return parts.join(" · ");
}

/* Renders the FIXED metric-field set for a fitness type. `values` maps the
   PlanActivity target keys to current values; `onChange(key, value)` writes
   them. Exactly one field per type may carry a unit dropdown (stored in
   targetUnit); fixedUnit renders a static suffix. There is deliberately no
   "what to measure" selector — the type locks its metric. */
function LockedTargetFields({ fitnessType, values, onChange }) {
  const fields = metricFieldsFor(fitnessType);
  if (!fields.length) return <p className={styles.empty}>No configurable targets for this type.</p>;
  return (
    <>
      {fields.map((f) => (
        <label key={f.key} style={{ flex: "1 1 150px" }}>
          <span>{f.label}</span>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <input
              className={styles.fieldControl}
              style={{ flex: "1 1 auto" }}
              type="number"
              min="0"
              step="any"
              value={values[f.key] || ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              placeholder="0"
            />
            {f.units && f.units.length ? (
              <select
                className={styles.fieldControl}
                style={{ flex: "0 0 auto" }}
                value={values.targetUnit || ""}
                onChange={(e) => onChange("targetUnit", e.target.value)}
              >
                {f.units.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            ) : f.fixedUnit ? (
              <span style={{ flex: "0 0 auto", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{f.fixedUnit}</span>
            ) : null}
          </div>
        </label>
      ))}
    </>
  );
}

/* Clears any target field this fitness type does not allow, and re-rolls the
   unit to the type's locked default. */
function resetTargetsFor(next, fitnessType) {
  const allowed = allowedTargetKeysFor(fitnessType);
  for (const key of ROW_TARGET_KEYS) {
    if (!allowed.has(key)) next[key] = "";
  }
  next.targetUnit = defaultUnitFor(fitnessType);
  return next;
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
      targetTimeSec: act.targetTimeSec != null ? String(act.targetTimeSec) : "",
      targetQuantity: act.targetQuantity != null ? String(act.targetQuantity) : "",
      targetUnit: act.targetUnit || defaultUnitFor(act.fitnessType),
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
      if (name === "fitnessType") return resetTargetsFor(next, value);
      return next;
    });
  }

  function submitEdit(e) {
    e.preventDefault();
    setSaving(true);
    onEdit(draft.id, {
      activityName: draft.activityName,
      fitnessType: draft.fitnessType,
      targetTimeSec: draft.targetTimeSec || null,
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
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "var(--space-3) var(--space-4)", background: "rgba(6,38,30,.35)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <strong>{athlete.lastName}, {athlete.firstName}</strong>
          {athlete.athleteCode ? <small style={{ color: "var(--muted)", display: "block" }}>{athlete.athleteCode}</small> : null}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
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
                  const targetText = targetDisplay(firstActivity);
                  const isEditing = editingId === firstActivity.id;
                  return (
                    <React.Fragment key={fitnessType}>
                      <tr>
                        <td data-label="Fitness Type">
                          <span className={styles.badge} style={{ background: "rgba(45,212,168,.16)", color: "var(--accent)" }}>{(FITNESS_OPTIONS.find((o) => o.value === fitnessType) || { label: fitnessType }).label}</span>
                        </td>
                        <td data-label="Target">{targetText}</td>
                        <td data-label="Latest status" style={{ textAlign: "center" }}>
                          {(() => {
                            if (!latest) return <span className={styles.badge} style={{ background: "rgba(26,92,74,.08)", color: "var(--muted)", border: "1px dashed rgba(66,135,99,.45)", fontSize: "11px" }}>Not started</span>;
                            return (
                              <span title={`${fmtDate(latest.performedAt)}${logResultText(latest) ? ` · ${logResultText(latest)}` : ""}`} className={`${styles.badge} ${styles[meta.cls]}`} style={{ fontSize: "11px" }}>
                                {meta.label}
                                <small style={{ marginLeft: 6, opacity: 0.7 }}>{fmtDate(latest.performedAt)}</small>
                              </span>
                            );
                          })()}
                        </td>
                        {!readOnly && <td><button className={`${styles.secondary} ${styles.btnSm}`} onClick={() => { if (isEditing) setEditingId(null); else startEdit(firstActivity); }}>{isEditing ? "Cancel" : "Edit"}</button> <button className={`${styles.danger} ${styles.btnSm}`} onClick={() => onRemove(firstActivity.id)}>Remove</button></td>}
                      </tr>
                      {isEditing && draft && (
                        <tr><td colSpan="4" style={{ padding: 0, background: "transparent" }}>
                          <div className={styles.detailPanel}>
                            <form onSubmit={submitEdit} className={styles.formGrid} style={{ marginTop: 0 }}>
                              <label className={styles.fullField}>Activity name *<input className={styles.fieldControl} value={draft.activityName} onChange={(e) => setField("activityName", e.target.value)} required maxLength="191" /></label>
                              <label>Fitness dimension<select className={styles.fieldControl} value={draft.fitnessType} onChange={(e) => setField("fitnessType", e.target.value)}>{FITNESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                              <LockedTargetFields fitnessType={draft.fitnessType} values={draft} onChange={setField} />
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
  const [rows, setRows] = React.useState([freshRow(0)]);

  function freshRow(id) {
    return {
      id,
      name: "",
      fitness: "endurance",
      targetTimeSec: "",
      targetQuantity: "",
      targetUnit: defaultUnitFor("endurance"),
      targetSets: "",
      targetReps: "",
      targetDistance: "",
      targetLoad: "",
      instructions: "",
      dayIndex: "",
      weekNumber: "",
    };
  }

  function addRow() {
    setRows((cur) => [...cur, freshRow(Date.now())]);
  }
  function removeRow(id) {
    setRows((cur) => cur.filter((r) => r.id !== id));
  }
  function updateRow(id, key, value) {
    setRows((cur) => cur.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, [key]: value };
      if (key === "fitness") return resetTargetsFor(next, value);
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
      targetTimeSec: r.targetTimeSec || null,
      targetQuantity: r.targetQuantity || null,
      targetUnit: r.targetUnit || null,
      targetSets: r.targetSets || null,
      targetReps: r.targetReps || null,
      targetDistance: r.targetDistance || null,
      targetLoad: r.targetLoad || null,
      instructions: r.instructions || null,
      dayIndex: r.dayIndex ? parseInt(r.dayIndex) : null,
      weekNumber: r.weekNumber ? parseInt(r.weekNumber) : null,
    }));
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/plan-activities", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ planId, action: "bulk", activities }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { setRows([freshRow(0)]); onCreated(); return; }
      setMessage(result.error || "Could not add the activities.");
    } catch (e) { setMessage("Unable to reach the server."); }
    setBusy(false);
  }

  return (
    <div style={{ borderTop: "1px solid rgba(26,92,74,.5)", marginTop: "var(--space-3)", paddingTop: "var(--space-3)" }}>
      <form onSubmit={submit} className={styles.formGrid}>
        {rows.map((r) => (
          <div key={r.id} className={styles.fullField} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
              <strong style={{ fontSize: 13 }}>Activity {rows.indexOf(r) + 1}</strong>
              {rows.length > 1 && <button type="button" className={`${styles.danger} ${styles.btnSm}`} onClick={() => removeRow(r.id)}>Remove</button>}
            </div>
            <label className={styles.fullField} style={{ marginBottom: 8 }}>Name *<input value={r.name} onChange={(e) => updateRow(r.id, "name", e.target.value)} maxLength="191" placeholder="e.g. Endurance run" /></label>
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: 8 }}>
              <label style={{ flex: "1 1 150px" }}>Fitness type<select value={r.fitness} onChange={(e) => updateRow(r.id, "fitness", e.target.value)}>{FITNESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              <LockedTargetFields fitnessType={r.fitness} values={r} onChange={(key, value) => updateRow(r.id, key, value)} />
            </div>
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: 8 }}>
              <label style={{ flex: "0 1 90px" }}>Day (1–7)<input value={r.dayIndex} onChange={(e) => updateRow(r.id, "dayIndex", e.target.value)} type="number" min="1" max="7" placeholder="Day" /></label>
              <label style={{ flex: "0 1 90px" }}>Week<input value={r.weekNumber} onChange={(e) => updateRow(r.id, "weekNumber", e.target.value)} type="number" min="1" placeholder="Week" /></label>
            </div>
            <label className={styles.fullField}>Instructions<textarea value={r.instructions} onChange={(e) => updateRow(r.id, "instructions", e.target.value)} rows="1" maxLength="2000" placeholder="How to do it, safety notes, etc." /></label>
          </div>
        ))}

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