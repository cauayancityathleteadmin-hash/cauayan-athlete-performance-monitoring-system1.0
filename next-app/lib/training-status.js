/* Training status — the honest replacement for session "attendance".
   ==========================================================================
   Cauayan athletes do NOT train in one place at one time. A roll-call
   (present/late/absent) therefore mislabels anyone who trains individually.
   This module answers the question that actually matters:

       "Did the athlete do the training assigned for that day?"

   and, for rest / sick / injured days, marks them EXCUSED so they are not
   counted against the athlete.

   Single source of truth for:
     - the wording shown to users (labels + colours)
     - the per-day status roll-up used by the athlete page and reports
   Do not re-declare these labels or thresholds anywhere else.
   ========================================================================== */

/* Per-activity status wording. "excused" is a reason-backed day, not a miss. */
export const TRAINING_STATUS_META = {
  done: { label: "Trained", short: "D", color: "var(--accent)" },
  partial: { label: "Partly trained", short: "P", color: "var(--warning)" },
  missed: { label: "Not trained", short: "M", color: "var(--danger)" },
  excused: { label: "Excused", short: "E", color: "var(--muted)" },
  planned: { label: "No plan", short: "–", color: "var(--muted)" },
};

/* Reason wording for excused days/activities. */
export const EXCUSE_REASON_META = {
  rest: { label: "Rest / recovery", color: "var(--muted)" },
  sick: { label: "Sick", color: "var(--warning)" },
  injured: { label: "Injured", color: "var(--danger)" },
  excused: { label: "Excused", color: "var(--muted)" },
};

export const EXCUSE_REASONS = ["rest", "sick", "injured", "excused"];

export function excuseReasonLabel(reason) {
  return EXCUSE_REASON_META[reason]?.label || "Excused";
}

export function trainingStatusLabel(status) {
  return TRAINING_STATUS_META[status]?.label || "No plan";
}

/* Collapse a day's activity logs into ONE honest status:
   - any real work done            -> partially/fully trained
   - all excused                    -> excused (rest/sick/injured)
   - assigned but nothing done      -> not trained
   - nothing assigned               -> no plan (neutral, never counts against)
   `logs` is an array of { status, excuseReason }. */
const REASON_PRIORITY = { injured: 4, sick: 3, rest: 2, excused: 1 };

export function rollUpDayStatus(logs) {
  if (!logs || !logs.length) return { status: "planned", reason: null, counts: { done: 0, partial: 0, missed: 0, excused: 0 } };

  const counts = { done: 0, partial: 0, missed: 0, excused: 0 };
  let reason = null;
  for (const log of logs) {
    const s = log.status === "planned" ? "missed" : log.status;
    if (counts[s] != null) counts[s] += 1;
    if (s === "excused" && log.excuseReason) {
      if (!reason || (REASON_PRIORITY[log.excuseReason] || 0) > (REASON_PRIORITY[reason] || 0)) reason = log.excuseReason;
    }
  }

  const worked = counts.done + counts.partial;
  let status;
  if (worked > 0 && counts.missed === 0 && counts.excused === 0) status = counts.partial > 0 ? "partial" : "done";
  else if (worked > 0) status = "partial";
  else if (counts.excused > 0 && counts.missed === 0) { status = "excused"; }
  else if (counts.excused > 0) status = "partial";
  else if (counts.missed > 0) status = "missed";
  else status = "planned";

  return { status, reason, counts };
}

/* Aggregate a list of day results into period totals for reports.
   `days` is an array of { status, reason }. */
export function summarizeTrainingDays(days) {
  const totals = { trained: 0, partial: 0, excused: 0, missed: 0, noPlan: 0, total: days.length };
  for (const d of days) {
    if (d.status === "done") totals.trained += 1;
    else if (d.status === "partial") totals.partial += 1;
    else if (d.status === "excused") totals.excused += 1;
    else if (d.status === "missed") totals.missed += 1;
    else totals.noPlan += 1;
  }
  // Discipline rate excludes excused and no-plan days so rest/injury never penalises.
  const counted = totals.trained + totals.partial + totals.missed;
  totals.disciplineRate = counted ? Math.round(((totals.trained + totals.partial * 0.5) / counted) * 100) : null;
  return totals;
}

/* UTC day key (YYYY-MM-DD) for grouping logs into days. */
export function dayKeyUTC(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
}

/* Build day-by-day training status from flat activity logs.
   `logs` is an array of { performedAt, status, excuseReason, ... }.
   Returns an array sorted ascending by day: { day, status, reason, counts, logs }. */
export function buildTrainingDays(logs) {
  const byDay = new Map();
  for (const log of logs || []) {
    const k = dayKeyUTC(log.performedAt);
    if (!k) continue;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(log);
  }
  return [...byDay.entries()]
    .map(([day, dayLogs]) => ({ day, ...rollUpDayStatus(dayLogs), logs: dayLogs }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}
