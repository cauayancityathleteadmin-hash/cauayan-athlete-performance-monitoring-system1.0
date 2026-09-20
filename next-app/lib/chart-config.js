/* ============================================================================
   CHART STANDARD — the single source of truth for every chart in the system.

   Rules (follow on every chart change, without asking):
   - Sizing: one height per chart type via CHART_HEIGHTS. Width is always 100%
     of the chart's container via <ResponsiveContainer width="100%"> — never
     fixed pixel widths. Many-row horizontal bars use barChartHeight(count).
   - Spacing: recharts margins come from CHART_MARGINS (matching the system's
     token scale). Space around charts uses layout classes (.chartGrid etc.),
     not inline pixel margins.
   - Colors: series colors come from CHART_COLORS / CHART_COLORS.palette.
     The same kind of data always uses the same color (e.g. completion green /
     warning / danger via completionColor(), done=primary partial=warning
     missed=danger open=muted). No per-page color tables.
   - Axes: ticks use CHART_AXIS (12px). Horizontal-bar category axis width is
     CHART_AXES.barCategory with shortAxisLabel() truncation so names never
     overlap. Percent axes format with `${v}%`, rating axes with `/10`.
   - Legend: CHART_LEGEND (circle icons, bottom-center, 12px) where a legend is
     shown.
   - Grid/background: CHART_GRID cartesian/polar everywhere.
   - Tooltips: CHART_TOOLTIP on every recharts chart (dark panel, exact value).
   - Empty state: every chart renders <p className={styles.empty}>…</p> when it
     has no data. (getEmptyState removed — one shared pattern per page.)
   - Loading: pages that load chart data client-side keep their existing
     "Loading …" message; charts render only once their data exists.
   ========================================================================== */

export const CHART_HEIGHTS = {
  line: 240,
  barVertical: 240,
  barHorizontal: 280,
  barStacked: 200,
  radar: 240,
  pie: 280,
  barRow: 28,
};

export const CHART_MARGINS = {
  line: { top: 6, right: 12, left: 16, bottom: 24 },
  barVertical: { top: 6, right: 16, left: 16, bottom: 24 },
  barHorizontal: { top: 6, right: 16, left: 16, bottom: 24 },
  radar: { top: 6, right: 12, left: 16, bottom: 24 },
  pie: { top: 6, right: 12, left: 12, bottom: 24 },
};

export const CHART_TOOLTIP = {
  contentStyle: {
    background: "#06261e",
    border: "1px solid rgba(45,212,168,.35)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "#e7f7f1", fontWeight: 700 },
  itemStyle: { color: "#9db6c7" },
};

export const CHART_GRID = {
  cartesian: {
    stroke: "rgba(127,199,175,0.12)",
    strokeDasharray: "3 3",
  },
  polar: {
    stroke: "rgba(127,199,175,0.12)",
  },
};

export const CHART_AXIS = {
  x: { tick: { fill: "#9db6c7", fontSize: 12 } },
  y: { tick: { fill: "#9db6c7", fontSize: 12 } },
  polarAngle: { tick: { fill: "#9db6c7", fontSize: 11 } },
  polarRadius: { tick: { fill: "#9db6c7", fontSize: 10 } },
};

export const CHART_AXES = {
  barCategory: 180,
};

export const CHART_LEGEND = {
  iconType: "circle",
  verticalAlign: "bottom",
  wrapperStyle: { color: "#9db6c7", fontSize: 12 },
};

export const CHART_COLORS = {
  primary: "#2dd4a8",
  secondary: "#86efac",
  accent: "#14b8a6",
  warning: "#fbbf24",
  danger: "#f87171",
  muted: "#64748b",
  palette: ["#2dd4a8", "#86efac", "#14b8a6", "#34d399", "#4ade80", "#0d9488", "#5eead4", "#6ee7b7"],
};

/* Height for horizontal bars with many rows: grows past the base height
   only once enough rows exist to require it. */
export function barChartHeight(count) {
  return count > 8 ? Math.max(CHART_HEIGHTS.barHorizontal, count * CHART_HEIGHTS.barRow) : CHART_HEIGHTS.barHorizontal;
}

/* Semantic color for completion percents — same thresholds everywhere. */
export function completionColor(percent) {
  if (percent == null) return CHART_COLORS.muted;
  if (percent >= 80) return CHART_COLORS.primary;
  if (percent >= 50) return CHART_COLORS.warning;
  return CHART_COLORS.danger;
}

/* Truncate long axis category names (presentation only; tooltips show full). */
export function shortAxisLabel(value, max = 24) {
  const s = String(value == null ? "" : value);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}