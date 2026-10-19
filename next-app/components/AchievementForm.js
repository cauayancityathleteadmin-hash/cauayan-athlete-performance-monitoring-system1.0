import React from "react";
import styles from "@/styles/Dashboard.module.css";
import { MEDALS } from "@/lib/points";

const LEVELS = [
  { value: "intramural", label: "Intramural" },
  { value: "barangay", label: "Barangay" },
  { value: "city", label: "City" },
  { value: "provincial", label: "Provincial" },
  { value: "regional", label: "Regional" },
  { value: "national", label: "National" },
  { value: "international", label: "International" },
];

const VISIBLE_MEETS = 8;

function meetLabel(meet) {
  const d = meet.startDate ? new Date(meet.startDate) : null;
  const when = d && !isNaN(d) ? d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "";
  return when ? `${meet.eventName} · ${when}` : meet.eventName;
}

// One shared form: upload mode (initial=null) and edit mode (initial=achievement).
export default function AchievementForm({ athleteId, catalog, meets = [], initial = null, onComplete, onCancel }) {
  const editing = !!initial;
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [today] = React.useState(() => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); });

  const [medal, setMedal] = React.useState(initial?.medal || "");
  const [level, setLevel] = React.useState(initial?.level || "");
  const [eventPlanId, setEventPlanId] = React.useState(initial?.eventPlanId ? String(initial.eventPlanId) : "");
  const [sportId, setSportId] = React.useState(initial?.sportId ? String(initial.sportId) : "");
  const [meetSearch, setMeetSearch] = React.useState("");
  const [showAllMeets, setShowAllMeets] = React.useState(false);

  const eventsForSport = catalog?.events?.filter((e) => e.sportId === Number(sportId)) || [];
  const needsMeetSearch = meets.length > VISIBLE_MEETS;
  const meetMatches = meets.filter((m) => {
    if (!meetSearch.trim()) return true;
    const q = meetSearch.trim().toLowerCase();
    return m.eventName.toLowerCase().includes(q) || (m.venue || "").toLowerCase().includes(q);
  });
  const visibleMeets = meetSearch.trim() || showAllMeets ? meetMatches : meetMatches.slice(0, VISIBLE_MEETS);

  async function submit(event) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setBusy(true);
    setMessage("");
    const form = new FormData(formEl);
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch(`/api/athletes/${athleteId}/achievements`, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify({
        ...(editing ? { id: initial.id } : {}),
        title: form.get("title"),
        achievementType: form.get("achievementType"),
        organization: form.get("organization"),
        achievementDate: form.get("achievementDate"),
        description: form.get("description"),
        medal: medal || null,
        level: level || null,
        isRecord: form.get("isRecord") === "on",
        sportId: Number(form.get("sportId")) || null,
        eventId: Number(form.get("eventId")) || null,
        eventPlanId: Number(eventPlanId) || null,
        certificateUrl: form.get("certificateUrl"),
      }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    if (response && response.ok && !result.error) {
      setMessage(editing ? "Achievement saved." : "Achievement added.");
      if (!editing) {
        formEl.reset();
        setMedal("");
        setLevel("");
        setEventPlanId("");
      }
      onComplete();
    } else {
      setMessage(result.error || (editing ? "Could not save achievement." : "Could not add achievement."));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.formStack} style={{ marginBottom: "var(--space-4)" }}>
      <label>Title *
        <input name="title" className={styles.fieldControl} required maxLength="150" defaultValue={initial?.achievementTitle || ""} placeholder="e.g. Gold medal, 100m sprint" />
      </label>

      <div>
        <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--muted)", marginBottom: 6 }}>Medal</span>
        <div className={styles.segmented} style={{ flexWrap: "wrap" }}>
          <button type="button" aria-pressed={medal === ""} className={medal === "" ? styles.active : ""} onClick={() => setMedal("")}>None</button>
          {MEDALS.map((m) => (
            <button key={m.value} type="button" aria-pressed={medal === m.value} className={medal === m.value ? styles.active : ""} onClick={() => setMedal(medal === m.value ? "" : m.value)}>
              <span style={{ color: m.color }}>●</span> {m.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--muted)", marginBottom: 6 }}>Level</span>
        <div className={styles.segmented} style={{ flexWrap: "wrap" }}>
          <button type="button" aria-pressed={level === ""} className={level === "" ? styles.active : ""} onClick={() => setLevel("")}>None</button>
          {LEVELS.map((l) => (
            <button key={l.value} type="button" aria-pressed={level === l.value} className={level === l.value ? styles.active : ""} onClick={() => setLevel(level === l.value ? "" : l.value)}>{l.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 160px" }}>Date
          <input name="achievementDate" className={styles.fieldControl} type="date" defaultValue={initial?.achievementDate ? String(initial.achievementDate).slice(0, 10) : today} />
        </label>
        <label style={{ flex: "1 1 160px", display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-end" }}>
          <input name="isRecord" type="checkbox" defaultChecked={!!initial?.isRecord} style={{ accentColor: "var(--accent)" }} />
          Record-breaking
        </label>
      </div>

      <div>
        <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--muted)", marginBottom: 6 }}>Meet</span>
        {needsMeetSearch && (
          <input
            className={styles.fieldControl}
            type="search"
            value={meetSearch}
            onChange={(e) => setMeetSearch(e.target.value)}
            placeholder="Search meets…"
            style={{ marginBottom: "var(--space-3)" }}
            aria-label="Search meets"
          />
        )}
        <div className={styles.segmented} style={{ flexWrap: "wrap" }}>
          <button type="button" aria-pressed={eventPlanId === ""} className={eventPlanId === "" ? styles.active : ""} onClick={() => setEventPlanId("")}>None</button>
          {visibleMeets.map((m) => (
            <button key={m.id} type="button" aria-pressed={eventPlanId === String(m.id)} className={eventPlanId === String(m.id) ? styles.active : ""} onClick={() => setEventPlanId(eventPlanId === String(m.id) ? "" : String(m.id))}>{meetLabel(m)}</button>
          ))}
          {!meetSearch.trim() && !showAllMeets && meets.length > VISIBLE_MEETS && (
            <button type="button" onClick={() => setShowAllMeets(true)}>Show all ({meets.length})</button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 160px" }}>Sport
          <select name="sportId" className={styles.fieldControl} value={sportId} onChange={(e) => setSportId(e.target.value)}>
            <option value="">None</option>
            {(catalog?.sports || []).map((s) => <option value={s.id} key={s.id}>{s.sportName}</option>)}
          </select>
        </label>
        <label style={{ flex: "1 1 160px" }}>Event
          <select name="eventId" className={styles.fieldControl} defaultValue={initial?.eventId ? String(initial.eventId) : ""}>
            <option value="">None</option>
            {eventsForSport.map((e) => <option value={e.id} key={e.id}>{e.eventName}</option>)}
          </select>
        </label>
      </div>

      <label>Type<input name="achievementType" className={styles.fieldControl} maxLength="100" defaultValue={initial?.achievementType || ""} placeholder="e.g. Medal, Record, Cert" /></label>
      <label>Organization<input name="organization" className={styles.fieldControl} maxLength="191" defaultValue={initial?.organization || ""} placeholder="e.g. PRISAA" /></label>
      <label>Proof link<input name="certificateUrl" className={styles.fieldControl} maxLength="500" defaultValue={initial?.certificateUrl || ""} placeholder="https://... (optional)" /></label>
      <label>Description<textarea name="description" className={styles.fieldControl} rows="2" maxLength="2000" defaultValue={initial?.description || ""} /></label>

      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
        <button className={styles.primary} disabled={busy}>{busy ? "Saving..." : (editing ? "Save changes" : "Add achievement")}</button>
        {editing && <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
      {message && <p role="status" className={styles.formHint}>{message}</p>}
    </form>
  );
}
