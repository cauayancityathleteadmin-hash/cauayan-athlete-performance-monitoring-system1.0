import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import { paginatePrisma } from "../lib/pagination";
import Pagination from "../components/Pagination";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";
import { LEVEL_ORDER, LEVEL_LABELS, MEDALS } from "../lib/points";

// Competition levels for a meet (single source: lib/points.js). "city" is the
// Division/Cluster meet tier; matches the achievement + Standing level wording.
const LEVEL_OPTIONS = LEVEL_ORDER.map((value) => ({ value, label: LEVEL_LABELS[value] }));
const MEDAL_LABELS = Object.fromEntries(MEDALS.map((m) => [m.value, m.label]));

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
    athletes = coach ? await prisma.athlete.findMany({ where: { coach: { userId: Number(session.user.id) }, status: "active" }, select: { id: true, athleteCode: true, firstName: true, lastName: true, sportId: true }, orderBy: { lastName: "asc" } }) : [];
  }
  return { props: { session, plans: JSON.parse(JSON.stringify(plans)), page: planResult.page, totalPages: planResult.totalPages, sports, athletes: JSON.parse(JSON.stringify(athletes)), coachId } };
}

const STATUS_META = {
  draft: { label: "Draft", color: "var(--warning-dark)", background: "rgba(214, 178, 110, .14)" },
  open: { label: "Open", color: "var(--accent)", background: "rgba(45, 212, 168, .16)" },
  closed: { label: "Closed", color: "var(--muted)", background: "rgba(134, 238, 172, .14)" },
  cancelled: { label: "Cancelled", color: "var(--danger)", background: "rgba(248, 113, 113, .14)" },
};

function StatusChip({ status }) {
  const meta = STATUS_META[status] || { label: status, color: "var(--muted)", background: "rgba(134, 238, 172, .14)" };
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
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Events" title="Event plans" active="/event-plans">
        <div className={styles.pageTitle}><h1>Events</h1></div>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Events</p><h2>Events</h2></div>
            {isAdmin && <button className={styles.primary} onClick={() => setCreatePanel((current) => !current)}>{createPanel ? "Close form" : "Create plan"}</button>}
          </div>

          {isAdmin && createPanel && (
            <div className={styles.panel} style={{ marginBottom: "var(--space-5)", marginTop: 0 }}>
              <CreatePlan sports={sports} />
            </div>
          )}

          {plans.length > 0 ? (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Schedule</th>
                    <th scope="col">Venue</th>
                    <th scope="col">Sports</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <React.Fragment key={plan.id}>
                      <tr>
                        <td data-label="Event"><strong>{plan.eventName}</strong></td>
                        <td data-label="Schedule">{formatRange(plan.startDate, plan.endDate)}</td>
                        <td data-label="Venue">{plan.venue}</td>
                        <td data-label="Sports">
                          {plan.sports.length > 0 ? (
                            plan.sports.map((item) => (
                              <span key={item.sportId} style={{ display: "inline-block", background: "rgba(45,212,168,.16)", color: "var(--accent)", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, margin: "2px 4px 2px 0" }}>{item.sport.sportName}</span>
                            ))
                          ) : (
                            <span style={{ color: "var(--muted)", fontSize: 13 }}>No sports</span>
                          )}
                        </td>
                        <td data-label="Status"><StatusChip status={plan.status} /></td>
                        <td data-label="Action">
                          <button type="button" className={styles.expandBtn} onClick={() => setOpenId((current) => (current === plan.id ? null : plan.id))}>
                            {openId === plan.id ? "Hide details ▲" : "View details ▼"}
                          </button>
                        </td>
                      </tr>
                      {openId === plan.id && (
                        <tr>
                          <td colSpan="6" style={{ padding: 0, background: "transparent" }}>
                            <div className={styles.detailPanel} style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
                              <div>
                                <h4>Event details</h4>
                                <dl className={styles.infoList}>
                                  <div><dt>Event name</dt><dd>{plan.eventName}</dd></div>
                                  <div><dt>Status</dt><dd><StatusChip status={plan.status} /></dd></div>
                                  <div><dt>Schedule</dt><dd>{formatRange(plan.startDate, plan.endDate)}</dd></div>
                                  <div><dt>Venue</dt><dd>{plan.venue || "—"}</dd></div>
                                  <div><dt>Level</dt><dd>{plan.eventLevel ? (LEVEL_LABELS[plan.eventLevel] || plan.eventLevel) : "—"}</dd></div>
                                  <div><dt>Sports</dt><dd>{plan.sports.length ? plan.sports.map((item) => item.sport.sportName).join(", ") : "—"}</dd></div>
                                  <div><dt>Description</dt><dd>{plan.description || "No description provided."}</dd></div>
                                  <div><dt>Purpose</dt><dd>{plan.purpose || "—"}</dd></div>
                                  <div><dt>Target audience</dt><dd>{plan.targetParticipants ? `${plan.targetParticipants} participants` : "Any"} · {plan.targetGender ? plan.targetGender : "any gender"}{plan.targetAgeMin ? ` · ages ${plan.targetAgeMin}${plan.targetAgeMax ? `–${plan.targetAgeMax}` : "+"}` : ""}</dd></div>
                                  <div><dt>Program flow</dt><dd>{plan.programFlow || "—"}</dd></div>
                                </dl>
                              </div>
                              <div style={{ borderTop: "1px solid rgba(26, 92, 74, .5)", paddingTop: "var(--space-5)" }}>
                                <h4>Participation</h4>
                                <EventPlanActions plan={plan} session={session} athletes={athletes} coachId={coachId} sports={sports} />
                              </div>
                              <div style={{ borderTop: "1px solid rgba(26, 92, 74, .5)", paddingTop: "var(--space-5)" }}>
                                <EventPhotos plan={plan} isAdmin={isAdmin} coachId={coachId} />
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

/* Group active participant rows into distinct people: one coach group per coach
   (delegation rows + athlete rows), and one athlete entry per athleteId (sports joined),
   so counts always equal the names actually rendered. */
function groupParticipation(participants) {
  const byCoach = new Map();
  for (const p of participants || []) {
    if (!p.coach) continue;
    let group = byCoach.get(p.coachId);
    if (!group) {
      group = { coach: p.coach, delegateSports: [], athletes: new Map() };
      byCoach.set(p.coachId, group);
    }
    const sportName = p.sport?.sportName || "—";
    if (p.participantType === "coach") {
      group.delegateSports.push(sportName);
    } else if (p.athlete) {
      let entry = group.athletes.get(p.athleteId);
      if (!entry) {
        entry = { athlete: p.athlete, sports: [] };
        group.athletes.set(p.athleteId, entry);
      }
      entry.sports.push(sportName);
    }
  }
  return [...byCoach.values()].map((g) => ({ coach: g.coach, delegateSports: g.delegateSports, athletes: [...g.athletes.values()] }));
}

function participationCount(participants) {
  const groups = groupParticipation(participants);
  const athletes = groups.reduce((sum, g) => sum + g.athletes.length, 0);
  const coaches = groups.length;
  return `${athletes} athlete${athletes === 1 ? "" : "s"} · ${coaches} coach${coaches === 1 ? "" : "es"}`;
}

function ParticipationToggle({ open, count, children, label }) {
  const [isOpen, setIsOpen] = React.useState(open);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
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
      {items.map((a) => (
        <div key={a.athlete.id} className={styles.statusAthlete}>
          <span className={styles.statusAthleteName}>{a.athlete.firstName} {a.athlete.lastName}</span>
          <small>{a.athlete.athleteCode} · {a.sports.join(", ") || "—"}</small>
          {onRemove && <button type="button" className={`${styles.danger} ${styles.btnSm}`} disabled={busyRemove} onClick={() => onRemove(a.athlete.id)}>Remove</button>}
        </div>
      ))}
    </div>
  );
}

function CoachRow({ group, open, onToggle }) {
  const { coach, delegateSports, athletes } = group;
  const hasAthletes = athletes.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", padding: "var(--space-3) var(--space-4)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "rgba(10, 50, 40, 0.7)" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>{coach.firstName} {coach.lastName}</strong>
          <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{coach.coachCode}{coach.school ? ` · ${coach.school.schoolName}` : ""}</small>
        </div>
        {delegateSports.length > 0 && (
          <span style={{ display: "inline-block", background: "rgba(45,212,168,.16)", color: "var(--accent)", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700 }}>Delegation · {delegateSports.join(", ")}</span>
        )}
        {hasAthletes && (
          <button type="button" className={styles.expandBtn} onClick={onToggle}>
            {open ? "Hide " : "View "}athletes ({athletes.length}) {open ? "▲" : "▼"}
          </button>
        )}
        {!hasAthletes && <small style={{ color: "var(--muted)", fontSize: 12 }}>No athletes enrolled</small>}
      </div>
      {open && <AthleteList items={athletes} empty="No athletes enrolled under this coach." />}
    </div>
  );
}

function CoachGroup({ group }) {
  const [open, setOpen] = React.useState(false);
  return <CoachRow group={group} open={open} onToggle={() => setOpen((c) => !c)} />;
}

function ParticipantRoster({ participants, myCoachId, onRemove, busyRemove }) {
  const groups = React.useMemo(() => groupParticipation(participants), [participants]);
  const myGroup = myCoachId ? groups.find((g) => g.coach.id === myCoachId) || null : null;
  const otherGroups = myCoachId ? groups.filter((g) => g.coach.id !== myCoachId) : groups;
  const sectionLabel = myCoachId ? "Other coaches" : "Coaches";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {myCoachId && (
        <div>
          <p className={styles.eyebrow} style={{ marginBottom: "var(--space-2)" }}>My athletes ({myGroup ? myGroup.athletes.length : 0})</p>
          {myGroup && myGroup.delegateSports.length > 0 && (
            <small style={{ display: "block", color: "var(--accent)", marginBottom: "var(--space-2)" }}>&#10003; You&apos;re enrolled as delegation ({myGroup.delegateSports.join(", ")}).</small>
          )}
          <AthleteList items={myGroup ? myGroup.athletes : []} empty="You have no athletes enrolled in this event plan." onRemove={onRemove} busyRemove={busyRemove} />
        </div>
      )}
      <div>
        <p className={styles.eyebrow} style={{ marginBottom: "var(--space-2)" }}>{sectionLabel} ({otherGroups.length})</p>
        {otherGroups.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {otherGroups.map((group) => <CoachGroup key={group.coach.id} group={group} />)}
          </div>
        ) : <div className={styles.detailEmpty}>{myCoachId ? "No other coaches participating yet." : "No participating coaches yet."}</div>}
      </div>
    </div>
  );
}

/* §7 Results: athletes enrolled in this event plan whose result can be recorded. */
function resultAthletes(participants) {
  return (participants || []).filter((p) => p.participantType === "athlete" && p.athlete && p.status === "active");
}

function ResultsEntry({ plan }) {
  const router = useRouter();
  const athletes = React.useMemo(() => resultAthletes(plan.participants), [plan.participants]);
  const [values, setValues] = React.useState(() => Object.fromEntries(athletes.map((p) => [p.id, p.resultMedal || ""])));
  const [busyId, setBusyId] = React.useState(null);
  const [message, setMessage] = React.useState("");

  if (!athletes.length) return <div className={styles.detailEmpty}>No athletes enrolled yet. Results can be recorded once athletes are added.</div>;

  const recorded = athletes.filter((p) => p.resultMedal).length;

  async function save(participant) {
    const medal = values[participant.id] || "";
    setBusyId(participant.id);
    setMessage("");
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/admin/event-plans/results", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ participantId: participant.id, medal: medal || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        setMessage(result.error || "Could not save result.");
        setBusyId(null);
        return;
      }
      setMessage(medal ? "Result saved. Achievement and Standing points updated." : "Result cleared.");
      router.replace(router.asPath);
    } catch {
      setMessage("Unable to reach the server.");
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <p className={styles.formHint} style={{ margin: 0 }}>
        Record each athlete&apos;s placement. Saving a medal creates or updates their achievement (level taken from the event plan) so Standing stays automatic.
        {plan.eventLevel ? "" : " Tip: set a Level on the event plan so recorded achievements score correctly."}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {athletes.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", padding: "var(--space-3) var(--space-4)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "rgba(6, 38, 30, 0.4)" }}>
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>{p.athlete.firstName} {p.athlete.lastName}</strong>
              <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{p.athlete.athleteCode} · {p.sport?.sportName || "—"}</small>
            </div>
            {p.resultMedal && (
              <span style={{ display: "inline-block", background: "rgba(214,178,110,.14)", color: "var(--warning-dark)", padding: "3px 10px", borderRadius: "12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{MEDAL_LABELS[p.resultMedal] || p.resultMedal}</span>
            )}
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
              <select aria-label={`Result for ${p.athlete.firstName} ${p.athlete.lastName}`} className={styles.fieldControl} value={values[p.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [p.id]: event.target.value }))} disabled={busyId === p.id}>
                <option value="">No result</option>
                {MEDALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <button type="button" className={`${styles.secondary} ${styles.btnSm}`} disabled={busyId === p.id || (values[p.id] ?? "") === (p.resultMedal || "")} onClick={() => save(p)}>{busyId === p.id ? "Saving…" : "Save"}</button>
            </div>
          </div>
        ))}
      </div>
      <p role="status" className={styles.formHint} style={{ margin: 0 }}>{recorded} of {athletes.length} result{athletes.length === 1 ? "" : "s"} recorded{message ? ` — ${message}` : ""}</p>
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
    const planSportIds = new Set((plan.sports || []).map((s) => s.sportId));
    const available = (athletes || []).filter((a) => planSportIds.has(a.sportId));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {plan.status === "closed" ? (
          <small style={{ color: "var(--muted)", fontSize: 13 }}>This event plan has been closed. Participation is no longer open.</small>
        ) : isApproved ? (
          <div className={styles.actionRow}>
            <small role="status"><span style={{ color: "var(--success)", fontWeight: 700 }}>&#10003;</span> You are enrolled in this event plan.</small>
            {available.length > 0 ? (
              <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={() => setPickerOpen((current) => !current)}>{pickerOpen ? "Close athlete list" : "Add athlete"}</button>
            ) : (
              <small style={{ color: "var(--muted)" }}>No active athletes in this event&apos;s sports to add.</small>
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
          <div className={styles.detailPanel} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
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
        {isApproved && (
          <ParticipationToggle label="participants" count={participationCount(plan.participants)} open={true}>
            <ParticipantRoster participants={plan.participants || []} myCoachId={coachId} onRemove={removeAthlete} busyRemove={busy} />
          </ParticipationToggle>
        )}
      </div>
    );
  }

const pending = plan.applications.filter((application) => application.status === "pending");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className={styles.actionRow}>
        <button type="button" className={`${styles.secondary} ${styles.btnSm}`} disabled={busy} onClick={() => setEditOpen(!editOpen)}>{editOpen ? "Close editor" : "Edit plan"}</button>
        <button type="button" className={`${styles.danger} ${styles.btnSm}`} disabled={busy || plan.status === "cancelled"} onClick={cancelPlan}>{plan.status === "cancelled" ? "Cancelled" : "Cancel plan"}</button>
        {message && <small role="status">{message}</small>}
      </div>
      {editOpen && <EditPlan plan={plan} sports={sports} />}
      <ParticipationToggle label="pending coaches" count={pending.length} open={pending.length > 0}>
        {pending.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {pending.map((application) => (
              <div key={application.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", padding: "var(--space-3) var(--space-4)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "rgba(6, 38, 30, 0.4)" }}>
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
      <ParticipationToggle label="participants" count={participationCount(plan.participants)} open={false}>
        <ParticipantRoster participants={plan.participants || []} />
      </ParticipationToggle>
      <ParticipationToggle label="results" count={resultAthletes(plan.participants).length} open={false}>
        <ResultsEntry plan={plan} />
      </ParticipationToggle>
    </div>
  );
}

/* Event documentation photos — winners per sport plus whole-event shots.
   Upload/delete is admin + coaches attached to the event (enforced by the API);
   every signed-in user can view. Photos are additive; nothing is ever replaced. */
function EventPhotos({ plan, isAdmin, coachId }) {
  const fileRef = React.useRef(null);
  const [photos, setPhotos] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("all");
  const [category, setCategory] = React.useState("winner");
  const [sportId, setSportId] = React.useState("");
  const [athleteId, setAthleteId] = React.useState("");
  const [caption, setCaption] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [lightbox, setLightbox] = React.useState(null);

  const canManage = Boolean(isAdmin)
    || Boolean(coachId && (plan.participants || []).some((p) => p.coachId === coachId))
    || Boolean(coachId && (plan.applications || []).some((a) => a.coachId === coachId && a.status === "approved"));
  const sports = (plan.sports || []).map((item) => item.sport).filter(Boolean);
  const athleteChoices = (plan.participants || []).filter((p) => p.participantType === "athlete" && p.athlete && (!sportId || p.sportId === Number(sportId)));

  const load = React.useCallback(() => {
    return fetch(`/api/event-plans/photos?eventPlanId=${plan.id}`)
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ data }) => setPhotos(Array.isArray(data.photos) ? data.photos : []))
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false));
  }, [plan.id]);

  React.useEffect(() => { load(); }, [load]);

  async function upload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Choose a JPEG, PNG, or WEBP photo.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.readAsDataURL(file);
      });
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/event-plans/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({
          eventPlanId: plan.id,
          category,
          sportId: sportId ? Number(sportId) : null,
          athleteId: athleteId ? Number(athleteId) : null,
          caption: caption.trim() || null,
          mime: file.type,
          base64,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) throw new Error(result.error || "Upload failed.");
      setCaption("");
      setAthleteId("");
      setMessage("Photo added.");
      await load();
    } catch (error) {
      setMessage(error.message || "Could not upload the photo.");
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function remove(photo) {
    if (typeof window !== "undefined" && !window.confirm("Delete this photo? This cannot be undone.")) return;
    setBusy(true);
    setMessage("");
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch(`/api/event-plans/photos?id=${photo.id}`, { method: "DELETE", headers: { "x-csrf-token": csrf.token } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) throw new Error(result.error || "Delete failed.");
      setMessage("Photo deleted.");
      await load();
    } catch (error) {
      setMessage(error.message || "Could not delete the photo.");
    }
    setBusy(false);
  }

  const shown = filter === "all" ? photos : photos.filter((p) => p.category === filter);
  const countFor = (value) => (value === "all" ? photos.length : photos.filter((p) => p.category === value).length);
  const photoLabel = (photo) => photo.caption || (photo.athlete ? `${photo.athlete.firstName} ${photo.athlete.lastName}` : "Event photo");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className={styles.panelHeader} style={{ margin: 0 }}>
        <div>
          <h4>Photos</h4>
          <p className={styles.formHint} style={{ margin: 0 }}>Documentation for this event — winners per sport and whole-event photos. JPEG, PNG or WEBP up to 2.5 MB.</p>
        </div>
        <span className={styles.formHint} style={{ margin: 0 }}>{photos.length} photo{photos.length === 1 ? "" : "s"}</span>
      </div>

      {canManage && (
        <div className={styles.formGrid}>
          <label>Photo type
            <select className={styles.fieldControl} value={category} onChange={(event) => { setCategory(event.target.value); if (event.target.value === "event") { setSportId(""); setAthleteId(""); } }}>
              <option value="winner">Winner photo</option>
              <option value="event">Whole event</option>
            </select>
          </label>
          <label>Sport {category === "winner" ? "*" : "(optional)"}
            <select className={styles.fieldControl} value={sportId} onChange={(event) => { setSportId(event.target.value); setAthleteId(""); }}>
              <option value="">Select sport</option>
              {sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.sportName}</option>)}
            </select>
          </label>
          {category === "winner" && (
            <label>Athlete (optional)
              <select className={styles.fieldControl} value={athleteId} onChange={(event) => setAthleteId(event.target.value)}>
                <option value="">Whole sport / team</option>
                {athleteChoices.map((p) => <option key={p.id} value={p.athleteId}>{p.athlete.lastName}, {p.athlete.firstName}</option>)}
              </select>
            </label>
          )}
          <label>Caption (optional)
            <input className={styles.fieldControl} value={caption} maxLength={300} onChange={(event) => setCaption(event.target.value)} placeholder="e.g. Gold - 100m Boys" />
          </label>
          <div className={styles.formActions}>
            <button type="button" className={styles.primary} disabled={busy || (category === "winner" && !sportId)} onClick={() => fileRef.current && fileRef.current.click()}>
              {busy ? "Uploading..." : "Upload photo"}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy} style={{ display: "none" }} />
        </div>
      )}

      {message && <p role="status" className={styles.formHint} style={{ margin: 0 }}>{message}</p>}

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {[["all", "All"], ["winner", "Winners"], ["event", "Whole event"]].map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value} className={`${filter === value ? styles.primary : styles.secondary} ${styles.btnSm}`} onClick={() => setFilter(value)}>
            {label} ({countFor(value)})
          </button>
        ))}
      </div>

      {loading ? (
        <p className={styles.formHint} style={{ margin: 0 }}>Loading photos...</p>
      ) : shown.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "var(--space-4)" }}>
          {shown.map((photo) => (
            <figure key={photo.id} style={{ margin: 0, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "rgba(6, 38, 30, 0.4)" }}>
              <button type="button" onClick={() => setLightbox(photo)} aria-label={`View ${photoLabel(photo)}`} style={{ display: "block", width: "100%", padding: 0, border: 0, background: "transparent", cursor: "zoom-in" }}>
                <img src={photo.url} alt={photoLabel(photo)} style={{ display: "block", width: "100%", height: 120, objectFit: "cover" }} />
              </button>
              <figcaption style={{ padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: photo.category === "winner" ? "var(--warning-dark)" : "var(--muted)" }}>
                  {photo.category === "winner" ? "Winner" : "Event"}{photo.sport ? ` · ${photo.sport.sportName}` : ""}
                </span>
                <span style={{ fontSize: 13 }}>{photoLabel(photo)}</span>
                {canManage && <button type="button" className={`${styles.secondary} ${styles.btnSm}`} disabled={busy} onClick={() => remove(photo)} style={{ alignSelf: "flex-start", marginTop: 4 }}>Delete</button>}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className={styles.detailEmpty}>
          {filter === "all" ? "No photos yet." : `No ${filter === "winner" ? "winner" : "whole-event"} photos yet.`}{canManage ? " Upload the first one above." : ""}
        </div>
      )}

      {lightbox && (
        <div role="dialog" aria-modal="true" aria-label="Event photo" style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(2, 12, 9, 0.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--space-4)", padding: "var(--space-5)" }}>
          <img src={lightbox.url} alt={photoLabel(lightbox)} style={{ maxWidth: "100%", maxHeight: "78vh", objectFit: "contain", borderRadius: "var(--radius-lg)" }} />
          <p style={{ margin: 0, color: "var(--foreground)", textAlign: "center" }}>{photoLabel(lightbox)}</p>
          <button type="button" className={styles.secondary} onClick={() => setLightbox(null)}>Close</button>
        </div>
      )}
    </div>
  );
}

function CreatePlan({ sports }) {
  const router = useRouter();
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [today] = React.useState(() => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); });
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const sportIds = form.getAll("sportIds").map(Number);
    const body = { eventName: form.get("eventName"), startDate: form.get("startDate"), endDate: form.get("endDate"), venue: form.get("venue"), description: form.get("description"), programFlow: form.get("programFlow"), status: form.get("status"), purpose: form.get("purpose"), targetParticipants: form.get("targetParticipants"), targetAgeMin: form.get("targetAgeMin"), targetAgeMax: form.get("targetAgeMax"), targetGender: form.get("targetGender") || null, eventLevel: form.get("eventLevel") || null, sportIds };
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
        <label>Level<select name="eventLevel" defaultValue=""><option value="">Not set</option>{LEVEL_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></label>
        <label>Start date *<input name="startDate" type="date" required defaultValue={today} /></label>
        <label>End date<input name="endDate" type="date" /></label>
        <label>Venue *<input name="venue" required maxLength="191" placeholder="e.g. City Sports Complex" /></label>
        <label>Description<textarea name="description" rows="3" maxLength="2000" /></label>
        <label className={styles.fullField}>Purpose<textarea name="purpose" rows="2" maxLength="2000" placeholder="e.g. Select athletes for the regional qualifying meet" /></label>
        <label>Target participants<input name="targetParticipants" type="number" min="1" max="100000" placeholder="e.g. 200" /></label>
        <label>Target gender<select name="targetGender" defaultValue=""><option value="">Any</option><option value="male">Male</option><option value="female">Female</option><option value="mixed">Mixed</option></select></label>
        <label>Min age<input name="targetAgeMin" type="number" min="5" max="100" placeholder="e.g. 12" /></label>
        <label>Max age<input name="targetAgeMax" type="number" min="5" max="100" placeholder="e.g. 18" /></label>
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
    const body = { id: plan.id, eventName: form.get("eventName"), startDate: form.get("startDate"), endDate: form.get("endDate"), venue: form.get("venue"), description: form.get("description"), programFlow: form.get("programFlow"), status: form.get("status"), purpose: form.get("purpose"), targetParticipants: form.get("targetParticipants"), targetAgeMin: form.get("targetAgeMin"), targetAgeMax: form.get("targetAgeMax"), targetGender: form.get("targetGender") || null, eventLevel: form.get("eventLevel") || null, sportIds };
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
    <div className={styles.detailPanel} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <p className={styles.eyebrow}>Edit event plan</p>
      <form onSubmit={submit} className={styles.formGrid}>
        <label>Event name *<input name="eventName" className={styles.fieldControl} required maxLength="191" defaultValue={plan.eventName} /></label>
        <label>Status<select name="status" className={styles.fieldControl} defaultValue={plan.status}><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option></select></label>
        <label>Level<select name="eventLevel" className={styles.fieldControl} defaultValue={plan.eventLevel || ""}><option value="">Not set</option>{LEVEL_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></label>
        <label>Start date *<input name="startDate" className={styles.fieldControl} type="date" required defaultValue={fmtDateInput(plan.startDate)} /></label>
        <label>End date<input name="endDate" className={styles.fieldControl} type="date" defaultValue={fmtDateInput(plan.endDate)} /></label>
        <label>Venue *<input name="venue" className={styles.fieldControl} required maxLength="191" defaultValue={plan.venue} /></label>
        <label>Description<textarea name="description" className={styles.fieldControl} rows="3" maxLength="2000" defaultValue={plan.description || ""} /></label>
        <label className={styles.fullField}>Purpose<textarea name="purpose" className={styles.fieldControl} rows="2" maxLength="2000" defaultValue={plan.purpose || ""} /></label>
        <label>Target participants<input name="targetParticipants" className={styles.fieldControl} type="number" min="1" max="100000" defaultValue={plan.targetParticipants ?? ""} /></label>
        <label>Target gender<select name="targetGender" className={styles.fieldControl} defaultValue={plan.targetGender || ""}><option value="">Any</option><option value="male">Male</option><option value="female">Female</option><option value="mixed">Mixed</option></select></label>
        <label>Min age<input name="targetAgeMin" className={styles.fieldControl} type="number" min="5" max="100" defaultValue={plan.targetAgeMin ?? ""} /></label>
        <label>Max age<input name="targetAgeMax" className={styles.fieldControl} type="number" min="5" max="100" defaultValue={plan.targetAgeMax ?? ""} /></label>
        <label className={styles.fullField}>Sports *<span className={styles.checkboxList}>{sports.map((sport) => <label key={sport.id}><input type="checkbox" name="sportIds" value={sport.id} defaultChecked={currentSportIds.includes(sport.id)} />{sport.sportName}</label>)}</span></label>
        <label className={styles.fullField}>Program flow<textarea name="programFlow" className={styles.fieldControl} rows="4" maxLength="10000" defaultValue={plan.programFlow || ""} /></label>
        <div className={styles.formActions}><button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Save plan"}</button></div>
        {message && <p role="status" className={`${styles.fullField} ${styles.formHint}`}>{message}</p>}
      </form>
    </div>
  );
}
