import Head from "next/head";
import Link from "next/link";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const [athletes, sports, events, schools] = await Promise.all([
    prisma.athlete.findMany({ orderBy: [{ status: "asc" }, { lastName: "asc" }], include: { school: true, sport: true, event: true, coach: true } }),
    prisma.sport.findMany({ where: { status: "active" }, orderBy: { sportName: "asc" } }),
    prisma.event.findMany({ where: { status: "active" }, include: { sport: true }, orderBy: { eventName: "asc" } }),
    prisma.school.findMany({ where: { status: "active" }, orderBy: { schoolName: "asc" } }),
  ]);
  return { props: { session, catalog: { sports, events, schools }, athletes: athletes.map((athlete) => ({ ...athlete, birthdate: athlete.birthdate.toISOString(), dateRegistered: athlete.dateRegistered.toISOString() })) } };
}

export default function Athletes({ athletes, catalog }) {
  return <><Head><title>Athletes | Cauayan Athlete Performance</title></Head><div className={styles.app}><header className={styles.header}><div><p className={styles.eyebrow}>Directory</p><h1>Athletes</h1></div><Link className={styles.account} href="/dashboard">Back to dashboard</Link></header><nav className={styles.nav} aria-label="Primary navigation"><Link href="/dashboard">Dashboard</Link><Link href="/athletes" aria-current="page">Athletes</Link><Link href="/assessments">Assessments</Link><Link href="/analytics">Analytics</Link><Link href="/event-plans">Event plans</Link></nav><main className={styles.main}><section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>Registration</p><h2>Add athlete</h2></div></div><AthleteForm catalog={catalog} /></section><section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>Registered athletes</p><h2>All athletes</h2></div><strong>{athletes.length} records</strong></div><div className={styles.tableWrap}><table><thead><tr><th>Code</th><th>Athlete</th><th>Sport / event</th><th>School</th><th>Coach</th><th>Status</th></tr></thead><tbody>{athletes.map((athlete) => <tr key={athlete.id}><td>{athlete.athleteCode}</td><td><strong>{athlete.firstName} {athlete.middleName || ""} {athlete.lastName}</strong><small>{athlete.gender}</small></td><td>{athlete.sport.sportName}<small>{athlete.event?.eventName || "No event"}</small></td><td>{athlete.school?.schoolName || "Unassigned"}</td><td>{athlete.coach.firstName} {athlete.coach.lastName}</td><td>{athlete.status}</td></tr>)}</tbody></table></div></section></main></div></>;
}

function AthleteForm({ catalog }) {
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(event) { event.preventDefault(); setBusy(true); setMessage(""); const form = new FormData(event.currentTarget); const csrf = await fetch("/api/csrf").then((response) => response.json()); const body = Object.fromEntries(form.entries()); const result = await fetch("/api/athletes", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) }).then((response) => response.json()); setMessage(result.error || "Athlete registered successfully."); if (!result.error) event.currentTarget.reset(); setBusy(false); }
  return <form onSubmit={submit} className={styles.formGrid}><label>Athlete code<input name="athleteCode" required maxLength="20" placeholder="ATH-000010" /></label><label>First name<input name="firstName" required maxLength="100" /></label><label>Middle name<input name="middleName" maxLength="100" /></label><label>Last name<input name="lastName" required maxLength="100" /></label><label>Birthdate<input name="birthdate" type="date" required /></label><label>Gender<select name="gender" defaultValue="prefer_not_to_say"><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><label>Sport<select name="sportId" required defaultValue="">{catalog.sports.map((sport) => <option value={sport.id} key={sport.id}>{sport.sportName}</option>)}</select></label><label>Event<select name="eventId" defaultValue=""><option value="">No event</option>{catalog.events.map((event) => <option value={event.id} key={event.id}>{event.sport.sportName} - {event.eventName}</option>)}</select></label><label>School<select name="schoolId" defaultValue=""><option value="">Unassigned</option>{catalog.schools.map((school) => <option value={school.id} key={school.id}>{school.schoolName}</option>)}</select></label><label>Contact number<input name="contactNumber" maxLength="30" /></label><label>Email<input name="email" type="email" maxLength="191" /></label><label className={styles.fullField}>Address<textarea name="address" maxLength="2000" /></label><button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Register athlete"}</button>{message && <p role="status" className={styles.fullField}>{message}</p>}</form>;
}