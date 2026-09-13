import styles from "../styles/Dashboard.module.css";

export const PALETTE = ["#2dd4a8", "#86efac", "#14b8a6", "#34d399", "#4ade80", "#0d9488", "#5eead4", "#6ee7b7", "#a7f3d0", "#059669"];

export function HBars({ data, colors = PALETTE, axisLabel = "", axisValue = "" }) {
  const list = data || [];
  const max = Math.max(...list.map((d) => d.value), 1);
  return (
    <div className={styles.hbars}>
      {axisLabel && <div className={styles.hbarsAxis}><span>{axisLabel}</span><span>{axisValue}</span></div>}
      {list.map((d, i) => (
        <div className={styles.hbarRow} key={`${d.label}-${i}`}>
          <div className={styles.hbarLabel}><span>{d.label}</span><small>{d.value}</small></div>
          <div className={styles.hbarTrack}><div className={styles.hbarFill} style={{ width: `${(d.value / max) * 100}%`, background: colors[i % colors.length] }} /></div>
        </div>
      ))}
    </div>
  );
}

function buildArcs(segments, total, circumference) {
  const arcs = [];
  let cumulative = 0;
  for (const d of segments) {
    const len = (d.value / total) * circumference;
    arcs.push({ key: d.label, color: d.color, len, start: -cumulative });
    cumulative += len;
  }
  return arcs;
}

export function Donut({ segments, colors = PALETTE, size = 150, thickness = 22, label = "total", ariaLabel = "Chart" }) {
  const list = segments || [];
  const total = list.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className={styles.empty}>No data yet.</p>;
  const r = (size - thickness) / 2;
  const center = size / 2;
  const circumference = Math.PI * 2 * r;
  const colored = list.map((d, i) => ({ ...d, color: d.color || colors[i % colors.length] }));
  const arcs = buildArcs(colored, total, circumference);
  return (
    <div className={styles.donutWrap}>
      <div className={styles.donutSvgWrap}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
          <title>{ariaLabel}</title>
          <circle cx={center} cy={center} r={r} fill="none" stroke="#1a5c4a" strokeWidth={thickness} />
          {arcs.map((arc) => (
            <circle key={arc.key} cx={center} cy={center} r={r} fill="none" stroke={arc.color} strokeWidth={thickness} strokeDasharray={`${arc.len} ${circumference - arc.len}`} strokeDashoffset={arc.start} transform={`rotate(-90 ${center} ${center})`} />
          ))}
        </svg>
        <div className={styles.donutCenter}><strong>{total}</strong><small>{label}</small></div>
      </div>
      <div className={styles.donutLegend}>
        {colored.map((d) => <span key={d.label}><i style={{ background: d.color }} />{d.label} <strong>{d.value}</strong></span>)}
      </div>
    </div>
  );
}

export function KPI({ label, value, sub }) {
  return (
    <div className={styles.kpi}><strong>{value}</strong><span>{label}</span>{sub ? <small>{sub}</small> : null}</div>
  );
}