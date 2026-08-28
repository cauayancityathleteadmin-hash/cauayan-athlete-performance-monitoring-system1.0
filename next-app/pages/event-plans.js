import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import { paginatePrisma } from "../lib/pagination";
import Pagination from "../components/Pagination";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const page = Number(context.query.page) || 1;
  const planResult = await paginatePrisma(prisma.eventPlan, page, { orderBy: { startDate: "asc" }, include: { sports: { include: { sport: true } }, applications: { include: { coach: { select: { coachCode: true, firstName: true, lastName: true } } } }, participants: { where: { status: "active" }, select: { id: true } } } });
  const plans = planResult.items.map((plan) => ({ ...plan, startDate: plan.startDate.toISOString(), endDate: plan.endDate?.toISOString() || null }));
  return { props: { session, plans, page: planResult.page, totalPages: planResult.totalPages } };
}

export default function EventPlans({ plans, session, page, totalPages }) {
  const isAdmin = session?.user?.role === "admin";
  return <><Head><title>Event plans | Cauayan Athlete Performance</title></Head><AppShell session={session} isAdmin={isAdmin} eyebrow="Participation" title="Event plans" active="/event-plans"><section className={styles.grid}>{plans.map((plan) => <article className={styles.panel} key={plan.id}><p className={styles.eyebrow}>{plan.status}</p><h2>{plan.eventName}</h2><p>{plan.description}</p><p><strong>{new Date(plan.startDate).toLocaleDateString()}</strong>{plan.endDate && ` - ${new Date(plan.endDate).toLocaleDateString()}`}<br />{plan.venue}</p><p>{plan.sports.map((item) => item.sport.sportName).join(", ")}</p><small>{plan.participants.length} active participants · {plan.applications.length} applications</small><EventPlanActions plan={plan} session={session} /></article>)}</section><Pagination page={page} totalPages={totalPages} /></AppShell></>;
}

function EventPlanActions({ plan, session }) {
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function request(url, body) {
    setBusy(true); setMessage("");
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      setMessage(result.error || (response.ok ? "Saved successfully." : "Save failed."));
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    }
    setBusy(false);
  }
  if (session.user.role === "coach") return plan.status === "open" ? <div className={styles.actionRow}><button className={styles.secondary} disabled={busy} onClick={() => request("/api/event-plans/applications", { eventPlanId: plan.id })}>Apply to participate</button>{message && <small role="status">{message}</small>}</div> : null;
  const pending = plan.applications.filter((application) => application.status === "pending");
  return pending.length ? <div className={styles.actionRow}>{pending.map((application) => <div key={application.id}><small>{application.coach.coachCode} {application.coach.firstName} {application.coach.lastName}</small><button className={styles.secondary} disabled={busy} onClick={() => request("/api/admin/event-plans/applications", { applicationId: application.id, decision: "approved" })}>Approve</button><button className={styles.dangerButton} disabled={busy} onClick={() => request("/api/admin/event-plans/applications", { applicationId: application.id, decision: "rejected" })}>Reject</button></div>)}{message && <small role="status">{message}</small>}</div> : null;
}