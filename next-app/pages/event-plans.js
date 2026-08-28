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
  const isAdmin = session.user.role === "admin";
  const page = Number(context.query.page) || 1;
  const planResult = await paginatePrisma(prisma.eventPlan, page, { orderBy: { startDate: "asc" }, include: { sports: { include: { sport: true } }, applications: { include: { coach: { select: { coachCode: true, firstName: true, lastName: true } } } }, participants: { where: { status: "active" }, select: { id: true } } } });
  const plans = planResult.items.map((plan) => ({ ...plan, startDate: plan.startDate.toISOString(), endDate: plan.endDate?.toISOString() || null }));
  const [sports, athletes] = isAdmin
    ? [await prisma.sport.findMany({ where: { status: "active" }, select: { id: true, sportName: true }, orderBy: { sportName: "asc" } }), null]
    : [null, await prisma.athlete.findMany({ where: { coach: { userId: Number(session.user.id) }, status: "active" }, select: { id: true, athleteCode: true, firstName: true, lastName: true }, orderBy: { lastName: "asc" } })];
  return { props: { session, plans, page: planResult.page, totalPages: planResult.totalPages, sports, athletes: JSON.parse(JSON.stringify(athletes)) } };
}

function Card({ plan, children, className }) {
  return (
    <article className={`${styles.panel} ${className || ""}`}>
      <p className={styles.eyebrow}>{plan.status}</p>
      <h2>{plan.eventName}</h2>
      <p>{plan.description}</p>
      <p><strong>{new Date(plan.startDate).toLocaleDateString()}</strong>{plan.endDate && ` - ${new Date(plan.endDate).toLocaleDateString()}`}<br />{plan.venue}</p>
      <p>{plan.sports.map((item) => item.sport.sportName).join(", ")}</p>
      {children}
    </article>
  );
}

export default function EventPlans({ plans, session, page, totalPages, sports, athletes }) {
  const isAdmin = session?.user?.role === "admin";
  const [createPanel, setCreatePanel] = React.useState(false);
  return (
    <>
      <Head><title>Event plans | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Participation" title="Event plans" active="/event-plans">
        <div className={styles.pageTitle}>
          <div><p className={styles.eyebrow}>Plan</p><h2>Event plans</h2></div>
          {isAdmin && <button className={styles.primary} onClick={() => setCreatePanel((current) => !current)}>{createPanel ? "Close form" : "Create plan"}</button>}
        </div>
        {isAdmin && createPanel && <CreatePlan sports={sports} />}
        <section className={styles.grid}>{plans.map((plan) => <Card key={plan.id} plan={plan}><small>{plan.participants.length} active participants · {plan.applications.length} applications</small><EventPlanActions plan={plan} session={session} athletes={athletes} /></Card>)}</section>
        <Pagination page={page} totalPages={totalPages} />
      </AppShell>
    </>
  );
}

function EventPlanActions({ plan, session, athletes }) {
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [athleteId, setAthleteId] = React.useState("");
  async function request(url, body) {
    setBusy(true); setMessage("");
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      setMessage(result.error || (response.ok ? "Saved successfully." : "Save failed."));
      if (response.ok && !result.error) setAthleteId("");
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    }
    setBusy(false);
  }
  if (session.user.role === "coach") {
    if (plan.status !== "open") return null;
    return <div className={styles.actionRow}>
      <button className={styles.secondary} disabled={busy} onClick={() => request("/api/event-plans/applications", { eventPlanId: plan.id })}>Apply to participate</button>
      {athletes && athletes.length ? <><select value={athleteId} onChange={(event) => setAthleteId(event.target.value)}><option value="">Add athlete...</option>{athletes.map((a) => <option value={a.id} key={a.id}>{a.lastName}, {a.firstName} ({a.athleteCode})</option>)}</select><button className={`${styles.secondary} ${styles.btnSm}`} disabled={busy || !athleteId} onClick={() => request("/api/event-plans/participants", { eventPlanId: plan.id, athleteId: Number(athleteId) })}>Add</button></> : null}
      {message && <small role="status">{message}</small>}
    </div>;
  }
  const pending = plan.applications.filter((application) => application.status === "pending");
  return pending.length ? <div className={styles.actionRow}>{pending.map((application) => <div key={application.id}><small>{application.coach.coachCode} {application.coach.firstName} {application.coach.lastName}</small><button className={`${styles.secondary} ${styles.btnSm}`} disabled={busy} onClick={() => request("/api/admin/event-plans/applications", { applicationId: application.id, decision: "approved" })}>Approve</button><button className={`${styles.danger} ${styles.btnSm}`} disabled={busy} onClick={() => request("/api/admin/event-plans/applications", { applicationId: application.id, decision: "rejected" })}>Reject</button></div>)}{message && <small role="status">{message}</small>}</div> : null;
}

function CreatePlan({ sports }) {
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const sportIds = form.getAll("sportIds").map(Number);
    const body = { eventName: form.get("eventName"), startDate: form.get("startDate"), endDate: form.get("endDate"), venue: form.get("venue"), description: form.get("description"), programFlow: form.get("programFlow"), status: form.get("status"), sportIds };
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/event-plans", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { setMessage("Event plan created. Refresh to see it."); event.currentTarget.reset(); }
      else setMessage(result.error || "Could not create plan.");
    } catch (err) { setMessage("Unable to reach the server."); }
    setBusy(false);
  }
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Schedule</p><h2>Create event plan</h2></div></div>
      <form onSubmit={submit} className={styles.formGrid}>
        <label>Event name *<input name="eventName" required maxLength="191" placeholder="e.g. City Sports Festival" /></label>
        <label>Status<select name="status" defaultValue="open"><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option></select></label>
        <label>Start date *<input name="startDate" type="date" required /></label>
        <label>End date<input name="endDate" type="date" /></label>
        <label>Venue *<input name="venue" required maxLength="191" placeholder="e.g. City Sports Complex" /></label>
        <label>Description<textarea name="description" rows="3" maxLength="2000" /></label>
        <label className={styles.fullField}>Sports *<span className={styles.checkboxList}>{sports.map((sport) => <label key={sport.id}><input type="checkbox" name="sportIds" value={sport.id} />{sport.sportName}</label>)}</span></label>
        <label className={styles.fullField}>Program flow<textarea name="programFlow" rows="4" maxLength="10000" /></label>
        <div className={styles.formActions}><button className={styles.primary} disabled={busy}>{busy ? "Creating..." : "Create plan"}</button></div>
        {message && <p role="status" className={`${styles.fullField} ${message.includes("created") ? styles.formSuccess : styles.formError}`}>{message}</p>}
      </form>
    </section>
  );
}
