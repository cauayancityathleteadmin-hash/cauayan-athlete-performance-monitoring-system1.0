import Head from "next/head";
import Link from "next/link";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const athletes = await prisma.athlete.findMany({ orderBy: [{ status: "asc" }, { lastName: "asc" }], include: { school: true, sport: true, event: true, coach: true } });
  return { props: { session, athletes: athletes.map((athlete) => ({ ...athlete, birthdate: athlete.birthdate.toISOString(), dateRegistered: athlete.dateRegistered.toISOString() })) } };
}

export default function Athletes({ athletes }) {
  return <><Head><title>Athletes | Cauayan Athlete Performance</title></Head><div className={styles.app}><header className={styles.header}><div><p className={styles.eyebrow}>Directory</p><h1>Athletes</h1></div><Link className={styles.account} href="/dashboard">Back to dashboard</Link></header><nav className={styles.nav} aria-label="Primary navigation"><Link href="/dashboard">Dashboard</Link><Link href="/athletes" aria-current="page">Athletes</Link><Link href="/assessments">Assessments</Link><Link href="/analytics">Analytics</Link><Link href="/event-plans">Event plans</Link></nav><main className={styles.main}><section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>Registered athletes</p><h2>All athletes</h2></div><strong>{athletes.length} records</strong></div><div className={styles.tableWrap}><table><thead><tr><th>Code</th><th>Athlete</th><th>Sport / event</th><th>School</th><th>Coach</th><th>Status</th></tr></thead><tbody>{athletes.map((athlete) => <tr key={athlete.id}><td>{athlete.athleteCode}</td><td><strong>{athlete.firstName} {athlete.middleName || ""} {athlete.lastName}</strong><small>{athlete.gender}</small></td><td>{athlete.sport.sportName}<small>{athlete.event?.eventName || "No event"}</small></td><td>{athlete.school?.schoolName || "Unassigned"}</td><td>{athlete.coach.firstName} {athlete.coach.lastName}</td><td>{athlete.status}</td></tr>)}</tbody></table></div></section></main></div></>;
}