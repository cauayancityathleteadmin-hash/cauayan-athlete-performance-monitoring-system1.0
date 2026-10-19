// Report period presets — single source of truth shared by the personnel
// Records tab (pages/reports.js) and the Accomplishments report
// (components/reports/AccomplishmentsReport.js). The server only ever filters
// by from/to; all preset math lives here.
//
// School year = June 1 → May 31 (Philippine DepEd cycle).

export const PERIOD_PRESETS = [
  { id: "month", label: "This month" },
  { id: "lastmonth", label: "Last month" },
  { id: "quarter", label: "This quarter" },
  { id: "year", label: "This year" },
  { id: "sy", label: "School year" },
  { id: "custom", label: "Custom" },
  { id: "all", label: "All-time" },
];

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Returns { from, to } as YYYY-MM-DD strings ("" = unbounded).
export function presetRange(preset, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "month": return { from: isoDate(new Date(y, m, 1)), to: isoDate(now) };
    case "lastmonth": return { from: isoDate(new Date(y, m - 1, 1)), to: isoDate(new Date(y, m, 0)) };
    case "quarter": return { from: isoDate(new Date(y, Math.floor(m / 3) * 3, 1)), to: isoDate(now) };
    case "year": return { from: isoDate(new Date(y, 0, 1)), to: isoDate(now) };
    case "sy": return { from: isoDate(m >= 5 ? new Date(y, 5, 1) : new Date(y - 1, 5, 1)), to: isoDate(now) };
    default: return { from: "", to: "" };
  }
}

export function periodText(from, to) {
  if (!from && !to) return "All-time";
  const fmt = (v, fallback) => {
    if (!v) return fallback;
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
    return isNaN(d.getTime()) ? fallback : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  };
  return `${fmt(from, "earliest")} — ${fmt(to, "latest")}`;
}

// True when a date value falls inside the inclusive [from, to] window.
export function inPeriod(value, from, to) {
  if (!from && !to) return true;
  if (!value) return false;
  const t = new Date(value).getTime();
  if (isNaN(t)) return false;
  if (from) {
    const f = new Date(`${String(from).slice(0, 10)}T00:00:00`).getTime();
    if (!isNaN(f) && t < f) return false;
  }
  if (to) {
    const e = new Date(`${String(to).slice(0, 10)}T23:59:59.999`).getTime();
    if (!isNaN(e) && t > e) return false;
  }
  return true;
}
