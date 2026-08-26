import Head from "next/head";
import Link from "next/link";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const plans = await prisma.eventPlan.findMany({ orderBy: { startDate: "asc" }, include: { sports: { include: { sport: true } }, applications: { select: { status: true } }, participants: { where: { status: "active" }, select: { id: true } } } });
  return { props: { plans: plans.map((plan) => ({ ...plan, startDate: plan.startDate.toISOString(), endDate: plan.endDate?.toISOString() || null })) } };
}

export default function EventPlans({ plans }) {
  return <><Head><title>Event plans | Cauayan Athlete Performance</title></Head><div className={styles.app}><header className={styles.header}><div><p className={styles.eyebrow}>Participation</p><h1>Event plans</h1></div><Link className={styles.account} href="/dashboard">Back to dashboard</Link></header><nav className={styles.nav} aria-label="Primary navigation"><Link href="/dashboard">Dashboard</Link><Link href="/athletes">Athletes</Link><Link href="/assessments">Assessments</Link><Link href="/analytics">Analytics</Link><Link href="/event-plans" aria-current="page">Event plans</Link></nav><main className={styles.main}><section className={styles.grid}>{plans.map((plan) => <article className={styles.panel} key={plan.id}><p className={styles.eyebrow}>{plan.status}</p><h2>{plan.eventName}</h2><p>{plan.description}</p><p><strong>{new Date(plan.startDate).toLocaleDateString()}</strong>{plan.endDate && ` - ${new Date(plan.endDate).toLocaleDateString()}`}<br />{plan.venue}</p><p>{plan.sports.map((item) => item.sport.sportName).join(", ")}</p><small>{plan.participants.length} active participants · {plan.applications.length} applications</small></article>)}</section></main></div></>;
}