import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";
import { getSession } from "next-auth/react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { prisma } from "../lib/prisma";
import { PLAN_TYPE_OPTIONS, PLAN_TYPE_META } from "../lib/training-metrics";
import { CHART_MARGINS, CHART_TOOLTIP, CHART_GRID, CHART_AXIS, CHART_AXES, barChartHeight, completionColor } from "../lib/chart-config";
import AppShell from "../components/AppShell";
import PageSectionTabs from "../components/PageSectionTabs";
import styles from "../styles/Dashboard.module.css";

function planProgress(plan, totals) {
  const total = totals.activities || 0;
  const done = Math.min(totals.done, total);
  const partial = Math.min(totals.partial, total);
  const missed = Math.min(totals.missed, total);
  const completed = done + partial;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const ratings = (plan.assessments || []).map((a) => a.rating).filter((r) => typeof r === "number");
  const avgRating = ratings.length ? (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1) : null;
  return { total, done, partial, missed, completed, percent, avgRating };
}

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const isAdmin = session.user.role === "admin";
  let coachId = null;
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    coachId = coach?.id ?? null;
    if (!coachId) return { redirect: { destination: "/dashboard", permanent: false } };
  }
  const [sports, coaches, athletes, plans, templates] = await Promise.all([
    prisma.sport.findMany({ where: { status: "active" }, select: { id: true, sportName: true }, orderBy: { sportName: "asc" } }),
    isAdmin ? prisma.coach.findMany({ where: { status: "active" }, select: { id: true, coachCode: true, firstName: true, lastName: true, sports: { select: { sportId: true } } }, orderBy: { lastName: "asc" } }) : Promise.resolve([]),
    prisma.athlete.findMany({ where: { status: "active", ...(coachId ? { coachId } : {}) }, select: { id: true, athleteCode: true, firstName: true, lastName: true, sportId: true, coachId: true }, orderBy: { lastName: "asc" } }),
    (async () => {
      const where = isAdmin ? {} : coachId ? { coachId } : { coachId: -1 };
      return prisma.trainingPlan.findMany({
        where,
        orderBy: { startDate: "desc" },
        include: {
          sport: { select: { id: true, sportName: true } },
          coach: { select: { id: true, coachCode: true, firstName: true, lastName: true } },
          athletes: { include: { athlete: { select: { id: true, athleteCode: true, firstName: true, middleName: true, lastName: true, healthStatus: true, status: true } } } },
          assessments: { include: { athlete: { select: { id: true, firstName: true, lastName: true } }, assessor: { select: { username: true, email: true } } }, orderBy: { assessmentDate: "desc" } },
        },
      });
    })(),
    (async () => {
      const where = isAdmin ? {} : coachId ? { coachId } : { coachId: -1 };
      return prisma.trainingPlan.findMany({
        where: { ...where, isTemplate: true },
        orderBy: { startDate: "desc" },
        include: {
          sport: { select: { id: true, sportName: true } },
          coach: { select: { id: true, coachCode: true, firstName: true, lastName: true } },
          athletes: { include: { athlete: { select: { id: true, athleteCode: true, firstName: true, middleName: true, lastName: true, healthStatus: true, status: true } } } },
          assessments: { include: { athlete: { select: { id: true, firstName: true, lastName: true } }, assessor: { select: { username: true, email: true } } }, orderBy: { assessmentDate: "desc" } },
        },
      });
    })(),
  ]);
  const allPlans = [...plans, ...templates];
  const planIds = allPlans.map((p) => p.id);
  const activities = planIds.length
    ? await prisma.planActivity.findMany({
        where: { planId: { in: planIds } },
        select: { id: true, planId: true, logs: { select: { activityId: true, status: true }, orderBy: { performedAt: "desc" }, take: 1 } },
      })
    : [];
  const totals = new Map();
  for (const act of activities) {
    const cur = totals.get(act.planId) || { done: 0, partial: 0, missed: 0, activities: 0 };
    cur.activities += 1;
    if (act.logs?.[0]) {
      const s = act.logs[0].status;
      if (s === "done") cur.done += 1;
      else if (s === "partial") cur.partial += 1;
      else if (s === "missed") cur.missed += 1;
    }
    totals.set(act.planId, cur);
  }
  const progressMap = {};
  for (const plan of allPlans) {
    progressMap[plan.id] = planProgress(plan, totals.get(plan.id) || { done: 0, partial: 0, missed: 0, activities: 0 });
  }
  return {
    props: {
      session,
      isAdmin,
      coachId,
      sports,
      coaches: JSON.parse(JSON.stringify(coaches)),
      athletes: JSON.parse(JSON.stringify(athletes)),
      initialPlans: JSON.parse(JSON.stringify(plans)),
      initialTemplates: JSON.parse(JSON.stringify(templates)),
      progressMap: JSON.parse(JSON.stringify(progressMap)),
    },
  };
}

const FREQ_META = { day: "Daily", week: "Weekly", month: "Monthly" };
const STATUS_META = { active: { label: "Active", cls: "badgeActive" }, completed: { label: "Completed", cls: "badgeMuted" } };

function durationLabel(p) {
  const days = p.durationDays;
  if (days == null) return null;
  if (days % 7 === 0 && days >= 7) { const w = days / 7; return w === 1 ? `1 wk` : `${w} wks (${days} days)`; }
  return `${days} days`;
}

function fmtDate(value) {
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const PLAN_SECTIONS = [
  { label: "Progress", sectionId: "progress" },
  { label: "Plans", sectionId: "plans" },
];

export default function TrainingPlans({ session, isAdmin, sports, coaches, athletes, initialPlans = [], initialTemplates = [], progressMap = {} }) {
  const router = useRouter();
  const [showPlanForm, setShowPlanForm] = React.useState(false);
  const [editingPlan, setEditingPlan] = React.useState(null);
  const [plans, setPlans] = React.useState(initialPlans);
  const [templates, setTemplates] = React.useState(initialTemplates);
  const [loadingPlans, setLoadingPlans] = React.useState(false);
  const [error, setError] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [sportFilter, setSportFilter] = React.useState("");

  const filteredPlans = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return plans.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (sportFilter && p.sport?.id !== Number(sportFilter)) return false;
      if (!q) return true;
      const coachName = p.coach ? `${p.coach.firstName} ${p.coach.lastName}` : "";
      return (
        p.planName.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        coachName.toLowerCase().includes(q) ||
        (p.sport?.sportName || "").toLowerCase().includes(q)
      );
    });
  }, [plans, statusFilter, sportFilter, searchQuery]);

  function loadPlans() {
    fetch("/api/training-plans").then((r) => r.json()).then((data) => { setPlans(Array.isArray(data) ? data : []); setLoadingPlans(false); }).catch(() => { setLoadingPlans(false); setError("Could not load training plans."); });
  }
  function loadTemplates() {
    fetch("/api/training-plans?template=true").then((r) => r.json()).then((data) => { setTemplates(Array.isArray(data) ? data : []); }).catch(() => {});
  }
  function refresh() {
    setLoadingPlans(true);
    loadPlans();
    loadTemplates();
  }

  async function deletePlan(planId) {
    if (!window.confirm("Delete this training plan? This cannot be undone.")) return;
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch(`/api/training-plans?id=${planId}`, { method: "DELETE", headers: { "x-csrf-token": csrf.token } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error || "Delete failed."); return; }
      refresh();
    } catch { setError("Unable to reach the server."); }
  }

  async function updatePlanStatus(planId, status) {
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch(`/api/training-plans?id=${planId}`, { method: "PUT", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ status }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error || "Update failed."); return; }
      refresh();
    } catch { setError("Unable to reach the server."); }
  }

  return (
    <>
      <Head><title>Training | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Training" title="Training plans" active="/training-plans">
        <div className={styles.pageTitle}><h1>Training plans</h1></div>

        <PageSectionTabs sections={PLAN_SECTIONS}>
          <section id="progress">
            <RosterProgress />
          </section>
          <section id="plans">
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Coaching</p><h2>Training plans</h2></div>
            <div className={styles.actions}>
              {!isAdmin && <button className={styles.primary} onClick={() => { setEditingPlan(null); setShowPlanForm(true); }}>New plan</button>}
            </div>
          </div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>Coaches build a plan for their athletes over a day, week, or month. Coaches and the admin can then record assessments against it to track progress.</p>

          <div className={styles.toolbar}>
            <label className={styles.searchLabel}>Search plans<input type="text" placeholder="Name, coach, sport…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label>
            <label>Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label>Sport
              <select value={sportFilter} onChange={(event) => setSportFilter(event.target.value)}>
                <option value="">All sports</option>
                {sports.map((s) => <option key={s.id} value={s.id}>{s.sportName}</option>)}
              </select>
            </label>
            <span className={styles.toolbarSpacer} />
            <span className={styles.formHint} style={{ alignSelf: "center" }}>{filteredPlans.length} of {plans.length} plan{plans.length === 1 ? "" : "s"}</span>
          </div>

          {showPlanForm && (
            <div style={{ marginBottom: "var(--space-6)" }}>
              <CreatePlanForm isAdmin={isAdmin} sports={sports} coaches={coaches} athletes={athletes} templates={templates} onCreated={() => { setShowPlanForm(false); refresh(); router.push("/training-plans"); }} onCancel={() => setShowPlanForm(false)} />
            </div>
          )}

          {editingPlan && (
            <div style={{ marginBottom: "var(--space-6)" }}>
              <EditPlanForm isAdmin={isAdmin} plan={editingPlan} sports={sports} coaches={coaches} athletes={athletes} onSaved={() => { setEditingPlan(null); refresh(); }} onCancel={() => setEditingPlan(null)} />
            </div>
          )}

          {loadingPlans ? <p className={styles.empty}>Loading plans...</p> : plans.length === 0 ? (
            <p className={styles.empty}>No training plans yet. Create the first plan to get started.</p>
          ) : filteredPlans.length === 0 ? (
            <p className={styles.empty}>No plans match your filters.</p>
          ) : (
            <div className={styles.tableWrap}><table>
              <thead><tr><th>Plan</th><th>Frequency</th><th>Sport</th><th>Coach</th><th>Period</th><th>Athletes</th><th>Progress</th><th>Rating</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filteredPlans.map((p) => {
                  const prog = progressMap[p.id];
                  return (
                  <tr key={p.id}>
                    <td data-label="Plan"><strong>{p.planName}</strong>{p.description ? <small>{p.description}</small> : null}{p.isTemplate && <span className={`${styles.badge} ${styles.badgePending}`} style={{ marginLeft: 8 }}>Template</span>}</td>
                    <td data-label="Frequency">{FREQ_META[p.frequency] || p.frequency}{durationLabel(p) ? <small> · {durationLabel(p)}</small> : null}</td>
                    <td data-label="Sport">{p.sport?.sportName || "—"}</td>
                    <td data-label="Coach">{p.coach ? `${p.coach.firstName} ${p.coach.lastName}` : "—"}</td>
                    <td data-label="Period">{fmtDate(p.startDate)}{p.endDate ? ` – ${fmtDate(p.endDate)}` : ""}</td>
                    <td data-label="Athletes">{p.athletes?.length ?? 0}</td>
                    <td data-label="Progress">
                      {prog ? (
                        <div className={styles.progressCell}>
                          <strong>{prog.percent}%</strong>
                          <small>{prog.completed} / {prog.total} done</small>
                        </div>
                      ) : "—"}
                    </td>
                    <td data-label="Rating">{prog && prog.avgRating != null ? <span className={`${styles.badge} ${styles.badgeActive}`}>★ {prog.avgRating}</span> : "—"}</td>
                    <td data-label="Status"><span className={`${styles.badge} ${styles[STATUS_META[p.status]?.cls || "badgeMuted"]}`}>{STATUS_META[p.status]?.label || p.status}</span></td>
                    <td data-label="Actions">
                      <div className={styles.actionCell}>
                        <Link className={styles.expandBtn} href={`/training-plans/${p.id}`}>Manage</Link>
                        {!isAdmin && <button className={`${styles.secondary} ${styles.btnSm}`} onClick={() => setEditingPlan(p)}>Edit</button>}
                        {!isAdmin && <button className={`${styles.danger} ${styles.btnSm}`} onClick={() => deletePlan(p.id)}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
            </section>
          </section>
        </PageSectionTabs>
      </AppShell>
    </>
  );
}

function toDateInput(date) {
  const d = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}

/* Latest completion/rating for every athlete across the coach's training plans
   (admin: all plans). Scope lives in /api/progress?roster=1. */
function RosterProgress() {
  const router = useRouter();
  const [roster, setRoster] = React.useState(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/progress?roster=1")
      .then((r) => (r.ok ? r.json() : {}))
      .then((json) => {
        if (cancelled) return;
        if (json.roster) setRoster(json.roster);
        else setError(json.error || "Could not load roster progress.");
      })
      .catch(() => { if (!cancelled) setError("Unable to reach the server."); });
    return () => { cancelled = true; };
  }, []);

  const rows = roster || [];
  const chartData = rows.slice(0, 25).map((r) => ({ name: `${r.athlete}`, full: `${r.athlete} — ${r.planName}`, percent: r.completionPercent, total: r.total }));

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div><p className={styles.eyebrow}>Progress</p><h2>Latest progress across plans</h2></div>
        <span className={styles.formHint} style={{ alignSelf: "center" }}>{rows.length > 0 ? `${rows.length} athlete${rows.length === 1 ? "" : "s"} on plans` : ""}</span>
      </div>
      <p className={styles.formHint} style={{ marginTop: 0 }}>Latest completion for every athlete across your training plans.</p>

      {error ? <p role="status" className={styles.empty}>{error}</p> : rows.length === 0 ? (
        <p className={styles.empty}>{roster ? "No athletes on your training plans yet." : "Loading latest progress..."}</p>
      ) : (
        <>
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={barChartHeight(chartData.length)}>
              <BarChart data={chartData} layout="vertical" margin={CHART_MARGINS.barHorizontal}>
                <CartesianGrid {...CHART_GRID.cartesian} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={CHART_AXIS.x} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={CHART_AXES.barCategory} tick={CHART_AXIS.y} />
                <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`${v}%`, "Completion"]} labelFormatter={(l, p) => p?.[0]?.payload?.full || l} cursor={{ fill: "rgba(45,212,168,0.08)" }} />
                <Bar dataKey="percent" radius={[0, 4, 4, 0]}>{chartData.map((d) => <Cell key={d.full} fill={completionColor(d.percent)} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>Nothing to chart yet.</p>}

          <div className={styles.tableWrap} style={{ marginTop: "var(--space-4)" }}>
            <table>
              <thead>
                <tr>
                  <th>Athlete</th>
                  <th>Plan</th>
                  <th>Planned</th>
                  <th>Done</th>
                  <th>Partial</th>
                  <th>Missed</th>
                  <th>Completion</th>
                  <th>Rating</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.athleteId}:${r.planId}`}>
                    <td data-label="Athlete"><strong>{r.athlete}</strong><small> · {r.athleteCode}</small></td>
                    <td data-label="Plan">{r.planName}</td>
                    <td data-label="Planned" style={{ textAlign: "center" }}>{r.total}</td>
                    <td data-label="Done" style={{ textAlign: "center" }}><strong style={{ color: "var(--accent)" }}>{r.completed}</strong></td>
                    <td data-label="Partial" style={{ textAlign: "center" }}><span style={{ color: "var(--warning)" }}>{r.partial}</span></td>
                    <td data-label="Missed" style={{ textAlign: "center" }}><span style={{ color: r.missed > 0 ? "var(--danger)" : "var(--muted)" }}>{r.missed}</span></td>
                    <td data-label="Completion" style={{ textAlign: "center" }}><strong style={{ color: completionColor(r.completionPercent) }}>{r.completionPercent}%</strong></td>
                    <td data-label="Rating" style={{ textAlign: "center" }}>{r.rating != null ? r.rating : "—"}</td>
                    <td><button className={styles.secondary} onClick={() => router.push(`/training-plans/${r.planId}/athletes/${r.athleteId}`)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function addDaysISO(dateStr, days) {
  if (!dateStr) return "";
  const [y, m, dd] = dateStr.split("-").map(Number);
  if (!y || !m || !dd) return "";
  const d = new Date(y, m - 1, dd);
  if (isNaN(d)) return "";
  d.setDate(d.getDate() + (Number(days) || 0));
  return toDateInput(d);
}

function CreatePlanForm({ isAdmin, sports, coaches, athletes, templates, onCreated, onCancel }) {
  const [sportId, setSportId] = React.useState(sports[0]?.id || "");
  const [coachId, setCoachId] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [planType, setPlanType] = React.useState("normal");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [selectedAthletes, setSelectedAthletes] = React.useState([]);
  const [startDate, setStartDate] = React.useState(() => toDateInput(new Date()));
  const [endDate, setEndDate] = React.useState("");
  const [endAutoSet, setEndAutoSet] = React.useState(false);
  const [durationDays, setDurationDays] = React.useState("");

  const suggestedEnd = durationDays && startDate ? addDaysISO(startDate, Number(durationDays)) : "";
  const selectedTemplate = templates.find((t) => String(t.id) === String(templateId));
  const templatePlanType = selectedTemplate?.planType || "";

  const coachOptions = coaches.filter((c) => !c.sports?.length || c.sports.some((s) => s.sportId === Number(sportId)));
  const athleteOptions = athletes.filter((a) => (!sportId || a.sportId === Number(sportId)) && (!isAdmin || !coachId || a.coachId === Number(coachId)));

  function handleEndChange(value) {
    setEndDate(value);
    setEndAutoSet(false);
  }

  function onDurationChange(value) {
    setDurationDays(value);
    if (endAutoSet || !endDate) setEndDate(addDaysISO(startDate, Number(value)));
  }

  function onStartChange(value) {
    setStartDate(value);
    if (endAutoSet || !endDate) setEndDate(addDaysISO(value, Number(durationDays)));
  }

  function toggleAthlete(id) {
    setSelectedAthletes((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = {
      planName: form.get("planName"),
      description: form.get("description"),
      sportId: Number(form.get("sportId")),
      coachId: Number(form.get("coachId") || (isAdmin ? 0 : athletes[0]?.coachId)),
      planType: templateId ? (templates.find((t) => String(t.id) === String(templateId))?.planType || "normal") : planType,
      frequency: form.get("frequency"),
      durationDays: form.get("durationDays") ? Number(form.get("durationDays")) : null,
      startDate,
      endDate: endDate || null,
      status: form.get("status"),
      athleteIds: selectedAthletes,
      isTemplate: isAdmin && form.get("isTemplate") === "on",
    };
    if (body.coachId === 0) body.coachId = null;
    if (templateId) {
      body.action = "duplicate";
      body.sourcePlanId = Number(templateId);
    }
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/training-plans", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { event.currentTarget.reset(); setSelectedAthletes([]); setTemplateId(""); setMessage(""); onCreated(); return; }
      setMessage(result.error || "Could not create the plan.");
    } catch (e) { setMessage("Unable to reach the server."); }
    setBusy(false);
  }

  return (
    <>
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Create</p><h2>New training plan</h2></div></div>
      <form onSubmit={submit} className={styles.formGrid}>
        <label className={styles.fullField}>Plan name *<input name="planName" required maxLength="191" placeholder="e.g. Pre-season conditioning month" /></label>
        <label>Sport *<select name="sportId" value={sportId} required onChange={(e) => { setSportId(e.target.value); setCoachId(""); setSelectedAthletes([]); }}>{sports.map((s) => <option key={s.id} value={s.id}>{s.sportName}</option>)}</select></label>

        <label className={styles.fullField}>
          Plan type *
          <div className={styles.planTypeOptions}>
            {PLAN_TYPE_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                className={`${styles.planTypeCard} ${planType === opt.value ? styles.selected : ""}`}
                onClick={() => setPlanType(opt.value)}
                disabled={busy || !!templateId}
                aria-pressed={planType === opt.value}
              >
                <strong>{opt.label}</strong>
                <small>{opt.description}</small>
              </button>
            ))}
          </div>
          {templateId ? (
            <p className={styles.formHint}>Plan type follows the selected template ({PLAN_TYPE_META[templatePlanType]?.label || "Normal Training"}).</p>
          ) : (
            <p className={styles.formHint}>Chosen once at creation — the plan type cannot be changed later.</p>
          )}
        </label>

        {templates.length > 0 && (
          <label className={styles.fullField}>
            Use template (optional)
            <select name="templateId" value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ width: "100%" }}>
              <option value="">Start from scratch</option>
              {templates.filter(t => t.sportId === Number(sportId)).map((t) => <option key={t.id} value={t.id}>{t.planName} — {t.coach?.firstName} {t.coach?.lastName}</option>)}
            </select>
            <p className={styles.formHint}>Copies activities and targets from the template. You&apos;ll still pick athletes and dates.</p>
          </label>
        )}

        {isAdmin && <label>Coach *<select name="coachId" required value={coachId} onChange={(e) => { setCoachId(e.target.value); setSelectedAthletes([]); }}><option value="">Select a coach</option>{coachOptions.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName}{c.coachCode ? ` (${c.coachCode})` : ""}</option>)}</select></label>}
        <label>Frequency *<select name="frequency" defaultValue="day"><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label>
        <label>Duration (days)<input name="durationDays" type="number" min="1" max="730" placeholder="e.g. 28" value={durationDays} onChange={(e) => onDurationChange(e.target.value)} /></label>
        <label>Start date *<input name="startDate" type="date" required value={startDate} onChange={(e) => onStartChange(e.target.value)} /></label>
        <label>End date (optional)<input name="endDate" type="date" value={endDate} onChange={(e) => handleEndChange(e.target.value)} />{suggestedEnd ? <small className={styles.formHint}>Suggested: {suggestedEnd}</small> : null}</label>
        {isAdmin && <label>Status<select name="status" defaultValue="active"><option value="active">Active</option><option value="completed">Completed</option></select></label>}
        {isAdmin && <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" name="isTemplate" /> <span>Template plan (admin only)</span></label>}
        <label className={styles.fullField}>Description<textarea name="description" rows="2" maxLength="2000" placeholder="Goals and focus of the plan" /></label>

        <div className={styles.fullField} style={{ borderTop: "1px solid rgba(26, 92, 74, .5)", paddingTop: 16 }}>
          <p className={styles.eyebrow}>Athletes on this plan ({selectedAthletes.length})</p>
          {athleteOptions.length ? (
            <div className={styles.checkboxList}>
              {athleteOptions.map((a) => {
                const done = selectedAthletes.includes(a.id);
                return (
                  <label key={a.id}>
                    <input type="checkbox" checked={done} disabled={busy} onChange={() => toggleAthlete(a.id)} />
                    <span>{a.lastName}, {a.firstName} ({a.athleteCode})</span>
                  </label>
                );
              })}
            </div>
          ) : <p className={styles.empty}>No athletes available for this sport.</p>}
        </div>

        <div className={styles.formActions}>
          <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={styles.primary} disabled={busy}>{busy ? "Creating..." : "Create plan"}</button>
        </div>
        {message && <p role="status" className={`${styles.fullField} ${styles.formError}`}>{message}</p>}
      </form>
    </>
  );
}

function EditPlanForm({ isAdmin, plan, sports, coaches, athletes, onSaved, onCancel }) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [selectedAthletes, setSelectedAthletes] = React.useState(plan.athletes?.map((a) => a.athlete.id) || []);
  const [formData, setFormData] = React.useState({
    planName: plan.planName,
    description: plan.description || "",
    sportId: plan.sportId,
    coachId: plan.coachId,
    frequency: plan.frequency,
    durationDays: plan.durationDays ?? "",
    startDate: plan.startDate?.slice(0, 10) || "",
    endDate: plan.endDate?.slice(0, 10) || "",
    status: plan.status,
    isTemplate: plan.isTemplate,
  });

  const coachOptions = coaches.filter((c) => !c.sports?.length || c.sports.some((s) => s.sportId === Number(formData.sportId)));
  const athleteOptions = athletes.filter((a) => (!formData.sportId || a.sportId === Number(formData.sportId)) && (!isAdmin || !formData.coachId || a.coachId === Number(formData.coachId)));

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    if (name === "sportId" || name === "coachId") setSelectedAthletes([]);
  }

  function toggleAthlete(id) {
    setSelectedAthletes((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const body = { ...formData, sportId: Number(formData.sportId), coachId: Number(formData.coachId), athleteIds: selectedAthletes };
    if (body.coachId === 0) body.coachId = null;
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch(`/api/training-plans?id=${plan.id}`, { method: "PUT", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) { setMessage(""); onSaved(); return; }
      setMessage(result.error || "Could not update the plan.");
    } catch (e) { setMessage("Unable to reach the server."); }
    setBusy(false);
  }

  return (
    <>
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Edit</p><h2>{plan.planName}</h2></div></div>
      <form onSubmit={submit} className={styles.formGrid}>
        <p className={`${styles.fullField} ${styles.formHint}`} style={{ marginTop: 0 }}>
          <strong>{PLAN_TYPE_META[plan.planType]?.label || "Normal Training"}</strong> plan — the type is fixed after creation and cannot be changed.
        </p>
        <label className={styles.fullField}>Plan name *<input name="planName" required maxLength="191" defaultValue={formData.planName} onChange={handleChange} /></label>
        <label>Sport *<select name="sportId" value={formData.sportId} required onChange={handleChange}>{sports.map((s) => <option key={s.id} value={s.id}>{s.sportName}</option>)}</select></label>
        {isAdmin && <label>Coach *<select name="coachId" value={formData.coachId} required onChange={handleChange}><option value="">Select a coach</option>{coachOptions.map((c) => <option key={c.id} value={c.id}>{c.lastName}, {c.firstName}{c.coachCode ? ` (${c.coachCode})` : ""}</option>)}</select></label>}
        <label>Frequency *<select name="frequency" value={formData.frequency} onChange={handleChange}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label>
        <label>Duration (days)<input name="durationDays" type="number" min="1" max="730" defaultValue={formData.durationDays} onChange={handleChange} placeholder="e.g. 28" /></label>
        <label>Start date *<input name="startDate" type="date" required defaultValue={formData.startDate} onChange={handleChange} /></label>
        <label>End date (optional)<input name="endDate" type="date" defaultValue={formData.endDate} onChange={handleChange} /></label>
        {isAdmin && <label>Status<select name="status" value={formData.status} onChange={handleChange}><option value="active">Active</option><option value="completed">Completed</option></select></label>}
        {isAdmin && <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" name="isTemplate" checked={formData.isTemplate} onChange={handleChange} /> <span>Template plan</span></label>}
        <label className={styles.fullField}>Description<textarea name="description" rows="2" maxLength="2000" defaultValue={formData.description} onChange={handleChange} /></label>

        <div className={styles.fullField} style={{ borderTop: "1px solid rgba(26, 92, 74, .5)", paddingTop: 16 }}>
          <p className={styles.eyebrow}>Athletes on this plan ({selectedAthletes.length})</p>
          {athleteOptions.length ? (
            <div className={styles.checkboxList}>
              {athleteOptions.map((a) => {
                const done = selectedAthletes.includes(a.id);
                return (
                  <label key={a.id}>
                    <input type="checkbox" checked={done} disabled={busy} onChange={() => toggleAthlete(a.id)} />
                    <span>{a.lastName}, {a.firstName} ({a.athleteCode})</span>
                  </label>
                );
              })}
            </div>
          ) : <p className={styles.empty}>No athletes available for this sport.</p>}
        </div>

        <div className={styles.formActions}>
          <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Save changes"}</button>
        </div>
        {message && <p role="status" className={`${styles.fullField} ${styles.formError}`}>{message}</p>}
      </form>
    </>
  );
}