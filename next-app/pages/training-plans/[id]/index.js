import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { getSession } from "next-auth/react";
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Legend,
} from "recharts";
import { prisma } from "../../../lib/prisma";
import { buildMonitoringGrid } from "../../../lib/plan-monitoring";
import PageSectionTabs from "../../../components/PageSectionTabs";
import { METRIC_LABELS, resultUnitFor, targetValueFor } from "../../../lib/activity-score";
import { PLAN_TYPE_META } from "../../../lib/training-metrics";
import AppShell from "../../../components/AppShell";
import styles from "../../../styles/Dashboard.module.css";
import { CHART_HEIGHTS, CHART_MARGINS, CHART_TOOLTIP, CHART_GRID, CHART_AXIS, CHART_AXES, CHART_LEGEND, CHART_COLORS, barChartHeight, completionColor } from "../../../lib/chart-config";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const id = Number(context.params?.id);
  if (!Number.isSafeInteger(id) || id < 1) return { redirect: { destination: "/training-plans", permanent: false } };
  const isAdmin = session.user.role === "admin";

  const plan = await prisma.trainingPlan.findUnique({
    where: { id },
    include: { sport: { select: { id: true, sportName: true } }, coach: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!plan) return { redirect: { destination: "/training-plans", permanent: false } };
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach || plan.coachId !== coach.id) return { redirect: { destination: "/training-plans", permanent: false } };
  }

  const planAthletes = await prisma.trainingPlanAthlete.findMany({
    where: { planId: id },
    select: { athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true, sportId: true, healthStatus: true, status: true, sport: { select: { id: true, sportName: true } } } } },
    orderBy: { athlete: { lastName: "asc" } },
  });

  const [allActivities] = await Promise.all([
    prisma.planActivity.findMany({
      where: { planId: id },
      orderBy: { orderIndex: "asc" },
      include: {
        athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } },
        logs: {
          orderBy: { performedAt: "desc" },
          include: { athlete: { select: { id: true, firstName: true, lastName: true } }, logger: { select: { email: true, username: true } } },
        },
      },
    }),
  ]);

  const activityIds = allActivities.map((a) => a.id);
  const logs = await prisma.planActivityLog.findMany({
    where: { activityId: { in: activityIds } },
    orderBy: [{ performedAt: "desc" }],
    include: {
      athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } },
      logger: { select: { id: true, email: true, username: true } },
      activity: { select: { id: true, activityName: true, fitnessType: true } },
    },
    take: 500,
  });

  const monitoringActivities = allActivities.map((a) => {
    const latest = a.logs.find((l) => ["done", "partial", "missed"].includes(l.status)) || null;
    return { ...a, logs: latest ? [latest] : [] };
  });
  const monitoring = buildMonitoringGrid({ activities: monitoringActivities, planAthletes, week: 1 });

  // Latest training-assessment rating per athlete on this plan (for the roster)
  const ratingRows = await prisma.trainingAssessment.findMany({
    where: { planId: id },
    orderBy: { assessmentDate: "desc" },
    select: { athleteId: true, rating: true },
  });
  const latestRatings = {};
  for (const r of ratingRows) {
    if (latestRatings[r.athleteId] == null) latestRatings[r.athleteId] = r.rating;
  }

  return {
    props: {
      session,
      isAdmin,
      plan: JSON.parse(JSON.stringify({
        ...plan,
        startDate: plan.startDate.toISOString(),
        endDate: plan.endDate ? plan.endDate.toISOString() : null,
      })),
      athletes: JSON.parse(JSON.stringify(planAthletes.map((a) => a.athlete))),
      initialActivities: JSON.parse(JSON.stringify(allActivities)),
      initialLogs: JSON.parse(JSON.stringify(logs)),
      initialMonitoringData: JSON.parse(
        JSON.stringify({
          plan: { id: plan.id, durationDays: plan.durationDays, durationWeeks: plan.durationWeeks, startDate: plan.startDate.toISOString() },
          currentWeek: 1,
          maxWeek: (plan.durationDays != null ? Math.ceil(plan.durationDays / 7) : null) || plan.durationWeeks || 1,
          ...monitoring,
        })
      ),
      latestRatings: JSON.parse(JSON.stringify(latestRatings)),
    },
  };
}

const FITNESS_META = {
  endurance: "Endurance",
  strength: "Strength",
  power: "Power",
  speed_agility: "Speed / Agility",
  skill_technique: "Skill / Technique",
  mobility: "Mobility",
  recovery: "Recovery",
};

const FITNESS_ORDER = ["endurance", "speed_agility", "power", "skill_technique", "mobility", "strength", "recovery"];

const PLAN_SECTIONS = [
  { label: "Overview", sectionId: "overview" },
  { label: "Trends & Charts", sectionId: "trends" },
  { label: "Athletes", sectionId: "roster" },
];

const normName = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
const dayOf = (activity) => (activity.dayIndex == null ? 1 : activity.dayIndex);
const groupKey = (activity) => `${normName(activity.activityName)}|${activity.fitnessType || "endurance"}|${dayOf(activity)}`;

function fmtDate(value) {
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function downscaleImage(file, maxSide) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve("");
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export default function PlanDetail({ session, isAdmin, plan, athletes, initialActivities = [], initialLogs = [], initialMonitoringData = null, latestRatings = {} }) {
  const router = useRouter();
  const [activities, setActivities] = React.useState(initialActivities);
  const [logs, setLogs] = React.useState(initialLogs);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [showBulkAssess, setShowBulkAssess] = React.useState(false);
  const [currentWeek, setCurrentWeek] = React.useState(initialMonitoringData?.currentWeek || 1);
  const [monitoringData, setMonitoringData] = React.useState(initialMonitoringData);
  const [message, setMessage] = React.useState(null);
  const [lateOverride, setLateOverride] = React.useState(Boolean(plan.allowLateAssessment));

  async function setLateAssessment(enabled) {
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch(`/api/training-plans?id=${plan.id}`, { method: "PUT", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ allowLateAssessment: enabled }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) {
        setLateOverride(enabled);
        setMessage({ kind: "success", text: enabled ? "Late assessment allowed — all weeks are unlocked for the coach." : "Late assessment disabled — only the current week can be assessed." });
      } else {
        setMessage({ kind: "error", text: result.error || "Could not update the flag." });
      }
    } catch {
      setMessage({ kind: "error", text: "Unable to reach the server." });
    }
  }

  const loadActivities = React.useCallback((show) => {
    fetch(`/api/plan-activities?planId=${plan.id}`).then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) { setActivities(data); setError(""); show && setLoading(false); }
      else { setError(data.error || "Could not load activities."); show && setLoading(false); }
    }).catch(() => { setError("Could not load activities."); show && setLoading(false); });
  }, [plan.id]);

  const loadLogs = React.useCallback((show) => {
    fetch(`/api/plan-activity-logs?planId=${plan.id}`).then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) { setLogs(data); setError(""); show && setLoading(false); }
      else setError(data.error || "Could not load progress.");
    }).catch(() => { setError("Could not load progress."); });
  }, [plan.id]);

  const loadMonitoring = React.useCallback(() => {
    fetch(`/api/plan-activities/monitoring?planId=${plan.id}&weekNumber=${currentWeek}`)
      .then((r) => r.json())
      .then((data) => { setMonitoringData(data); setError(""); })
      .catch(() => { setError("Could not load monitoring grid."); });
  }, [plan.id, currentWeek]);

  const skippedFirstMonitoringRefresh = React.useRef(false);
  React.useEffect(() => {
    if (!skippedFirstMonitoringRefresh.current) {
      skippedFirstMonitoringRefresh.current = true;
      return;
    }
    loadMonitoring();
  }, [loadMonitoring]);

  function refresh() {
    loadActivities(true);
    loadLogs(true);
    loadMonitoring();
  }

  const perAthlete = React.useMemo(() => {
    return athletes.map((a) => {
      const acts = activities.filter((act) => act.athleteId === a.id);
      let done = 0, partial = 0, missed = 0, open = 0;
      const byActivity = acts.map((act) => {
        const al = logs.filter((l) => l.activityId === act.id && l.athleteId === a.id);
        const latest = al.length ? [...al].sort((x, y) => new Date(y.performedAt) - new Date(x.performedAt))[0] : null;
        const status = latest ? latest.status : "open";
        if (status === "done") done++;
        else if (status === "partial") partial++;
        else if (status === "missed") missed++;
        else open++;
        const p = computeProgress(act, latest);
        return { id: act.id, name: act.activityName, fitness: act.fitnessType, status, percent: p ? p.percent : 0 };
      });
      const total = acts.length;
      const percent = total ? Math.round(((done + partial) / total) * 100) : 0;
      return { id: a.id, code: a.athleteCode, name: `${a.firstName} ${a.lastName}`, total, done, partial, missed, open, percent, byActivity };
    });
  }, [athletes, activities, logs]);

  const overallCompletion = React.useMemo(() => {
    const withActs = perAthlete.filter((r) => r.total > 0);
    return withActs.length ? Math.round(withActs.reduce((s, r) => s + r.percent, 0) / withActs.length) : 0;
  }, [perAthlete]);

  const barData = React.useMemo(() => perAthlete.slice(0, 20).map((r) => ({ name: r.name.split(" ")[0], full: r.name, percent: r.total ? r.percent : 0, total: r.total })), [perAthlete]);

  const fitnessDist = React.useMemo(() => {
    const map = new Map();
    for (const act of activities) map.set(act.fitnessType, (map.get(act.fitnessType) || 0) + 1);
    const arr = [...map.entries()].map(([key, count]) => ({ key, name: FITNESS_META[key] || key, count })).sort((x, y) => y.count - x.count);
    const top = arr.slice(0, 5);
    const rest = arr.slice(5);
    if (rest.length) top.push({ key: "other", name: "Other", count: rest.reduce((s, r) => s + r.count, 0) });
    return top.map((d, i) => ({ ...d, color: CHART_COLORS.palette[i % CHART_COLORS.palette.length] }));
  }, [activities]);

  const weekly = React.useMemo(() => {
    const maxWeek = (plan.durationDays != null ? Math.ceil(plan.durationDays / 7) : null) || plan.durationWeeks || 1;
    const weeks = [];
    for (let w = 1; w <= maxWeek; w++) {
      const acts = activities.filter((act) => act.weekNumber == null || Number(act.weekNumber) === w);
      if (!acts.length) { weeks.push({ week: w, percent: 0, total: 0 }); continue; }
      let done = 0, partial = 0;
      for (const act of acts) {
        const latest = logs.filter((l) => l.activityId === act.id).sort((x, y) => new Date(y.performedAt) - new Date(x.performedAt))[0];
        if (!latest) continue;
        if (latest.status === "done") done++;
        else if (latest.status === "partial") partial++;
      }
      const total = acts.length;
      const percent = total ? Math.round(((done + partial) / total) * 100) : 0;
      weeks.push({ week: w, percent, total });
    }
    return weeks;
  }, [activities, logs, plan.durationDays, plan.durationWeeks]);

  return (
    <>
      <Head><title>{plan.planName} | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Training" title={plan.planName} active="/training-plans">
        <div className={styles.pageActions}>
          <nav className={styles.eyebrow} style={{ lineHeight: 1.5 }}>Training <span style={{ opacity: 0.6 }}>/</span> Training plans <span style={{ opacity: 0.6 }}>/</span> <strong>{plan.planName}</strong></nav>
          <button className={styles.secondary} onClick={() => router.push("/training-plans")}>Back to plans</button>
        </div>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Plan</p>
              <h2>{plan.planName}</h2>
              <p style={{ color: "var(--muted)" }}>{fmtDate(plan.startDate)}{plan.endDate ? ` – ${fmtDate(plan.endDate)}` : ""}</p>
            </div>
            {isAdmin && (
              <label title="Temporarily unlock all weeks so the coach can backfill or fix assessments" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "rgba(255,255,255,.03)" }}>
                <input type="checkbox" checked={lateOverride} onChange={(e) => setLateAssessment(e.target.checked)} />
                <span>Allow late assessment{lateOverride ? <strong style={{ color: "var(--accent)" }}> (ON)</strong> : ""}</span>
              </label>
            )}
            <span className={styles.badge}>{plan.status === "completed" ? "Completed" : "Active"}</span>
            <span className={styles.badge}>{PLAN_TYPE_META[plan.planType]?.label || "Normal Training"}</span>
          </div>
          {plan.description ? <p>{plan.description}</p> : null}
        </section>

{message && (
          <p role="status" style={{ margin: "0 0 var(--space-4)", padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-lg)", border: `1px solid ${message.kind === "error" ? "var(--danger)" : "var(--accent)"}`, background: `rgba(${message.kind === "error" ? "248,113,113" : "45,212,168"}, .14)`, color: message.kind === "error" ? "var(--danger)" : "var(--foreground)" }}>
            {message.text}
          </p>
        )}

<PageSectionTabs sections={PLAN_SECTIONS} defaultSection="overview">
          <section id="overview">
            <div className={styles.panelHeader}>
              <div><p className={styles.eyebrow}>Overview</p><h2>Progress overview</h2></div>
              <span className={styles.formHint} style={{ alignSelf: "center" }}>{plan.durationDays ? `${plan.durationDays} days` : plan.durationWeeks ? `${plan.durationWeeks} wks` : "No duration set"}</span>
            </div>
            <TrainingCharts plan={plan} athletes={athletes} activities={activities} logs={logs} perAthlete={perAthlete} barData={barData} fitnessDist={fitnessDist} weekly={weekly} overallCompletion={overallCompletion} />

            {monitoringData && (
              <section className={styles.panel} style={{ marginTop: "var(--space-5)" }}>
                <div className={styles.panelHeader}>
                  <div><p className={styles.eyebrow}>Monitor</p><h2>Daily training monitoring</h2></div>
                </div>
                <MonitoringGrid
                  data={monitoringData}
                  athletes={athletes}
                  maxWeek={monitoringData.maxWeek}
                  currentWeek={monitoringData.currentWeek}
                  onWeekChange={setCurrentWeek}
                />
              </section>
            )}

            {!isAdmin && (
              <section className={styles.panel} style={{ marginTop: "var(--space-5)" }}>
                <div className={styles.panelHeader}>
                  <div><p className={styles.eyebrow}>Assessment</p><h2>Assess athletes</h2></div>
                  {showBulkAssess && <button className={styles.secondary} onClick={() => setShowBulkAssess(false)}>Close assessment</button>}
                </div>
                {showBulkAssess ? (
                  <>
                    <p className={styles.formHint} style={{ marginTop: 0 }}>Rate everyone on the plan in one pass. Cells start marked done at their target for the selected date &mdash; switch exceptions to part/missed, add results, or use the Everyone buttons. Ratings auto-fill as cells are completed; adjust any athlete&apos;s rating to override. Save once with an optional 1&ndash;10 rating per athlete. Existing records for that date are preserved until you save.</p>
                    <AssessStudio plan={lateOverride ? { ...plan, allowLateAssessment: true } : plan} planId={plan.id} athletes={athletes} activities={activities} logs={logs} onDone={refresh} />
                  </>
                ) : (
                  <>
                    <p className={styles.formHint} style={{ marginTop: 0 }}>One pass over everyone on the plan: cells start marked done at their target &mdash; switch exceptions to part/missed, add results, or use the Everyone buttons. Ratings auto-fill as cells are completed; adjust any athlete&apos;s rating to override. Save once with an optional 1&ndash;10 rating per athlete. Existing records for the selected date are kept until you save.</p>
                    <button className={styles.primary} onClick={() => setShowBulkAssess(true)}>Assess athletes</button>
                  </>
                )}
              </section>
            )}
          </section>

          <section id="trends">
            <div className={styles.panelHeader}>
              <div><p className={styles.eyebrow}>Trends & Charts</p><h2>Progress trends</h2></div>
            </div>
            <p className={styles.formHint}>Trend charts for completion rates, ratings, and activity progress over time.</p>
            <TrainingCharts plan={plan} athletes={athletes} activities={activities} logs={logs} perAthlete={perAthlete} barData={barData} fitnessDist={fitnessDist} weekly={weekly} overallCompletion={overallCompletion} />
          </section>

          <section id="roster">
            <div className={styles.panelHeader}>
              <div><p className={styles.eyebrow}>Athletes</p><h2>Athletes</h2></div>
              <span className={styles.formHint} style={{ alignSelf: "center" }}>{athletes.length} athlete{athletes.length === 1 ? "" : "s"}</span>
            </div>
            <p className={styles.formHint} style={{ marginTop: 0 }}>
              {isAdmin ? "Each row is an athlete under this training. See progress to view their full history." : "Each row is an athlete on your training. See progress to view their full activity history and manage their activities."}
            </p>
            {loading ? <p className={styles.empty}>Loading plan details...</p> : error ? <p className={styles.empty}>{error}</p> : athletes.length === 0 ? (
              <p className={styles.empty}>No athletes on this plan.</p>
            ) : (
              <AthleteRosterTable plan={plan} athletes={athletes} activities={activities} logs={logs} isAdmin={isAdmin} latestRatings={latestRatings} />
            )}
          </section>
        </PageSectionTabs>
      </AppShell>
    </>
  );
}

function computeProgress(activity, log) {
  if (!log) return null;
  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  let done = null;
  let target = null;
  const lowerBetter = activity.metricType === "time";
  if (activity.metricType === "time" && activity.targetTimeSec != null) {
    done = log.timeSec != null ? toNum(log.timeSec) : null;
    target = toNum(activity.targetTimeSec);
  } else if (activity.targetQuantity != null) {
    done = toNum(log.quantityDone);
    target = toNum(activity.targetQuantity);
  } else if (activity.targetDistance != null) {
    done = lowerBetter ? (log.timeSec != null ? toNum(log.timeSec) : null) : toNum(log.quantityDone);
    target = toNum(activity.targetDistance);
  } else if (activity.targetSets != null) {
    done = log.setsDone != null ? toNum(log.setsDone) : null;
    target = toNum(activity.targetSets);
  } else if (activity.targetReps != null) {
    done = log.repsDone != null ? toNum(log.repsDone) : null;
    target = toNum(activity.targetReps);
  }
  if (done == null || target == null || target <= 0 || (lowerBetter && done <= 0)) return null;
  const ratio = lowerBetter ? target / done : done / target;
  const percent = Math.round(Math.min(100, Math.max(0, ratio * 100)));
  return { percent, done, target };
}




function evidenceDayKey(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function AssessStudio({ plan, planId, athletes, activities, logs, onDone }) {
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [dayFilter, setDayFilter] = React.useState("all");
  const maxWeek = (plan?.durationDays != null ? Math.ceil(plan.durationDays / 7) : null) || plan?.durationWeeks || 1;

  // Week-gating: compute current week from plan.startDate (UTC)
  const getCurrentWeek = React.useCallback(() => {
    if (!plan?.startDate) return 1;
    const start = new Date(plan.startDate);
    if (isNaN(start)) return 1;
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(1, Math.floor(diffDays / 7) + 1);
  }, [plan]);

  const currentWeek = getCurrentWeek();
  const [weekFilter, setWeekFilter] = React.useState(String(currentWeek));
  const isWeekLocked = (w) => w !== currentWeek && !plan?.allowLateAssessment;
  const selectedWeekNum = weekFilter === "all" ? null : Number(weekFilter);
  const mixingLocked = weekFilter === "all" && maxWeek > 1 && !plan?.allowLateAssessment;
  const isCurrentViewLocked = (selectedWeekNum != null && isWeekLocked(selectedWeekNum)) || mixingLocked;

  function weekWindowLabel(w) {
    if (!plan?.startDate) return "";
    const s = new Date(plan.startDate);
    if (isNaN(s)) return "";
    const startIso = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + (w - 1) * 7)).toISOString();
    const endIso = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + (w - 1) * 7 + 6)).toISOString();
    return w > currentWeek ? `starts ${startIso.slice(0, 10)}` : `ended ${endIso.slice(0, 10)}`;
  }

  const [cells, setCells] = React.useState({});
  const [ratings, setRatings] = React.useState({});
  const [openRatingId, setOpenRatingId] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [evidenceMap, setEvidenceMap] = React.useState({});
  const [reviewColumn, setReviewColumn] = React.useState(null);
  const [showLightbox, setShowLightbox] = React.useState(null);
  const undoRef = React.useRef(null);
  const manualRatingIds = React.useRef(new Set());
  const seededDateRef = React.useRef(null);

  React.useEffect(() => {
    function buildDefaultCells(onlyAddMissing) {
      const next = onlyAddMissing ? { ...cells } : {};
      for (const athlete of athletes) {
        for (const activity of visibleActivities(athlete.id)) {
          const k = key(athlete.id, activity.id);
          if (onlyAddMissing && next[k]) continue;
          const hasSavedForDate = logs.some((l) => l.athleteId === athlete.id && l.activityId === activity.id && l.performedAt && l.performedAt.slice(0, 10) === date);
          if (hasSavedForDate) continue;
          const target = targetOf(activity);
          const cell = { touched: true, status: "done", qty: "", sets: "", reps: "", time: "", dist: "", load: "", attempts: "", note: "" };
          if (target) {
            if (target.kind === "qty") cell.qty = target.n;
            else if (target.kind === "sets") cell.sets = target.n;
            else if (target.kind === "reps") cell.reps = target.n;
          }
          if (activity.metricType === "time" && activity.targetTimeSec != null) cell.time = activity.targetTimeSec;
          next[k] = cell;
        }
      }
      return next;
    }
    const reset = seededDateRef.current !== date;
    seededDateRef.current = date;
    setCells(buildDefaultCells(reset ? false : true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, weekFilter, dayFilter]);

  React.useEffect(() => {
    for (const athlete of athletes) {
      if (manualRatingIds.current.has(athlete.id)) continue;
      const suggestion = suggestRating(athlete.id);
      if (suggestion == null) continue;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRatings((cur) => {
        if (cur[athlete.id]?.rating === suggestion) return cur;
        return { ...cur, [athlete.id]: { rating: null, comments: "", ...cur[athlete.id], rating: suggestion } };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells]);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/plan-evidence?planId=${planId}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((json) => {
        const map = {};
        for (const e of json.evidence || []) map[`${e.athleteId}:${evidenceDayKey(e.evidenceDate)}`] = { ...e, dayStr: evidenceDayKey(e.evidenceDate), uploading: false };
        if (!cancelled) setEvidenceMap(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [planId]);

  async function uploadEvidence(athleteId, file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setToast({ kind: "error", text: "Only JPEG, PNG or WEBP photos are accepted." }); return; }
    const blob = await downscaleImage(file, 1280);
    if (!blob) { setToast({ kind: "error", text: "The photo could not be read." }); return; }
    const mime = blob.type || "image/jpeg";
    const base64 = (await blobToBase64(blob)).split(",")[1];
    setEvidenceMap((cur) => ({ ...cur, [`${athleteId}:${date}`]: { ...(cur[`${athleteId}:${date}`] || {}), uploading: true } }));
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const res = await fetch("/api/plan-evidence", {
        method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ planId, athleteId, evidenceDate: date, base64, mime }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.url) {
        setEvidenceMap((cur) => ({ ...cur, [`${athleteId}:${date}`]: { id: json.id, url: json.url, athleteId, evidenceDate: new Date(`${date}T00:00:00.000Z`).toISOString(), dayStr: date, uploading: false } }));
        setToast({ kind: "success", text: "Evidence photo saved for this date." });
      } else {
        setEvidenceMap((cur) => ({ ...cur, [`${athleteId}:${date}`]: { ...(cur[`${athleteId}:${date}`] || {}), uploading: false } }));
        setToast({ kind: "error", text: json.error || "Could not save the photo." });
      }
    } catch (e) {
      setEvidenceMap((cur) => ({ ...cur, [`${athleteId}:${date}`]: { ...(cur[`${athleteId}:${date}`] || {}), uploading: false } }));
      setToast({ kind: "error", text: "Unable to reach the server." });
    }
  }

  function pickEvidence(athleteId) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) uploadEvidence(athleteId, f); };
    input.click();
  }

  async function deleteEvidenceRow(row) {
    if (!row || !row.id) return;
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const res = await fetch(`/api/plan-evidence?id=${row.id}`, { method: "DELETE", headers: { "x-csrf-token": csrf.token } });
      if (res.ok) {
        setEvidenceMap((cur) => { const n = { ...cur }; delete n[`${row.athleteId}:${row.dayStr || date}`]; return n; });
        setShowLightbox(null);
        setToast({ kind: "success", text: "Evidence photo removed." });
      } else {
        const j = await res.json().catch(() => ({}));
        setToast({ kind: "error", text: j.error || "Could not remove the photo." });
      }
    } catch { setToast({ kind: "error", text: "Unable to reach the server." }); }
  }

  const key = (aid, actId) => `${aid}:${actId}`;
  const evFor = (athleteId) => evidenceMap[`${Number(athleteId)}:${date}`] || null;

  const byAthlete = React.useMemo(() => {
    const out = {};
    for (const a of activities) { (out[a.athleteId] = out[a.athleteId] || []).push(a); }
    return out;
  }, [activities]);

  const latestByKey = React.useMemo(() => {
    const map = {};
    for (const l of logs) {
      const k = `${l.athleteId}:${l.activityId}`;
      if (!map[k] || new Date(l.performedAt) > new Date(map[k].performedAt)) map[k] = l;
    }
    return map;
  }, [logs]);

  function visibleActivities(athleteId) {
    const all = byAthlete[athleteId] || [];
    let filtered = all;
    if (weekFilter !== "all") filtered = filtered.filter((a) => (a.weekNumber == null ? 1 : a.weekNumber) === Number(weekFilter));
    if (dayFilter === "all") return filtered;
    return filtered.filter((a) => dayOf(a) === Number(dayFilter));
  }

  const columns = (() => {
    const out = [];
    const seen = new Set();
    for (const athlete of athletes) {
      for (const activity of visibleActivities(athlete.id)) {
        const gkey = groupKey(activity);
        if (seen.has(gkey)) continue;
        seen.add(gkey);
        const members = [];
        for (const other of athletes) {
          for (const act of visibleActivities(other.id)) {
            if (groupKey(act) === gkey) members.push({ athleteId: other.id, activityId: act.id, activity: act });
          }
        }
        out.push({ gkey, activityName: activity.activityName, fitnessType: activity.fitnessType, dayIndex: activity.dayIndex, members });
      }
    }
    const rank = (f) => { const i = FITNESS_ORDER.indexOf(f); return i === -1 ? 99 : i; };
    out.sort((a, b) => rank(a.fitnessType) - rank(b.fitnessType) || (a.dayIndex ?? 0) - (b.dayIndex ?? 0) || normName(a.activityName).localeCompare(normName(b.activityName)));
    return out;
  })();

  const fitnessGroups = (() => {
    const groups = [];
    for (const col of columns) {
      const last = groups[groups.length - 1];
      if (last && last.fitness === col.fitnessType) last.columns.push(col);
      else groups.push({ fitness: col.fitnessType, columns: [col] });
    }
    return groups;
  })();

  function memberActivity(column, athleteId) {
    return column.members.find((m) => m.athleteId === athleteId)?.activity || null;
  }

  function effective(athleteId, activityId, field) {
    const c = cells[key(athleteId, activityId)];
    if (c) return field === "status" ? c.status : c[field] != null ? c[field] : null;
    const l = latestByKey[key(athleteId, activityId)];
    if (!l) return null;
    if (field === "status") return l.status;
    if (field === "qty") return l.quantityDone != null ? Number(l.quantityDone) : null;
    if (field === "sets") return l.setsDone != null ? Number(l.setsDone) : null;
    if (field === "reps") return l.repsDone != null ? Number(l.repsDone) : null;
    if (field === "time") return l.timeSec != null ? Number(l.timeSec) : null;
    if (field === "dist") return l.distanceDone != null ? Number(l.distanceDone) : null;
    if (field === "load") return l.loadUsed != null ? Number(l.loadUsed) : null;
    if (field === "attempts") return l.attempts != null ? Number(l.attempts) : null;
    if (field === "note") return l.notes || null;
    return null;
  }

  function targetOf(activity) {
    const toNum = (v) => (v == null ? null : Number(v));
    if (activity.targetQuantity != null) return { n: toNum(activity.targetQuantity), unit: activity.targetUnit, kind: "qty" };
    if (activity.targetDistance != null) return { n: toNum(activity.targetDistance), unit: "m", kind: "qty" };
    if (activity.targetSets != null) return { n: toNum(activity.targetSets), unit: "sets", kind: "sets" };
    if (activity.targetReps != null) return { n: toNum(activity.targetReps), unit: "reps", kind: "reps" };
    return null;
  }

  function autoStatusFor(activity, value) {
    const t = targetOf(activity);
    if (!t || t.kind !== "qty" || value == null || value === "") return null;
    const q = Number(value);
    if (!Number.isFinite(q) || q < 0 || t.n <= 0) return null;
    const ratio = q / t.n;
    return ratio >= 0.9 ? "done" : ratio >= 0.5 ? "partial" : "missed";
  }

  function setCell(athleteId, activityId, patch) {
    const k = key(athleteId, activityId);
    setCells((cur) => ({ ...cur, [k]: { touched: true, status: null, qty: "", sets: "", reps: "", time: "", dist: "", load: "", attempts: "", note: "", ...cur[k], ...patch } }));
  }

  function cycleStatus(athleteId, activityId, activity) {
    const current = effective(athleteId, activityId, "status");
    const next = current === "done" ? "partial" : current === "partial" ? "missed" : "done";
    const patch = { status: next };
    if (next === "done") {
      const t = targetOf(activity);
      if (t && t.kind === "qty") patch.qty = t.n;
    }
    setCell(athleteId, activityId, patch);
  }

  function clearCell(athleteId, activityId) {
    const k = key(athleteId, activityId);
    setCells((cur) => { const n = { ...cur }; delete n[k]; return n; });
  }

  function onQty(athleteId, activityId, activity, value) {
    const patch = { qty: value };
    const auto = autoStatusFor(activity, value);
    if (auto) patch.status = auto;
    setCell(athleteId, activityId, patch);
  }

  function applyPreset(athleteId, preset) {
    const acts = visibleActivities(athleteId);
    setCells((cur) => {
      const n = { ...cur };
      for (const a of acts) {
        const t = targetOf(a);
        const cell = { touched: true, status: preset === "full" ? "done" : preset === "light" ? "partial" : "missed", qty: "", sets: "", reps: "", note: "" };
        if (preset === "full" && t) {
          if (t.kind === "qty") cell.qty = t.n;
          else if (t.kind === "sets") cell.sets = t.n;
          else cell.reps = t.n;
        }
        if (preset === "light" && t && t.kind === "qty") cell.qty = Math.max(0, Math.round(t.n * 0.5));
        n[key(athleteId, a.id)] = cell;
      }
      return n;
    });
  }

  function setRating(athleteId, patch) {
    if (patch && patch.rating !== undefined) manualRatingIds.current.add(athleteId);
    setRatings((cur) => ({ ...cur, [athleteId]: { rating: null, comments: "", ...cur[athleteId], ...patch } }));
  }

  function suggestRating(athleteId) {
    const statuses = (byAthlete[athleteId] || []).map((a) => cells[key(athleteId, a.id)] && cells[key(athleteId, a.id)].status).filter(Boolean);
    if (!statuses.length) return null;
    const avg = statuses.reduce((sum, s) => sum + (s === "done" ? 1 : s === "partial" ? 0.6 : 0.2), 0) / statuses.length;
    return Math.max(1, Math.min(9, Math.round(avg * 10)));
  }

  function presetAll(preset) {
    for (const athlete of athletes) applyPreset(athlete.id, preset);
  }

  function summary() {
    const done = Object.values(cells).filter((c) => c.status === "done").length;
    const partial = Object.values(cells).filter((c) => c.status === "partial").length;
    const missed = Object.values(cells).filter((c) => c.status === "missed").length;
    const athletesCount = new Set(Object.keys(cells).map((k) => k.split(":")[0])).size;
    const rated = Object.values(ratings).filter((r) => r.rating).length;
    return { done, partial, missed, athletes: athletesCount, rated };
  }

  function buildPayload() {
    const rows = Object.keys(cells).map((k) => {
      const [aid, actId] = k.split(":");
      const c = cells[k];
      return { athleteId: Number(aid), activityId: Number(actId), status: c.status, quantityDone: c.qty !== "" ? c.qty : null, setsDone: c.sets !== "" ? c.sets : null, repsDone: c.reps !== "" ? c.reps : null, timeSec: c.time !== "" ? c.time : null, distanceDone: c.dist !== "" ? c.dist : null, loadUsed: c.load !== "" ? c.load : null, attempts: c.attempts !== "" ? c.attempts : null, notes: c.note || null };
    });
    const assessments = Object.keys(ratings).filter((aid) => ratings[aid].rating).map((aid) => ({ athleteId: Number(aid), rating: ratings[aid].rating, comments: ratings[aid].comments || null }));
    return { rows, assessments };
  }

  async function save() {
    const payload = buildPayload();
    if (!payload.rows.length && !payload.assessments.length) { setToast({ kind: "info", text: "Nothing to save yet." }); return; }
    if (!confirm) {
      const s = summary();
      setConfirm({ ...s });
      return;
    }
    setBusy(true); setConfirm(null);
    undoRef.current = { date, rows: {}, hasRatings: payload.assessments.length > 0 };
    for (const k of Object.keys(cells)) {
      const prevLog = latestByKey[k];
      undoRef.current.rows[k] = prevLog ? { status: prevLog.status, qty: prevLog.quantityDone != null ? Number(prevLog.quantityDone) : null, sets: prevLog.setsDone != null ? Number(prevLog.setsDone) : null, reps: prevLog.repsDone != null ? Number(prevLog.repsDone) : null, time: prevLog.timeSec != null ? Number(prevLog.timeSec) : null, dist: prevLog.distanceDone != null ? Number(prevLog.distanceDone) : null, load: prevLog.loadUsed != null ? Number(prevLog.loadUsed) : null, attempts: prevLog.attempts != null ? Number(prevLog.attempts) : null, note: prevLog.notes || null } : null;
    }
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/plan-activity-logs/batch-assess", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ planId, performedAt: date, rows: payload.rows, assessments: payload.assessments }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success) {
        setToast({ kind: "success", text: `Saved ${result.logged} activit${result.logged === 1 ? "y" : "ies"}${result.rated ? ` and ${result.rated} rating${result.rated === 1 ? "" : "s"}` : ""} across ${result.athletes} athlete${result.athletes === 1 ? "" : "s"}`, undo: true });
        onDone();
      } else { setToast({ kind: "error", text: result.error || "Could not save the assessment." }); }
    } catch (e) { setToast({ kind: "error", text: "Unable to reach the server." }); }
    setBusy(false);
  }

  async function undo() {
    const snap = undoRef.current;
    if (!snap || busy) return;
    const rows = Object.keys(snap.rows)
      .map((k) => {
        const [aid, actId] = k.split(":");
        const prev = snap.rows[k];
        return prev ? { athleteId: Number(aid), activityId: Number(actId), status: prev.status, quantityDone: prev.qty != null ? prev.qty : null, setsDone: prev.sets != null ? prev.sets : null, repsDone: prev.reps != null ? prev.reps : null, timeSec: prev.time != null ? prev.time : null, distanceDone: prev.dist != null ? prev.dist : null, loadUsed: prev.load != null ? prev.load : null, attempts: prev.attempts != null ? prev.attempts : null, notes: prev.note || null } : { athleteId: Number(aid), activityId: Number(actId), status: null };
      })
      .filter((r) => r);
    setCells((cur) => {
      const n = { ...cur };
      for (const k of Object.keys(snap.rows)) {
        const prev = snap.rows[k];
        if (!prev) { delete n[k]; continue; }
        n[k] = { touched: true, status: prev.status, qty: prev.qty != null ? prev.qty : "", sets: prev.sets != null ? prev.sets : "", reps: prev.reps != null ? prev.reps : "", time: prev.time != null ? prev.time : "", dist: prev.dist != null ? prev.dist : "", load: prev.load != null ? prev.load : "", attempts: prev.attempts != null ? prev.attempts : "", note: prev.note || "" };
      }
      return n;
    });
    setBusy(true);
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    try {
      const response = await fetch("/api/plan-activity-logs/batch-assess", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ planId, performedAt: snap.date || new Date().toISOString().slice(0, 10), rows, assessments: [] }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success) { setToast({ kind: "info", text: "Undone — previous activity statuses restored. Saved rating rows are kept (you can clear them in the rating row)." }); onDone(); }
      else { setToast({ kind: "error", text: result.error || "Could not undo." }); }
    } catch (e) { setToast({ kind: "error", text: "Unable to reach the server." }); }
    setBusy(false); undoRef.current = null;
  }

  function latestAthleteDate(athleteId) {
    let best = null;
    for (const l of logs) {
      if (l.athleteId !== athleteId) continue;
      if (!best || new Date(l.performedAt) > new Date(best)) best = l.performedAt;
    }
    return best;
  }

  if (!athletes.length) return <p className={styles.empty}>No athletes on this plan to assess.</p>;

  return (
    <div>
      <style jsx>{`
        .studioBar { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; margin-bottom: var(--space-4); }
        .mkWrap { overflow: auto; border: 1px solid rgba(26,92,74,.55); border-radius: var(--radius-xl); background: rgba(6,38,30,.25); max-height: 560px; }
        .mkTable { border-collapse: collapse; min-width: 100%; font-size: 13px; }
        .mkTable th, .mkTable td { border-bottom: 1px solid rgba(26,92,74,.45); padding: var(--space-2) var(--space-3); text-align: left; vertical-align: middle; }
        .mkTable tbody tr:last-child td { border-bottom: none; }
        .mkTable thead th { position: sticky; top: 0; background: #0a3228; z-index: 2; }
        .mkTable th.fix, .mkTable td.fix { position: sticky; left: 0; background: #0d3d31; z-index: 1; min-width: 200px; }
        .mkTable thead th.fix { z-index: 3; }
        .mkTable .mkTypeRow th { position: static; z-index: auto; background: #0d3d31; border-bottom: 1px solid rgba(45,212,168,.28); padding: 4px 8px; }
        .mkCell { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; }
        .dotBtn { width: 36px; height: 32px; border-radius: 6px; border: 1px solid var(--border); background: rgba(255,255,255,.04); color: var(--muted); font-size: 13px; font-weight: 700; cursor: pointer; transition: .12s; flex: 0 0 auto; }
        .dotBtn:hover { border-color: rgba(45,212,168,.6); color: var(--foreground); }
        .dotBtn.on { background: rgba(45,212,168,.2); color: var(--accent); border-color: rgba(45,212,168,.5); }
        .dotBtn.part { background: rgba(251,191,36,.18); color: #fbbf24; border-color: rgba(251,191,36,.45); }
        .dotBtn.miss { background: rgba(248,113,113,.16); color: #f87171; border-color: rgba(248,113,113,.45); }
        .dotBtn.touchedD { outline: 1px solid rgba(45,212,168,.4); }
        .qtyIn { width: 72px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border); background: rgba(255,255,255,.04); color: var(--foreground); font-size: 13px; }
        .rowHead { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
        .rowActions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
        .miniBtn { padding: 6px 10px; font-size: 12px; border-radius: var(--radius-md); border: 1px solid var(--border); background: rgba(255,255,255,.04); color: var(--muted); cursor: pointer; min-height: 36px; }
        .miniBtn:hover { color: var(--accent); border-color: rgba(45,212,168,.5); }
        .evColBtn { margin-top: 2px; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 12px; border-radius: var(--radius-md); border: 1px solid rgba(45,212,168,.45); background: rgba(45,212,168,.1); color: var(--accent); cursor: pointer; min-height: 32px; }
        .evColBtn:hover { background: rgba(45,212,168,.22); }
        .evCellDot { flex: 0 0 auto; width: 28px; height: 28px; border-radius: 6px; border: 1px solid rgba(45,212,168,.4); background: transparent; color: var(--accent); font-size: 12px; cursor: pointer; }
        .evCellDot:hover { background: rgba(45,212,168,.2); }
        .revPanel { border: 1px solid rgba(45,212,168,.5); border-radius: var(--radius-xl); background: rgba(6,38,30,.5); padding: var(--space-3) var(--space-4); margin-top: var(--space-3); }
        .revAthlete { padding: 8px 0; border-bottom: 1px dashed rgba(26,92,74,.5); }
        .revChip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; font-size: 11px; border-radius: 6px; border: 1px solid var(--border); background: rgba(255,255,255,.03); }
        .revThumb { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(45,212,168,.4); cursor: pointer; }
        .lightbox { position: fixed; inset: 0; z-index: 60; background: rgba(2,12,9,.82); display: flex; align-items: center; justify-content: center; padding: 24px; }
        .lightboxCard { max-width: 560px; width: 100%; border: 1px solid rgba(45,212,168,.5); border-radius: 12px; background: #0a2c22; padding: 16px; }
      `}</style>

      <div className="studioBar">
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={styles.fieldControl} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>Day
          <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} className={styles.fieldControl}>
            <option value="all">All days</option>
            {[1,2,3,4,5,6,7].map((d) => <option key={d} value={d}>Day {d}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>Week
          <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)} className={styles.fieldControl}>
            <option value="all">All weeks</option>
            {[...Array(maxWeek)].map((_, i) => <option key={i + 1} value={i + 1}>Week {i + 1}</option>)}
          </select>
        </label>
        <button className={styles.primary} disabled={busy || isCurrentViewLocked} onClick={save}>{busy ? "Saving..." : isCurrentViewLocked ? "Week locked" : "Save assessment"}</button>
        <button className={styles.secondary} onClick={() => setReviewColumn('all')}>View evidence by activity</button>
        {toast && (
          <span role="status" style={{ color: toast.kind === "error" ? "var(--danger)" : toast.kind === "info" ? "var(--muted)" : "var(--accent)", fontSize: 12, lineHeight: 1.4 }}>
            {toast.text}
            {toast.undo && <button className={`${styles.secondary} ${styles.btnSm}`} style={{ marginLeft: "var(--space-2)" }} onClick={undo} disabled={busy}>Undo</button>}
          </span>
        )}
      </div>

      {isCurrentViewLocked && (
        <div className={styles.dangerBox} style={{ marginTop: "var(--space-2)", marginBottom: 0, color: "var(--danger)", fontSize: 12 }}>
          {mixingLocked ? (
            <>
              <strong>Mix-week assessment is locked.</strong> Assessments can only be entered during the current week (Week {currentWeek}). Admin override only.
            </>
          ) : (
            <>
              <strong>Week {selectedWeekNum} is locked{weekWindowLabel(selectedWeekNum) ? ` — ${weekWindowLabel(selectedWeekNum)}` : ""}.</strong> Assessments can only be entered during the current week (Week {currentWeek}). Admin override only.
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-3)" }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Everything shown, everyone:</span>
        <button type="button" className={styles.secondary} disabled={isCurrentViewLocked} onClick={() => presetAll("full")}>All done</button>
        <button type="button" className={styles.secondary} disabled={isCurrentViewLocked} onClick={() => presetAll("light")}>Mark half-day</button>
        <button type="button" className={styles.secondary} disabled={isCurrentViewLocked} onClick={() => presetAll("rest")}>Mark as rest day</button>
      </div>

      <p className={styles.formHint} style={{ marginTop: 0, marginBottom: "var(--space-3)" }}>Cells start marked done at their target for the selected date. Tap a cell&apos;s button to flip its status (D → P → M → open), type an amount and the status picks itself, or use the Everyone buttons to fill the whole view at once. Ratings auto-fill as cells are completed — adjust any athlete&apos;s rating to override. Activities without a set week are shown under Week 1.</p>

      {confirm && (
        <div className={styles.alertBox} style={{ marginBottom: "var(--space-3)" }}>
          Save {confirm.athletes} athlete{confirm.athletes === 1 ? "" : "s"}: <strong style={{ color: "var(--accent)" }}>{confirm.done} done</strong>, <strong style={{ color: "var(--warning)" }}>{confirm.partial} partial</strong>, <strong style={{ color: "var(--danger)" }}>{confirm.missed} missed</strong>{confirm.rated ? `, ${confirm.rated} rating${confirm.rated === 1 ? "" : "s"}` : ""} for {date}?
          <div style={{ marginTop: "var(--space-2)", display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
            {[...new Set(Object.keys(cells).map((k) => k.split(":")[0]))].map((aid) => {
              const at = athletes.find((x) => String(x.id) === aid);
              const ev = evFor(Number(aid));
              if (!at) return null;
              return (
                <span key={aid} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                  {at.lastName}, {at.firstName}
                  {ev && ev.url ? <strong style={{ color: "var(--accent)" }}>✓ evidence</strong> : <strong style={{ color: "var(--danger)" }}>⚠ no evidence</strong>}
                </span>
              );
            })}
          </div>
          <p style={{ margin: "var(--space-2) 0 0", fontSize: 11, color: "var(--muted)" }}>Tip: upload at least one training photo per athlete before saving, so the agency can confirm the session actually happened.</p>
          <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)" }}><button className={styles.primary} onClick={save} disabled={busy}>Confirm save</button><button className={styles.secondary} onClick={() => setConfirm(null)} disabled={busy}>Back</button></div>
        </div>
      )}

      <div className="mkWrap">
        <table className="mkTable">
          <thead>
            <tr className="mkTypeRow">
              <th />
              {fitnessGroups.map((g) => (
                <th key={g.fitness} colSpan={g.columns.length}>
                  <span className={styles.badge} style={{ background: "rgba(45,212,168,.16)", color: "var(--accent)" }}>{FITNESS_META[g.fitness] || g.fitness}</span>
                </th>
              ))}
            </tr>
<tr>
              <th className="fix">Athlete</th>
              {columns.map((column) => {
                const withPhoto = column.members.filter((m) => evFor(m.athleteId)).length;
                return (
                  <th key={column.gkey} style={{ minWidth: 170 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <strong>{column.activityName}</strong>
                      <small style={{ color: "var(--muted)", fontWeight: 400 }}>{FITNESS_META[column.fitnessType] || column.fitnessType}{column.dayIndex ? ` · Day ${column.dayIndex}` : ""}</small>
                      {(() => {
                        const m = column.members[0]?.activity;
                        if (!m || !m.metricType || m.metricType === "none") return null;
                        const tv = targetValueFor(m);
                        return <small style={{ color: "rgba(45,212,168,.55)", fontWeight: 500 }}>{METRIC_LABELS[m.metricType]}{tv != null ? ` · target ${tv}${resultUnitFor(m.metricType)}` : ""}</small>;
                      })()}
                      <button type="button" className="evColBtn" title="Review training evidence for every athlete in this activity" onClick={() => setReviewColumn(column.gkey)}>📷 {withPhoto}/{column.members.length} have photos</button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {athletes.map((athlete) => {
              const lastDate = latestAthleteDate(athlete.id);
              return (
                <React.Fragment key={athlete.id}>
                  <tr>
                    <td className="fix">
                      <div className="rowHead">
                        <strong>{athlete.lastName}, {athlete.firstName}</strong>
                        {evFor(athlete.id) && evFor(athlete.id).url && (
                          <img src={evFor(athlete.id).url} alt="Evidence photo" title="Training evidence photo for this date" style={{ width: 34, height: 34, borderRadius: 6, objectFit: "cover", border: "1px solid rgba(45,212,168,.4)", cursor: "pointer" }} onClick={() => setShowLightbox(evFor(athlete.id))} />
                        )}
                        <span className={`${styles.badge} ${styles.badgeMuted}`} style={{ fontSize: 9 }}>{lastDate ? `Assessed ${fmtDate(lastDate)}` : "Open"}</span>
                      </div>
                      <small style={{ color: "var(--muted)", display: "block" }}>{athlete.athleteCode}</small>
                      <div className="rowActions">
                        <button className="miniBtn" disabled={isCurrentViewLocked} title="Mark all this athlete's shown activities as done" onClick={() => applyPreset(athlete.id, "full")}>Full</button>
                        <button className="miniBtn" disabled={isCurrentViewLocked} title="Mark all at half target" onClick={() => applyPreset(athlete.id, "light")}>Half</button>
                        <button className="miniBtn" disabled={isCurrentViewLocked} title="Mark all missed" onClick={() => applyPreset(athlete.id, "rest")}>Rest</button>
                        <button className={`miniBtn ${openRatingId === athlete.id ? "on" : ""}`} disabled={isCurrentViewLocked} onClick={() => setOpenRatingId(openRatingId === athlete.id ? null : athlete.id)}>Rating</button>
                        {(() => { const ev = evFor(athlete.id); return <button className={`miniBtn ${ev && ev.url ? "on" : ""}`} disabled={isCurrentViewLocked} title="Upload a training photo as proof the session happened" onClick={() => pickEvidence(athlete.id)}>{ev && ev.uploading ? "Uploading…" : "📷 Evidence"}</button>; })()}
                      </div>
                    </td>
                    {columns.map((column) => {
                      const activity = memberActivity(column, athlete.id);
                      if (!activity) return <td key={column.gkey} />;
                      const activityId = activity.id;
                      const status = effective(athlete.id, activityId, "status");
                      const touched = !!cells[key(athlete.id, activityId)];
                      const qty = effective(athlete.id, activityId, "qty");
                      const metricType = activity.metricType || "none";
                      const resultField = metricType === "time" ? "time" : metricType === "distance" ? "dist" : metricType === "load" ? "load" : metricType === "reps" ? "reps" : metricType === "sets" ? "sets" : "qty";
                      const result = resultField === "qty" ? qty : effective(athlete.id, activityId, resultField);
                      const cellTargetUnit = metricType === "time" ? "secs" : metricType === "distance" ? "m" : metricType === "load" ? "kg" : null;
                      const resultPlaceholder = metricType === "time" ? "secs" : metricType === "distance" ? "m" : metricType === "load" ? "kg" : metricType === "reps" ? "reps" : metricType === "sets" ? "sets" : (cellTargetUnit || activity.targetUnit) ? `amt${cellTargetUnit ? ` (${cellTargetUnit})` : activity.targetUnit ? ` (${activity.targetUnit})` : ""}` : "amt";
                      const onResult = (value) => {
                        if (resultField === "qty") onQty(athlete.id, activityId, activity, value);
                        else setCell(athlete.id, activityId, { [resultField]: value });
                      };
                      const effAttempts = effective(athlete.id, activityId, "attempts");
                      return (
                        <td key={column.gkey}>
                          <span className="mkCell">
                            <button className={`dotBtn ${status === "done" ? "on" : status === "partial" ? "part" : status === "missed" ? "miss" : ""} ${touched ? "touchedD" : ""}`} disabled={isCurrentViewLocked} title={status ? `Status: ${status === "done" ? "Done" : status === "partial" ? "Partial" : "Missed"}. Tap to change.` : "Open. Tap to mark Done."} onClick={() => cycleStatus(athlete.id, activityId, activity)}>{status === "done" ? "D" : status === "partial" ? "P" : status === "missed" ? "M" : "–"}</button>
                            <input className="qtyIn" disabled={isCurrentViewLocked} type="number" min="0" step="any" placeholder={resultPlaceholder} value={result != null ? result : ""} onChange={(e) => onResult(e.target.value)} title={metricType === "none" ? "Amount done" : `${METRIC_LABELS[metricType] || metricType} result`} />
                            <input className="qtyIn" disabled={isCurrentViewLocked} type="number" min="0" step="1" placeholder="#" value={effAttempts != null ? effAttempts : ""} onChange={(e) => setCell(athlete.id, activityId, { attempts: e.target.value })} style={{ width: 46 }} title="Attempts taken" />
                            {evFor(athlete.id) && <button type="button" className="evCellDot" title="View today's evidence photo" onClick={() => setShowLightbox(evFor(athlete.id))}>📷</button>}
                            {touched && <button className="miniBtn" disabled={isCurrentViewLocked} title="Clear this cell (not part of the save)" onClick={() => clearCell(athlete.id, activityId)}>✕</button>}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                  {openRatingId === athlete.id && (
                    <tr>
                      <td className="fix"><strong style={{ fontSize: 11 }}>Rating &amp; comment</strong></td>
                      <td colSpan={columns.length} style={{ padding: 0 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", padding: "var(--space-3) var(--space-4)", alignItems: "center" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>Rating
                            <select className={styles.fieldControl} disabled={isCurrentViewLocked} value={ratings[athlete.id]?.rating || ""} onChange={(e) => setRating(athlete.id, { rating: e.target.value ? Number(e.target.value) : null })}>
                              <option value="">No rating</option>
                              {[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n}/10</option>)}
                            </select>
                          </label>
                          {suggestRating(athlete.id) != null && (
                            <button className={`${styles.secondary} ${styles.btnSm}`} disabled={isCurrentViewLocked} onClick={() => setRating(athlete.id, { rating: suggestRating(athlete.id) })}>Use suggestion ({suggestRating(athlete.id)})</button>
                          )}
                          <input className={styles.fieldControl} disabled={isCurrentViewLocked} style={{ flex: "1 1 200px", minWidth: 160 }} value={ratings[athlete.id]?.comments || ""} onChange={(e) => setRating(athlete.id, { comments: e.target.value })} placeholder="Summary comment (optional)" />
                          <small style={{ color: "var(--muted)" }}>10 = exceeded · 7–8 = solid · 5–6 = partial · 1–4 = needs work</small>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {reviewColumn && (() => {
  const isAll = reviewColumn === 'all';
  const colsToShow = isAll ? columns : [columns.find((c) => c.gkey === reviewColumn)].filter(Boolean);
  if (!colsToShow.length) return null;
  return (
    <div className="revPanel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
        <strong style={{ color: "var(--accent)" }}>{isAll ? 'Evidence by activity (all)' : `Evidence by activity: ${colsToShow[0].activityName}`}</strong>
        <button className="miniBtn" onClick={() => setReviewColumn(null)}>Close</button>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--muted)" }}>Review which athletes have proof for each day they performed each activity. Click a photo to view it full-size.</p>
      {colsToShow.map((column) => (
        <div key={column.gkey} style={{ marginBottom: isAll ? 16 : 0 }}>
          {isAll && <h4 style={{ margin: "8px 0 4px", color: "var(--accent)", fontSize: 13 }}>{column.activityName} <small style={{ color: "var(--muted)", fontWeight: 400 }}>({column.fitnessType}{column.dayIndex ? ` · Day ${column.dayIndex}` : ''})</small></h4>}
          {column.members.map((m) => {
            const athlete = athletes.find((x) => x.id === m.athleteId);
            const act = m.activity;
            const logMap = {};
            for (const l of logs) if (l.athleteId === m.athleteId && l.activityId === act.id && !(logMap[l.performedAt.slice(0, 10)] && new Date(l.performedAt) < new Date(logMap[l.performedAt.slice(0, 10)].performedAt))) logMap[l.performedAt.slice(0, 10)] = l;
            const entries = Object.keys(logMap).sort((a, b) => (a < b ? 1 : -1)).map((ds) => ({ ds, status: logMap[ds].status, log: logMap[ds], photo: evidenceMap[`${m.athleteId}:${ds}`] || null }));
            const todayTouched = !!cells[key(m.athleteId, act.id)];
            const todayStatus = effective(m.athleteId, act.id, "status");
            if (todayTouched || todayStatus) {
              const ds = date;
              if (!logMap[ds]) entries.push({ ds, status: todayStatus, log: null, photo: evFor(m.athleteId), pending: true });
            }
            return (
              <div key={m.athleteId} className="revAthlete">
                <strong style={{ fontSize: 12 }}>{athlete ? `${athlete.lastName}, ${athlete.firstName}` : `Athlete #${m.athleteId}`}</strong>
                {athlete && <small style={{ color: "var(--muted)", marginLeft: 6 }}>{athlete.athleteCode}</small>}
                {entries.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                    {entries.map((en) => (
                      <span key={en.ds} className="revChip">
                        <span style={{ fontWeight: 600 }}>{fmtDate(en.ds + "T00:00:00Z")}</span>
                        <span style={{ color: en.status === "done" ? "var(--accent)" : en.status === "partial" ? "var(--warning)" : en.status === "missed" ? "#f87171" : "var(--muted)", textTransform: "capitalize" }}>{en.status || "—"}</span>
                        {en.pending && <small style={{ color: "var(--warning)" }}>to be saved</small>}
                        {en.photo && en.photo.url ? (
                          <img src={en.photo.url} alt="Evidence" className="revThumb" onClick={() => setShowLightbox(en.photo)} />
                        ) : <span style={{ color: "var(--muted)" }}>no photo</span>}
                      </span>
                    ))}
                  </div>
                ) : <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--muted)" }}>No sessions recorded yet.</p>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
})()}

{showLightbox && (() => {
  const athlete = athletes.find((x) => x.id === showLightbox.athleteId);
  return (
    <div className="lightbox" onClick={() => setShowLightbox(null)}>
      <div className="lightboxCard" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
          <strong style={{ color: "var(--accent)" }}>Training evidence</strong>
          <button className="miniBtn" onClick={() => setShowLightbox(null)}>Close</button>
        </div>
        <img src={showLightbox.url} alt="Training evidence" style={{ width: "100%", maxHeight: 480, objectFit: "contain", borderRadius: 8, background: "#03150f" }} />
        <div style={{ marginTop: "var(--space-2)", fontSize: 12, lineHeight: 1.6 }}>
          <strong>{athlete ? `${athlete.lastName}, ${athlete.firstName}` : `Athlete #${showLightbox.athleteId}`}</strong>
          {athlete && <small style={{ color: "var(--muted)", marginLeft: 6 }}>{athlete.athleteCode}</small>}
          <div style={{ color: "var(--muted)" }}>
            Date: {fmtDate(showLightbox.dayStr + "T00:00:00Z")}
            {showLightbox.notes ? ` · Notes: ${showLightbox.notes}` : ""}
            {showLightbox.uploader?.username ? ` · Recorded by ${showLightbox.uploader.username}` : ""}
          </div>
        </div>
        <div style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-2)" }}>
          <button className="miniBtn" style={{ borderColor: "rgba(248,113,113,.5)", color: "#f87171" }} onClick={() => deleteEvidenceRow(showLightbox)}>Remove photo</button>
        </div>
      </div>
    </div>
  );
})()}
    </div>
  );
}

function MonitoringGrid({ data, athletes, maxWeek, currentWeek, onWeekChange }) {
  const days = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];
  const grid = data?.grid || {};

  const getDayStatus = (dayData) => {
    if (dayData.total === 0) return "none";
    if (dayData.done === dayData.total) return "done";
    if (dayData.done > 0 || dayData.partial > 0 || dayData.missed > 0) return "partial";
    return "pending";
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "done": return "day-done";
      case "partial": return "day-partial";
      case "pending": return "day-pending";
      default: return "day-none";
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
        <div className={styles.fullField} style={{ minWidth: 160 }}>
          <label>Week<select value={currentWeek} onChange={(e) => onWeekChange(parseInt(e.target.value))} className={styles.fieldControl}>
            {[...Array(maxWeek)].map((_, i) => <option key={i + 1} value={i + 1}>Week {i + 1}</option>)}
          </select></label>
        </div>
        <p className={styles.formHint} style={{ margin: 0, color: "var(--muted)" }}>
          {maxWeek ? `Plan weeks: ${maxWeek}` : "No duration set"}
        </p>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 180 }}>Athlete</th>
              {days.map((d, i) => <th key={i} style={{ textAlign: "center" }}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {athletes.map((athlete) => {
              const row = grid[athlete.id];
              return (
                <tr key={athlete.id}>
                  <td data-label="Athlete">
                    <strong>{athlete.lastName}, {athlete.firstName}</strong><br />
                    <small>{athlete.athleteCode}</small>
                    {(() => { const p = data?.progress?.[athlete.id]; if (!p || p.total === 0) return null; return (
                      <div style={{ marginTop: 6, fontSize: 11 }}>
                        <span style={{ color: "var(--accent)", fontWeight: 700 }}>Week {currentWeek}: {p.percent}%</span>
                        <small style={{ color: "var(--muted)" }}> ({p.completed}/{p.total})</small>
                      </div>
                    ); })()}
                  </td>
                  {days.map((_, i) => {
                    const dayData = row?.days[i + 1] || { total: 0, done: 0, partial: 0, missed: 0, pending: 0 };
                    const status = getDayStatus(dayData);
                    const dayPercent = dayData.total > 0 ? Math.round(((dayData.done + dayData.partial) / dayData.total) * 100) : null;
                    return (
                      <td key={i} style={{ textAlign: "center", verticalAlign: "middle" }}>
                        <span className={`day-badge ${getStatusClass(status)}`} title={`${dayData.done} done · ${dayData.partial} partial · ${dayData.missed} missed · ${dayData.pending} open`}>
                          {dayPercent != null ? `${dayPercent}%` : "—"}
                        </span>
                        {dayData.total > 0 && (
                          <>
                            <div style={{ marginTop: 6, fontSize: 10, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 3 }}>
                              {dayData.activities.map(a => {
                                const p = computeProgress(a, a.log);
                                return (
                                  <div key={a.id} title={`${a.activityName}${p ? ` · ${p.percent}% complete` : a.log ? ` · ${a.log.status}` : " · not started"}`} style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: 170 }}>
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto", textAlign: "left" }}>{a.activityName}</span>
                                    {p ? (
                                      <strong style={{ color: completionColor(p.percent), flex: "0 0 auto" }}>{p.percent}%</strong>
                                    ) : a.log ? (
                                      <span style={{ flex: "0 0 auto", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.8 }}>{a.log.status}</span>
                                    ) : (
                                      <strong style={{ color: "var(--muted)", flex: "0 0 auto", opacity: 0.85 }}>0%</strong>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .day-badge { display: inline-block; min-width: 48px; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 12px; }
        .day-done { background: rgba(45,212,168,.2); color: var(--accent); border: 1px solid rgba(45,212,168,.4); }
        .day-partial { background: rgba(251,191,36,.2); color: #fbbf24; border: 1px solid rgba(251,191,36,.4); }
        .day-pending { background: rgba(26,92,74,.1); color: var(--muted); border: 1px solid rgba(26,92,74,.2); }
        .day-none { background: transparent; color: var(--muted); border: 1px dashed var(--border); }
      `}</style>
    </div>
  );
}

function TrainingCharts({ plan, athletes, activities, logs, perAthlete, barData, fitnessDist, weekly, overallCompletion }) {
  return (
    <div>
      <div className={styles.statGrid}>
        <div className={`${styles.detailPanel} ${styles.panelBox}`}><h4>Athletes on plan</h4><div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)" }}>{athletes.length}</div><small style={{ color: "var(--muted)" }}>{totalActivitiesLabel(activities)}</small></div>
        <div className={`${styles.detailPanel} ${styles.panelBox}`}><h4>Overall completion</h4><div style={{ fontSize: 26, fontWeight: 800, color: completionColor(overallCompletion) }}>{overallCompletion}%</div><small style={{ color: "var(--muted)" }}>Across planned activities</small></div>
        <div className={`${styles.detailPanel} ${styles.panelBox}`}><h4>Duration</h4><div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)" }}>{plan.durationDays ? `${plan.durationDays}d` : plan.durationWeeks ? `${plan.durationWeeks}w` : "—"}</div><small style={{ color: "var(--muted)" }}>Plan length</small></div>
      </div>

      <div className={styles.chartGrid}>
        <div className={`${styles.detailPanel} ${styles.panelBox}`}>
          <h4>Completion by athlete <small style={{ color: "var(--muted)", fontWeight: 400 }}>(green ≥ 80%, yellow ≥ 50%, red &lt; 50%)</small></h4>
          {perAthlete.length && perAthlete.some((r) => r.total > 0) ? (
            <ResponsiveContainer width="100%" height={barChartHeight(barData.length)}>
              <BarChart data={barData} layout="vertical" margin={CHART_MARGINS.barHorizontal}>
                <CartesianGrid {...CHART_GRID.cartesian} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} ticks={[0,20,40,60,80,100]} tick={CHART_AXIS.x} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={CHART_AXES.barCategory} tick={CHART_AXIS.y} />
                <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`${v}%`, "Completion"]} labelFormatter={(l, p) => p?.[0]?.payload?.full || l} cursor={{ fill: "rgba(45,212,168,0.08)" }} />
                <Bar dataKey="percent" name="Completion" radius={[0, 4, 4, 0]}>{barData.map((d) => <Cell key={d.full} fill={completionColor(d.percent)} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>No planned activities yet.</p>}
          {perAthlete.length > 20 && <small style={{ color: "var(--muted)" }}>Showing first 20 of {perAthlete.length} athletes.</small>}
        </div>
      </div>

      <div className={styles.chartGrid}>
        <div className={`${styles.detailPanel} ${styles.panelBox}`}>
          <h4>Activities by fitness dimension</h4>
          {fitnessDist.length ? (
            <ResponsiveContainer width="100%" height={CHART_HEIGHTS.pie}>
              <PieChart>
                <Pie data={fitnessDist} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2}>
                  {fitnessDist.map((s) => <Cell key={s.key} fill={s.color} />)}
                </Pie>
                <Tooltip {...CHART_TOOLTIP} formatter={(v, name) => [`${v} activities`, name]} />
                <Legend {...CHART_LEGEND} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>No activities on this plan yet.</p>}
        </div>

        <div className={`${styles.detailPanel} ${styles.panelBox}`}>
          <h4>Weekly completion trend</h4>
          {weekly.some((w) => w.total > 0) ? (
            <ResponsiveContainer width="100%" height={CHART_HEIGHTS.line}>
              <LineChart data={weekly} margin={CHART_MARGINS.line}>
                <CartesianGrid {...CHART_GRID.cartesian} />
                <XAxis dataKey="week" tick={CHART_AXIS.x} tickFormatter={(v) => `W${v}`} />
                <YAxis domain={[0, 100]} ticks={[0,20,40,60,80,100]} tick={CHART_AXIS.y} tickFormatter={(v) => `${v}%`} />
                <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`${v}%`, "Completion"]} labelFormatter={(l) => `Week ${l}`} cursor={{ stroke: "rgba(45,212,168,0.4)" }} />
                <Line type="monotone" dataKey="percent" name="Completion" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ fill: CHART_COLORS.primary, r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>No planned activities yet.</p>}
        </div>
      </div>
    </div>
  );
}

function totalActivitiesLabel(activities) {
  return `${activities.length} planned activit${activities.length === 1 ? "y" : "ies"}`;
}

const HEALTH_BADGE = {
  healthy: { cls: "badgeActive", label: "Healthy" },
  sick: { cls: "badgePending", label: "Sick" },
  injured: { cls: "badgeRejected", label: "Injured" },
  recovering: { cls: "badgePending", label: "Recovering" },
  inactive: { cls: "badgeMuted", label: "Inactive" },
};

function AthleteRosterTable({ plan, athletes, activities, logs, isAdmin, latestRatings = {} }) {
  const rows = athletes.map((a) => {
    const acts = activities.filter((act) => act.athleteId === a.id);
    let done = 0, partial = 0, missed = 0, open = 0;
    for (const act of acts) {
      const al = logs.filter((l) => l.activityId === act.id && l.athleteId === a.id);
      const latest = al.length ? [...al].sort((x, y) => new Date(y.performedAt) - new Date(x.performedAt))[0] : null;
      const status = latest ? latest.status : "open";
      if (status === "done") done++;
      else if (status === "partial") partial++;
      else if (status === "missed") missed++;
      else open++;
    }
    const total = acts.length;
    const percent = total ? Math.round(((done + partial) / total) * 100) : 0;
    const myLogs = logs.filter((l) => l.athleteId === a.id);
    const lastSession = myLogs.length ? [...myLogs].sort((x, y) => new Date(y.performedAt) - new Date(x.performedAt))[0].performedAt : null;
    return { ...a, total, done, partial, missed, open, percent, lastSession, rating: latestRatings[a.id] ?? null };
  });

  return (
    <div className={styles.tableWrap}>
      <table>
        <thead>
          <tr>
            <th>Athlete</th>
            <th>Sport</th>
            <th>Health</th>
            <th>Completion</th>
            <th>Rating</th>
            <th>Last session</th>
            <th style={{ textAlign: "right" }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <AthleteRosterRow key={row.id} plan={plan} row={row} isAdmin={isAdmin} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AthleteRosterRow({ plan, row, isAdmin }) {
  const router = useRouter();
  const health = HEALTH_BADGE[row.healthStatus] || HEALTH_BADGE.healthy;
  return (
    <React.Fragment>
      <tr>
        <td data-label="Athlete">
          <strong>{row.lastName}, {row.firstName}</strong>
          {row.athleteCode ? <small style={{ color: "var(--muted)", display: "block" }}>{row.athleteCode}</small> : null}
        </td>
        <td data-label="Sport">{row.sport?.sportName || "—"}</td>
        <td data-label="Health"><span className={`${styles.badge} ${styles[health.cls]}`} style={{ fontSize: 11 }}>{health.label}</span></td>
        <td data-label="Completion">
          {row.total === 0 ? <span className={styles.formHint} style={{ color: "var(--muted)" }}>No activities planned</span> : (
            <div>
              <strong style={{ color: completionColor(row.percent), fontSize: 16 }}>{row.percent}%</strong>
              <small style={{ color: "var(--muted)", marginLeft: 6 }}>{row.done} done · {row.partial} partial · {row.missed} missed</small>
            </div>
          )}
        </td>
        <td data-label="Rating">{row.rating != null ? (
          <span className={`${styles.badge} ${row.rating >= 7 ? styles.badgeActive : row.rating >= 5 ? styles.badgePending : styles.badgeRejected}`} style={{ fontSize: 11 }}>★ {row.rating}/10</span>
        ) : "—"}</td>
        <td data-label="Last session">{row.lastSession ? fmtDate(row.lastSession) : "—"}</td>
        <td style={{ textAlign: "right" }}>
          <button className={styles.secondary} onClick={() => router.push(`/training-plans/${plan.id}/athletes/${row.id}`)}>See progress →</button>
        </td>
      </tr>
    </React.Fragment>
  );
}

