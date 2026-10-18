import React from "react";
import styles from "@/styles/Dashboard.module.css";

export default function AchievementForm({ athleteId, catalog, onComplete }) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [today] = React.useState(() => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); });
  const [sportId, setSportId] = React.useState(athleteId ? "" : "");
  const eventsForSport = catalog?.events?.filter((e) => e.sportId === Number(sportId)) || [];
  const currentSport = Number(sportId);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch(`/api/athletes/${athleteId}/achievements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify({
        title: form.get("title"),
        achievementType: form.get("achievementType"),
        organization: form.get("organization"),
        achievementDate: form.get("achievementDate"),
        description: form.get("description"),
        medal: form.get("medal"),
        level: form.get("level"),
        isRecord: form.get("isRecord") === "on",
        sportId: Number(form.get("sportId")) || null,
        eventId: Number(form.get("eventId")) || null,
        certificateUrl: form.get("certificateUrl"),
      }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    if (response && response.ok && !result.error) {
      setMessage("Achievement added.");
      event.currentTarget.reset();
      onComplete();
    } else {
      setMessage(result.error || "Could not add achievement.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.formStack} style={{ marginBottom: "var(--space-4)" }}>
      <label>Title *<input name="title" className={styles.fieldControl} required maxLength="150" placeholder="e.g. Gold medal, 100m sprint" /></label>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 140px" }}>Medal / result
          <select name="medal" className={styles.fieldControl} defaultValue="">
            <option value="">None</option>
            <option value="gold">Gold (1st)</option>
            <option value="silver">Silver (2nd)</option>
            <option value="bronze">Bronze (3rd)</option>
            <option value="fourth">4th place</option>
            <option value="participation">Participation</option>
          </select>
        </label>
        <label style={{ flex: "1 1 160px" }}>Level
          <select name="level" className={styles.fieldControl} defaultValue="">
            <option value="">None</option>
            <option value="intramural">Intramural</option>
            <option value="barangay">Barangay</option>
            <option value="city">City / Municipal</option>
            <option value="provincial">Provincial</option>
            <option value="regional">Regional</option>
            <option value="national">National</option>
            <option value="international">International</option>
          </select>
        </label>
        <label style={{ flex: "1 1 160px" }}>Date
          <input name="achievementDate" className={styles.fieldControl} type="date" defaultValue={today} />
        </label>
      </div>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 140px", display: "flex", alignItems: "center", gap: 6 }}>
          <input name="isRecord" type="checkbox" style={{ accentColor: "var(--accent)" }} />
          Record-breaking performance
        </label>
      </div>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 160px" }}>Sport
          <select name="sportId" className={styles.fieldControl} defaultValue="" onChange={(e) => setSportId(e.target.value)}>
            <option value="">None</option>
            {(catalog?.sports || []).map((s) => <option value={s.id} key={s.id}>{s.sportName}</option>)}
          </select>
        </label>
        <label style={{ flex: "1 1 160px" }}>Event / discipline
          <select name="eventId" className={styles.fieldControl} defaultValue="">
            <option value="">None</option>
            {eventsForSport.map((e) => <option value={e.id} key={e.id}>{e.eventName}</option>)}
          </select>
        </label>
      </div>
      <label>Type<input name="achievementType" className={styles.fieldControl} maxLength="100" placeholder="e.g. Medal, Record, Cert" /></label>
      <label>Organization<input name="organization" className={styles.fieldControl} maxLength="191" placeholder="e.g. PRISAA" /></label>
      <label>Certificate / photo link<input name="certificateUrl" className={styles.fieldControl} maxLength="500" placeholder="https://... (optional proof)" /></label>
      <label>Description<textarea name="description" className={styles.fieldControl} rows="2" maxLength="2000" /></label>
      <button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Add achievement"}</button>
      {message && <p role="status" className={styles.formHint}>{message}</p>}
    </form>
  );
}
