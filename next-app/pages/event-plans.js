import Head from "next/head";
import { useRouter } from "next/router";
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
  const where = isAdmin ? undefined : { status: { in: ["open", "closed"] } };
  const planResult = await paginatePrisma(prisma.eventPlan, page, { where, orderBy: { startDate: "asc" }, include: { sports: { include: { sport: true } }, applications: { include: { coach: { select: { coachCode: true, firstName: true, middleName: true, lastName: true } } } }, participants: { where: { status: "active" }, include: { coach: { select: { coachCode: true, firstName: true, middleName: true, lastName: true, school: { select: { schoolName: true } } } }, athlete: { select: { athleteCode: true, firstName: true, middleName: true, lastName: true, sport: { select: { sportName: true } }, school: { select: { schoolName: true } } } }, sport: { select: { sportName: true } } } } } });
  const plans = planResult.items.map((plan) => ({ ...plan, startDate: plan.startDate.toISOString(), endDate: plan.endDate?.toISOString() || null }));
  let sports = null;
  let athletes = null;
  let coachId = null;
  if (isAdmin) {
    sports = await prisma.sport.findMany({ where: { status: "active" }, select: { id: true, sportName: true }, orderBy: { sportName: "asc" } });
  } else {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    coachId = coach?.id ?? null;
    athletes = coach ? await prisma.athlete.findMany({ where: { coach: { userId: Number(session.user.id) }, status: "active" }, select: { id: true, athleteCode: true, firstName: true, lastName: true }, orderBy: { lastName: "asc" } }) : [];
  }
  return { props: { session, plans, page: planResult.page, totalPages: planResult.totalPages, sports, athletes: JSON.parse(JSON.stringify(athletes)), coachId } };
}

const STATUS_META = {
  draft: { label: "Draft", color: "#d6b26e", background: "rgba(214, 178, 110, .14)" },
  open: { label: "Open", color: "var(--accent)", background: "rgba(45, 212, 168, .16)" },
  closed: { label: "Closed", color: "#9db6c7", background: "rgba(157, 182, 199, .14)" },
  cancelled: { label: "Cancelled", color: "#f87171", background: "rgba(248, 113, 113, .14)" },
};

function StatusChip({ status }) {
  const meta = STATUS_META[status] || { label: status, color: "#9db6c7", background: "rgba(157, 182, 199, .14)" };
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", background: meta.background, color: meta.color, whiteSpace: "nowrap" }}>{meta.label}</span>;
}

function formatDate(value) {
  const date = new Date(value);
  return isNaN(date) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatRange(start, end) {
  const from = formatDate(start);
  const to = formatDate(end);
  return end ? `${from} to ${to}` : from;
}

export default function EventPlans({ plans, session, page, totalPages, sports, athletes, coachId }) {
  const isAdmin = session?.user?.role === "admin";
  const [createPanel, setCreatePanel] = React.useState(false);
  const [openId, setOpenId] = React.useState(null);

  return (
    <>
      <Head><title>Event plans | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Participation" title="Event plans" active="/event-plans">
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Participation</p><h2>Event plans</h2></div>
            {isAdmin && <button className={styles.primary} onClick={() => setCreatePanel((current) => !current)}>{createPanel ? "Close form" : "Create plan"}</button>}
          </div>

          {isAdmin && createPanel && (
            <div className={styles.panel} style={{ marginBottom: 22, marginTop: 0 }}>
              <CreatePlan sports={sports} />
            </div>
          )}

          {plans.length > 0 ? (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Schedule</th>
                    <th>Venue</th>
                    <th>Sports</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <React.Fragment key={plan.id}>
                      <tr>
                        <td><strong>{plan.eventName}</strong></td>
                        <td>{formatRange(plan.startDate, plan.endDate)}</td>
                        <td>{plan.venue}</td>
                        <td>
                          {plan.sports.length > 0 ? (
                            plan.sports.map((item) => (
                              <span key={item.sportId} style={{ display: "inline-block", background: "rgba(45,212,168,.16)", color: "var(--accent)", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, margin: "2px 4px 2px 0" }}>{item.sport.sportName}</span>
                            ))
                          ) : (
                            <span style={{ color: "var(--muted)", fontSize: 13 }}>No sports</span>
                          )}
                        </td>
                        <td><StatusChip status={plan.status} /></td>
                        <td>
                          <button type="button" className={styles.expandBtn} onClick={() => setOpenId((current) => (current === plan.id ? null : plan.id))}>
                            {openId === plan.id ? "Hide details ▲" : "View details ▼"}
                          </button>
                        </td>
                      </tr>
                      {openId === plan.id && (
                        <tr>
                          <td colSpan="6" style={{ padding: 0, background: "transparent" }}>
                            <div className={styles.detailPanel} style={{ display: "flex", flexDirection: "column", gap: "26px" }}>
                              <div>
                                <h4>Event details</h4>
                                <dl className={styles.infoList}>
                                  <div><dt>Event name</dt><dd>{plan.eventName}</dd></div>
                                  <div><dt>Status</dt><dd><StatusChip status={plan.status} /></dd></div>
                                  <div><dt>Schedule</dt><dd>{formatRange(plan.startDate, plan.endDate)}</dd></div>
                                  <div><dt>Venue</dt><dd>{plan.venue || "—"}</dd></div>
                                  <div><dt>Sports</dt><dd>{plan.sports.length ? plan.sports.map((item) => item.sport.sportName).join(", ") : "—"}</dd></div>
                                  <div><dt>Description</dt><dd>{plan.description || "No description provided."}</dd></div>
                                  <div><dt>Program flow</dt><dd>{plan.programFlow || "—"}</dd></div>
                                </dl>
                              </div>
                              <div style={{ borderTop: "1px solid rgba(26, 92, 74, .5)", paddingTop: "22px" }}>
                                <h4>Participation</h4>
                                <EventPlanActions plan={plan} session={session} athletes={athletes} coachId={coachId} sports={sports} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.empty}>No event plans to show.</p>
          )}
          <Pagination page={page} totalPages={totalPages} />
        </section>
      </AppShell>
    </>
  );
}

function participantName(p) {
  if (p.athlete) return `${p.athlete.lastName}, ${p.athlete.firstName}${p.athlete.middleName ? " " + p.athlete.middleName : ""}`;
  return `${p.coach.lastName}, ${p.coach.firstName}${p.coach.middleName ? " " + p.coach.middleName : ""}`;
}

function ParticipationToggle({ open, count, children, label }) {
  const [isOpen, setIsOpen] = React.useState(open);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <button type="button" className={styles.expandBtn} onClick={() => setIsOpen((current) => !current)} style={{ alignSelf: "flex-start" }}>
        {isOpen ? "Hide " : "View "}{label} ({count}) {isOpen ? "▲" : "▼"}
      </button>
      {isOpen && children}
    </div>
  );
}

function AthleteList({ items, empty, onRemove, busyRemove }) {
  if (!items.length) return <div className={styles.detailEmpty}>{empty}</div>;
  return (
    <div className={styles.statusAthletes}>
      {items.map((p) => (
        <div key={p.id} className={styles.statusAthlete}>
          <span className={styles.statusAthleteName}>{p.athlete.firstName} {p.athlete.lastName}</span>
          <small>{p.athlete.athleteCode} · {p.sport.sportName || "—"}</small>
          {onRemove && <button type="button" className={`${styles.danger} ${styles.btnSm}`} disabled={busyRemove} onClick={() => onRemove(p.athlete.id)}>Remove</button>}
        </div>
      ))}
    </div>
  );
}

function CoachRow({ coach, athletesOfCoach, open, onToggle }) {
  const hasAthletes = athletesOfCoach.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "10px", background: "rgba(10, 50, 40, 0.7)" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>{coach.firstName} {coach.lastName}</strong>
          <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{coach.coachCode}{coach.school ? ` · ${coach.school.schoolName}` : ""}</small>
        </div>
        {hasAthletes && (
          <button type="button" className={styles.expandBtn} onClick={onToggle}>
            {open ? "Hide " : "View "}athletes ({athletesOfCoach.length}) {open ? "▲" : "▼"}
          </button>
        )}
        {!hasAthletes && <small style={{ color: "var(--muted)", fontSize: 12 }}>No athletes enrolled</small>}
      </div>
      {open && <AthleteList items={athletesOfCoach} empty="No athletes enrolled under this coach." />}
    </div>
  );
}

function CoachGroup({ coachId, participants }) {
  const [open, setOpen] = React.useState(false);
  const coach = participants.find((p) => p.coach && p.coachId === coachId)?.coach;
  const athleteRows = participants.filter((p) => p.participantType === "athlete" && p.coachId === coachId);
  if (!coach) return null;
  return <CoachRow coach={coach} athletesOfCoach={athleteRows} open={open} onToggle={() => setOpen((c) => !c)} />;
}

function ParticipantRoster({ participants, myCoachId, onRemove, busyRemove }) {
  const allAthletes = participants.filter((p) => p.participantType === "athlete");
  const seenCoaches = new Set();
  const coachParticipants = participants.filter((p) => {
    if (p.participantType !== "coach" || !p.coach) return false;
    if (seenCoaches.has(p.coachId)) return false;
    seenCoaches.add(p.coachId);
    return true;
  });
  const isCoachView = Boolean(myCoachId);
  const canRemove = (p) => (isCoachView ? p.coachId === myCoachId : Boolean(onRemove));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div>
        <p className={styles.eyebrow} style={{ marginBottom: 8 }}>Athletes ({allAthletes.length})</p>
        {allAthletes.length ? (
          <div className={styles.statusAthletes}>
            {allAthletes.map((p) => (
              <div key={p.id} className={styles.statusAthlete}>
                <div style={{ minWidth: 0 }}>
                  <span className={styles.statusAthleteName}>{p.athlete.firstName} {p.athlete.lastName}</span>
                  <small>{p.athlete.athleteCode || "—"} · {p.sport?.sportName || "—"}{p.coach ? ` · Coach ${p.coach.coachCode || ""}` : ""}</small>
                </div>
                {canRemove(p) && <button type="button" className={`${styles.danger} ${styles.btnSm}`} disabled={busyRemove} onClick={() => onRemove(p.athlete.id)}>Remove</button>}
              </div>
            ))}
          </div>
        ) : <div className={styles.detailEmpty}>No athletes enrolled in this event plan.</div>}
      </div>
      <div>
        <p className={styles.eyebrow} style={{ marginBottom: 8 }}>Coaches ({coachParticipants.length})</p>
        {coachParticipants.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {coachParticipants.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "10px", background: "rgba(10, 50, 40, 0.7)" }}>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{p.coach.firstName} {p.coach.lastName}</strong>
                  <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{p.coach.coachCode}{p.coach.school ? ` · ${p.coach.school.schoolName}` : ""}</small>
                </div>
              </div>
            ))}
          </div>
        ) : <div className={styles.detailEmpty}>No participating coaches yet.</div>}
      </div>
    </div>
  );
}

function EventPlanActions({ plan, session, athletes, coachId, sports }) {
  const router = useRouter();
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [addedIds, setAddedIds] = React.useState(() => new Set((plan.participants || []).map((p) => p.athleteId)));
  const [editOpen, setEditOpen] = React.useState(false);

  async function request(url, body, refresh) {
    setBusy(true); setMessage("");
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(result.error || "Action failed."); return; }
      if (refresh) { router.replace(router.asPath); return; }
      setMessage("Saved successfully.");
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  function toggleAthlete(id) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function addAthletes() {
    const targets = selectedIds.filter((id) => !addedIds.has(id));
    if (!targets.length) return;
    setBusy(true);
    setMessage("");
    let added = 0;
    let firstError = "";
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      for (const athleteId of targets) {
        try {
          const response = await fetch("/api/event-plans/participants", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ eventPlanId: plan.id, athleteId }) });
          const result = await response.json().catch(() => ({}));
          if (response.ok && !result.error) added++;
          else if (!firstError) firstError = result.error || "One or more athletes could not be added.";
        } catch {
          if (!firstError) firstError = "Unable to reach the server.";
        }
      }
    } catch {
      firstError = "Unable to reach the server.";
    }
    if (added > 0) {
      setAddedIds((current) => new Set([...current, ...targets]));
      setMessage(`Added ${added} athlete${added > 1 ? "s" : ""} to the event plan.`);
    } else {
      setMessage(firstError || "No athletes were added.");
    }
    setSelectedIds([]);
    setPickerOpen(false);
    setBusy(false);
  }

  async function removeAthlete(athleteId) {
    if (!window.confirm("Remove this athlete from the event plan?")) return;
    setBusy(true);
    setMessage("");
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/event-plans/participants", { method: "DELETE", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ eventPlanId: plan.id, athleteId }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { router.replace(router.asPath); return; }
      setMessage(result.error || "Could not remove athlete.");
    } catch { setMessage("Unable to reach the server."); }
    setBusy(false);
  }

  async function cancelPlan() {
    if (!window.confirm(`Cancel "${plan.eventName}"? It will be marked as cancelled and hidden from open participation.`)) return;
    setBusy(true);
    setMessage("");
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/event-plans", { method: "DELETE", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ id: plan.id }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { router.replace(router.asPath); return; }
      setMessage(result.error || "Could not cancel plan.");
    } catch { setMessage("Unable to reach the server."); }
    setBusy(false);
  }

  if (session.user.role === "coach") {
    const myApp = coachId ? plan.applications.find((application) => application.coachId === coachId) : null;
    if (plan.status === "closed") {
      return <p style={{ color: "var(--muted)", fontSize: 13, margin: "12px 0 0" }}>This event plan has been closed. Participation is no longer open.</p>;
    }
    const isApproved = Boolean(myApp && myApp.status === "approved");
    const available = athletes || [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        {plan.status === "closed" ? (
          <small style={{ color: "var(--muted)", fontSize: 13 }}>This event plan has been closed. Participation is no longer open.</small>
        ) : isApproved ? (
          <div className={styles.actionRow}>
            <small role="status"><span style={{ color: "var(--success)", fontWeight: 700 }}>&#10003;</span> You are enrolled in this event plan.</small>
            {available.length > 0 ? (
              <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={() => setPickerOpen((current) => !current)}>{pickerOpen ? "Close athlete list" : "Add athlete"}</button>
            ) : (
              <small style={{ color: "var(--muted)" }}>You have no active athletes to add.</small>
            )}
            {message && <small role="status">{message}</small>}
          </div>
        ) : myApp && myApp.status === "pending" ? (
          <small style={{ color: "var(--muted)", fontSize: 13 }}>Your application to this event plan is under review.</small>
        ) : myApp && myApp.status === "rejected" ? (
          <div className={styles.actionRow}>
            <small style={{ color: "var(--danger)" }}>Your previous application was not approved. You may apply again.</small>
            <button className={styles.secondary} disabled={busy} onClick={() => request("/api/event-plans/applications", { eventPlanId: plan.id }, true)}>Apply again</button>
            {message && <small role="status">{message}</small>}
          </div>
        ) : (
          <div className={styles.actionRow}>
            <button className={styles.secondary} disabled={busy} onClick={() => request("/api/event-plans/applications", { eventPlanId: plan.id }, true)}>Apply to participate</button>
            {message && <small role="status">{message}</small>}
          </div>
        )}
        {available.length > 0 && pickerOpen && (
          <div style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "18px", background: "rgba(6, 38, 30, 0.5)", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <p className={styles.eyebrow} style={{ marginBottom: 4 }}>Select athletes to add</p>
              <p className={styles.formHint} style={{ margin: 0 }}>Only active athletes assigned to you are listed. Already-added athletes are marked and cannot be selected again.</p>
            </div>
            <div className={styles.checkboxList}>
              {available.map((athlete) => {
                const done = addedIds.has(athlete.id);
                return (
                  <label key={athlete.id}>
                    <input type="checkbox" checked={selectedIds.includes(athlete.id)} disabled={done || busy} onChange={() => toggleAthlete(athlete.id)} />
                    <span>{athlete.lastName}, {athlete.firstName} ({athlete.athleteCode}){done ? " — added" : ""}</span>
                  </label>
                );
              })}
            </div>
            {message && <p role="status" className={styles.formHint} style={{ margin: 0, color: message.startsWith("Added") ? "var(--success)" : "var(--danger)" }}>{message}</p>}
            <div className={styles.stackedActions}>
              <button className={styles.primary} disabled={busy || selectedIds.filter((id) => !addedIds.has(id)).length === 0} onClick={addAthletes}>
                {busy ? "Adding..." : `Add selected (${selectedIds.filter((id) => !addedIds.has(id)).length})`}
              </button>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setPickerOpen(false); setSelectedIds([]); }}>Cancel</button>
            </div>
          </div>
        )}
        <ParticipationToggle label="participants" count={(plan.participants || []).length} open={true}>
          <ParticipantRoster participants={plan.participants || []} myCoachId={coachId} onRemove={isApproved ? removeAthlete : undefined} busyRemove={busy} />
        </ParticipationToggle>
      </div>
    );
  }

const pending = plan.applications.filter((application) => application.status === "pending");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div className={styles.actionRow}>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => setEditOpen(!editOpen)}>{editOpen ? "Close editor" : "Edit plan"}</button>
        <button type="button" className={`${styles.danger} ${styles.btnSm}`} disabled={busy || plan.status === "cancelled"} onClick={cancelPlan}>{plan.status === "cancelled" ? "Cancelled" : "Cancel plan"}</button>
        {message && <small role="status">{message}</small>}
      </div>
      {editOpen && <EditPlan plan={plan} sports={sports} />}
      <ParticipationToggle label="pending coaches" count={pending.length} open={pending.length > 0}>
        {pending.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {pending.map((application) => (
              <div key={application.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "8px", background: "rgba(6, 38, 30, 0.4)" }}>
                <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{application.coach.firstName} {application.coach.lastName}</strong>
                  <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{application.coach.coachCode || "—"}</small>
                </div>
                <div className={styles.stackedActions}>
                  <button className={`${styles.secondary} ${styles.btnSm}`} disabled={busy} onClick={() => request("/api/admin/event-plans/applications", { applicationId: application.id, decision: "approved" }, true)}>Approve</button>
                  <button className={`${styles.danger} ${styles.btnSm}`} disabled={busy} onClick={() => request("/api/admin/event-plans/applications", { applicationId: application.id, decision: "rejected" }, true)}>Reject</button>
                </div>
              </div>
            ))}
            {message && <small role="status">{message}</small>}
          </div>
        ) : <div className={styles.detailEmpty}>No applications pending review.</div>}
      </ParticipationToggle>
      <ParticipationToggle label="participants" count={(plan.participants || []).length} open={false}>
        <ParticipantRoster participants={plan.participants || []} />
      </ParticipationToggle>
    </div>
  );
}

function CreatePlan({ sports }) {
  const router = useRouter();
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
      if (response.ok && !result.error) { event.currentTarget.reset(); router.replace(router.asPath); return; }
      setMessage(result.error || "Could not create plan.");
    } catch (err) { setMessage("Unable to reach the server."); }
    setBusy(false);
  }
  return (
    <>
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
    </>
  );
}

function EditPlan({ plan, sports }) {
  const router = useRouter();
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const currentSportIds = (plan.sports || []).map((s) => s.sportId);
  const fmtDateInput = (dt) => (dt ? new Date(dt).toISOString().slice(0, 10) : "");
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const sportIds = form.getAll("sportIds").map(Number);
    const body = { id: plan.id, eventName: form.get("eventName"), startDate: form.get("startDate"), endDate: form.get("endDate"), venue: form.get("venue"), description: form.get("description"), programFlow: form.get("programFlow"), status: form.get("status"), sportIds };
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/event-plans", { method: "PUT", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { router.replace(router.asPath); return; }
      setMessage(result.error || "Could not update plan.");
    } catch (err) { setMessage("Unable to reach the server."); }
    setBusy(false);
  }
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "18px", background: "rgba(6, 38, 30, 0.4)", display: "flex", flexDirection: "column", gap: "12px" }}>
      <p className={styles.eyebrow}>Edit event plan</p>
      <form onSubmit={submit} className={styles.formGrid}>
        <label>Event name *<input name="eventName" className={styles.fieldControl} required maxLength="191" defaultValue={plan.eventName} /></label>
        <label>Status<select name="status" className={styles.fieldControl} defaultValue={plan.status}><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option></select></label>
        <label>Start date *<input name="startDate" className={styles.fieldControl} type="date" required defaultValue={fmtDateInput(plan.startDate)} /></label>
        <label>End date<input name="endDate" className={styles.fieldControl} type="date" defaultValue={fmtDateInput(plan.endDate)} /></label>
        <label>Venue *<input name="venue" className={styles.fieldControl} required maxLength="191" defaultValue={plan.venue} /></label>
        <label>Description<textarea name="description" className={styles.fieldControl} rows="3" maxLength="2000" defaultValue={plan.description || ""} /></label>
        <label className={styles.fullField}>Sports *<span className={styles.checkboxList}>{sports.map((sport) => <label key={sport.id}><input type="checkbox" name="sportIds" value={sport.id} defaultChecked={currentSportIds.includes(sport.id)} />{sport.sportName}</label>)}</span></label>
        <label className={styles.fullField}>Program flow<textarea name="programFlow" className={styles.fieldControl} rows="4" maxLength="10000" defaultValue={plan.programFlow || ""} /></label>
        <div className={styles.formActions}><button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Save plan"}</button></div>
        {message && <p role="status" className={`${styles.fullField} ${styles.formHint}`}>{message}</p>}
      </form>
    </div>
  );
}
