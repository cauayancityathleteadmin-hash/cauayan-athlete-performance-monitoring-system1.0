import Head from "next/head";
import React from "react";
import { useRouter } from "next/router";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };
  const [sports, events, schools] = await Promise.all([
    prisma.sport.findMany({ orderBy: { sportName: "asc" }, include: { _count: { select: { events: true } } } }),
    prisma.event.findMany({ orderBy: { eventName: "asc" }, include: { sport: true } }),
    prisma.school.findMany({ orderBy: { schoolName: "asc" }, include: { _count: { select: { athletes: true, coaches: true } } } }),
  ]);
  return { props: { session, sports: JSON.parse(JSON.stringify(sports)), events: JSON.parse(JSON.stringify(events)), schools: JSON.parse(JSON.stringify(schools)) } };
}

export default function Catalog({ session, sports, events, schools }) {
  const [sportMessage, setSportMessage] = React.useState("");
  const [eventMessage, setEventMessage] = React.useState("");
  const [schoolMessage, setSchoolMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [editingSport, setEditingSport] = React.useState(null);
  const [editingEvent, setEditingEvent] = React.useState(null);
  const [editingSchool, setEditingSchool] = React.useState(null);
  const [confirmDeleting, setConfirmDeleting] = React.useState(null);
  const router = useRouter();

  async function post(url, body, method = "POST") {
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    return { ok: response && response.ok && !result.error, result };
  }

  async function addSport(event) {
    event.preventDefault();
    setBusy(true);
    setSportMessage("");
    const form = new FormData(event.currentTarget);
    const { ok, result } = await post("/api/catalog", { kind: "sport", sportName: form.get("sportName"), description: form.get("description") });
    setSportMessage(ok ? "Sport added. Refresh to see it." : (result.error || "Could not add sport."));
    if (ok) event.currentTarget.reset();
    setBusy(false);
  }

  async function addEvent(event) {
    event.preventDefault();
    setBusy(true);
    setEventMessage("");
    const form = new FormData(event.currentTarget);
    const { ok, result } = await post("/api/catalog", { kind: "event", sportId: Number(form.get("sportId")), eventName: form.get("eventName"), description: form.get("description") });
    setEventMessage(ok ? "Event added. Refresh to see it." : (result.error || "Could not add event."));
    if (ok) event.currentTarget.reset();
    setBusy(false);
  }

  async function saveSport(event) {
    event.preventDefault();
    setBusy(true);
    setSportMessage("");
    const form = new FormData(event.currentTarget);
    const { ok, result } = await post("/api/catalog", { kind: "sport", id: Number(editingSport.id), sportName: form.get("sportName"), description: form.get("description"), status: form.get("status") }, "PUT");
    if (ok) { setSportMessage(`Updated ${form.get("sportName")}.`); setEditingSport(null); router.replace("/admin/catalog"); }
    else setSportMessage(result.error || "Could not update sport.");
    setBusy(false);
  }

  async function saveEvent(event) {
    event.preventDefault();
    setBusy(true);
    setEventMessage("");
    const form = new FormData(event.currentTarget);
    const { ok, result } = await post("/api/catalog", { kind: "event", id: Number(editingEvent.id), eventName: form.get("eventName"), sportId: Number(form.get("sportId")), description: form.get("description"), status: form.get("status") }, "PUT");
    if (ok) { setEventMessage(`Updated ${form.get("eventName")}.`); setEditingEvent(null); router.replace("/admin/catalog"); }
    else setEventMessage(result.error || "Could not update event.");
    setBusy(false);
  }

  async function deleteItem(kind, item) {
    if (!window.confirm(`Deactivate "${item}"? It will be hidden from new registrations but its existing records stay.`)) return;
    setBusy(true);
    const msg = kind === "sport" ? setSportMessage : setEventMessage;
    const { ok, result } = await post("/api/catalog", { kind, id: Number(item.id) }, "DELETE");
    if (ok) { setConfirmDeleting(null); msg(`Deactivated ${item.label}.`); if (typeof router !== "undefined") router.replace("/admin/catalog"); }
    else msg(result.error || "Could not deactivate.");
    setBusy(false);
  }

  async function addSchool(event) {
    event.preventDefault();
    setBusy(true);
    setSchoolMessage("");
    const form = new FormData(event.currentTarget);
    const { ok, result } = await post("/api/catalog", { kind: "school", schoolName: form.get("schoolName") });
    setSchoolMessage(ok ? "School added. Refresh to see it." : (result.error || "Could not add school."));
    if (ok) { event.currentTarget.reset(); router.replace("/admin/catalog"); }
    setBusy(false);
  }

  async function saveSchool(event) {
    event.preventDefault();
    setBusy(true);
    setSchoolMessage("");
    const form = new FormData(event.currentTarget);
    const { ok, result } = await post("/api/catalog", { kind: "school", id: Number(editingSchool.id), schoolName: form.get("schoolName"), status: form.get("status") }, "PUT");
    if (ok) { setSchoolMessage(`Updated ${form.get("schoolName")}.`); setEditingSchool(null); router.replace("/admin/catalog"); }
    else setSchoolMessage(result.error || "Could not update school.");
    setBusy(false);
  }

  async function deleteSchool(school) {
    if (!window.confirm(`Deactivate "${school.schoolName}"? Existing athletes and coaches keep their records.`)) return;
    setBusy(true);
    const { ok, result } = await post("/api/catalog", { kind: "school", id: Number(school.id) }, "DELETE");
    if (ok) { setEditingSchool(null); setSchoolMessage("School deactivated."); router.replace("/admin/catalog"); }
    else setSchoolMessage(result.error || "Could not deactivate school.");
    setBusy(false);
  }

  const statusBadge = (status) => (status === "active" ? <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span> : <span className={`${styles.badge} ${styles.badgeMuted}`}>Inactive</span>);

  return (
    <>
      <Head><title>Sports &amp; Events | Administration</title></Head>
      <AppShell session={session} isAdmin eyebrow="System catalog" title="Sports & Events" active="/admin/catalog">
        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Taxonomy</p><h2>Add sport</h2></div></div>
            <form onSubmit={addSport} className={styles.formStack}>
              <label>Sport name *<input name="sportName" required maxLength="100" placeholder="e.g. Basketball" /></label>
              <label>Description<textarea name="description" maxLength="2000" rows="3" /></label>
              <div className={styles.stackedActions}>
                <button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Add sport"}</button>
              </div>
              {sportMessage && <p role="status" className={styles.formSuccess}>{sportMessage}</p>}
            </form>
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Disciplines</p><h2>Add event / discipline</h2></div></div>
            <form onSubmit={addEvent} className={styles.formStack}>
              <label>Sport *<select name="sportId" required defaultValue="">{sports.map((sport) => <option value={sport.id} key={sport.id}>{sport.sportName}</option>)}</select></label>
              <label>Event name *<input name="eventName" required maxLength="150" placeholder="e.g. 100m sprint" /></label>
              <label>Description<textarea name="description" maxLength="2000" rows="3" /></label>
              <div className={styles.stackedActions}>
                <button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Add event"}</button>
              </div>
              {eventMessage && <p role="status" className={styles.formSuccess}>{eventMessage}</p>}
            </form>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeading}><div><h2>Sports</h2><small className={styles.small}>Active sports and their event totals</small></div><span className={styles.countBadge}>{sports.length}</span></div>
          <div className={styles.tableWrap}><table><thead><tr><th>Sport</th><th>Events</th><th>Status</th><th></th></tr></thead><tbody>{sports.map((sport) => editingSport && editingSport.id === sport.id ? (
  <tr key={sport.id}><td colSpan="4"><form onSubmit={saveSport} className={styles.formStack}>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label style={{ flex: "1 1 160px" }}>Name *<input name="sportName" className={styles.fieldControl} required maxLength="100" defaultValue={sport.sportName} /></label>
      <label style={{ flex: "1 1 120px" }}>Status<select name="status" className={styles.fieldControl} defaultValue={sport.status}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <button className={styles.primary} disabled={busy}>Save sport</button>
      <button type="button" className={styles.secondary} onClick={() => setEditingSport(null)}>Cancel</button>
    </div>
    <label>Description<textarea name="description" className={styles.fieldControl} rows="2" maxLength="2000" defaultValue={sport.description || ""} /></label>
  </form></td></tr>
) : <tr key={sport.id}><td>{sport.sportName}</td><td>{sport._count.events}</td><td>{statusBadge(sport.status)}</td><td><div style={{ display: "flex", gap: 6 }}><button className={styles.expandBtn} onClick={() => setEditingSport(sport)}>Edit</button><button className={styles.expandBtn} disabled={busy} onClick={() => deleteItem("sport", { id: sport.id, label: sport.sportName })}>Deactivate</button></div></td></tr>)}{!sports.length && <tr><td colSpan="4" className={styles.empty}>No sports yet.</td></tr>}</tbody></table></div>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeading}><div><h2>Events / Disciplines</h2><small className={styles.small}>Events grouped under each sport</small></div><span className={styles.countBadge}>{events.length}</span></div>
          <div className={styles.tableWrap}><table><thead><tr><th>Event</th><th>Sport</th><th>Status</th><th></th></tr></thead><tbody>{events.map((event) => editingEvent && editingEvent.id === event.id ? (
  <tr key={event.id}><td colSpan="4"><form onSubmit={saveEvent} className={styles.formStack}>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label style={{ flex: "1 1 160px" }}>Name *<input name="eventName" className={styles.fieldControl} required maxLength="150" defaultValue={event.eventName} /></label>
      <label style={{ flex: "1 1 140px" }}>Sport<select name="sportId" className={styles.fieldControl} defaultValue={event.sportId}>{sports.map((s) => <option value={s.id} key={s.id}>{s.sportName}</option>)}</select></label>
      <label style={{ flex: "1 1 120px" }}>Status<select name="status" className={styles.fieldControl} defaultValue={event.status}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <button className={styles.primary} disabled={busy}>Save event</button>
      <button type="button" className={styles.secondary} onClick={() => setEditingEvent(null)}>Cancel</button>
    </div>
    <label>Description<textarea name="description" className={styles.fieldControl} rows="2" maxLength="2000" defaultValue={event.description || ""} /></label>
  </form></td></tr>
) : <tr key={event.id}><td>{event.eventName}</td><td>{event.sport.sportName}</td><td>{statusBadge(event.status)}</td><td><div style={{ display: "flex", gap: 6 }}><button className={styles.expandBtn} onClick={() => setEditingEvent(event)}>Edit</button><button className={styles.expandBtn} disabled={busy} onClick={() => deleteItem("event", { id: event.id, label: event.eventName })}>Deactivate</button></div></td></tr>)}{!events.length && <tr><td colSpan="4" className={styles.empty}>No events yet. Add events above.</td></tr>}</tbody></table></div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Institutions</p><h2>Schools</h2></div></div>
          <form onSubmit={addSchool} className={styles.formStack} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ flex: "1 1 220px", minWidth: 0 }}>School name *<input name="schoolName" className={styles.fieldControl} required maxLength="191" placeholder="e.g. Cauayan National High School" /></label>
              <button className={styles.primary} disabled={busy}>{busy ? "Adding..." : "Add school"}</button>
            </div>
            {schoolMessage && <p role="status" className={styles.formHint}>{schoolMessage}</p>}
          </form>
          <div className={styles.tableWrap}><table><thead><tr><th>School</th><th>Athletes</th><th>Coaches</th><th>Status</th><th></th></tr></thead><tbody>{schools.map((school) => editingSchool && editingSchool.id === school.id ? (
            <tr key={school.id}><td colSpan="5"><form onSubmit={saveSchool} className={styles.formStack}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={{ flex: "1 1 200px" }}>Name *<input name="schoolName" className={styles.fieldControl} required maxLength="191" defaultValue={school.schoolName} /></label>
                <label style={{ flex: "1 1 130px" }}>Status<select name="status" className={styles.fieldControl} defaultValue={school.status}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
                <button className={styles.primary} disabled={busy}>Save school</button>
                <button type="button" className={styles.secondary} onClick={() => setEditingSchool(null)}>Cancel</button>
              </div>
            </form></td></tr>
          ) : <tr key={school.id}><td>{school.schoolName}</td><td>{school._count.athletes}</td><td>{school._count.coaches}</td><td>{statusBadge(school.status)}</td><td><div style={{ display: "flex", gap: 6 }}><button className={styles.expandBtn} onClick={() => setEditingSchool(school)}>Edit</button><button className={styles.expandBtn} disabled={busy} onClick={() => deleteSchool(school)}>Deactivate</button></div></td></tr>)}{!schools.length && <tr><td colSpan="5" className={styles.empty}>No schools yet. Add schools above.</td></tr>}</tbody></table></div>
        </section>
      </AppShell>
    </>
  );
}
