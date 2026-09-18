export const CHART_HEIGHTS = {
  line: 240,
  barVertical: 240,
  barHorizontal: 280,
  radar: 240,
  pie: 280,
  small: 90,
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

export const CHART_COLORS = {
  primary: "#2dd4a8",
  secondary: "#86efac",
  accent: "#14b8a6",
  warning: "#fbbf24",
  danger: "#f87171",
  muted: "#64748b",
  palette: ["#2dd4a8", "#86efac", "#14b8a6", "#34d399", "#4ade80", "#0d9488", "#5eead4", "#6ee7b7"],
};

export function getEmptyState(message = "No data available") {
  return <p className="chart-empty" style={{ textAlign: "center", padding: "var(--space-6)", color: "var(--muted)" }}>{message}</p>;
}