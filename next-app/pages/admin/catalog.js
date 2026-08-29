import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };
  const sports = await prisma.sport.findMany({ orderBy: { sportName: "asc" }, include: { _count: { select: { events: true } } } });
  const events = await prisma.event.findMany({ orderBy: { eventName: "asc" }, include: { sport: true } });
  return { props: { session, sports: JSON.parse(JSON.stringify(sports)), events: JSON.parse(JSON.stringify(events)) } };
}

export default function Catalog({ session, sports, events }) {
  const [sportMessage, setSportMessage] = React.useState("");
  const [eventMessage, setEventMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function post(url, body) {
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) }).catch(() => null);
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
          <div className={styles.tableWrap}><table><thead><tr><th>Sport</th><th>Events</th><th>Status</th></tr></thead><tbody>{sports.map((sport) => <tr key={sport.id}><td>{sport.sportName}</td><td>{sport._count.events}</td><td>{statusBadge(sport.status)}</td></tr>)}{!sports.length && <tr><td colSpan="3" className={styles.empty}>No sports yet.</td></tr>}</tbody></table></div>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeading}><div><h2>Events / Disciplines</h2><small className={styles.small}>Events grouped under each sport</small></div><span className={styles.countBadge}>{events.length}</span></div>
          <div className={styles.tableWrap}><table><thead><tr><th>Event</th><th>Sport</th><th>Status</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.eventName}</td><td>{event.sport.sportName}</td><td>{statusBadge(event.status)}</td></tr>)}{!events.length && <tr><td colSpan="3" className={styles.empty}>No events yet. Add events above.</td></tr>}</tbody></table></div>
        </section>
      </AppShell>
    </>
  );
}
