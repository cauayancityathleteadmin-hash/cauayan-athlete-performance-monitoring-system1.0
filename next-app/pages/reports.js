import Head from "next/head";
import Link from "next/link";
import React from "react";
import { getSession } from "next-auth/react";
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, Label,
} from "recharts";
import { prisma } from "../lib/prisma";
import { gsspData } from "../lib/gssp-cache";
import { loadReportData } from "../lib/report-data";
import AppShell from "../components/AppShell";
import PageSectionTabs from "../components/PageSectionTabs";
import ComplianceReport from "../components/reports/ComplianceReport";
import AccomplishmentsReport from "../components/reports/AccomplishmentsReport";
import EventWinnersReport from "../components/reports/EventWinnersReport";
import { AthleteReportCard, CoachReportCard } from "../components/reports/record-reports";
import { printScope } from "../lib/report-doc";
import { loadSignatoriesByType } from "../lib/signatories";
import { PERIOD_PRESETS, presetRange, periodText } from "../lib/period-presets";
import { formatDate, GENDER_LABEL, STATUS_LABEL, FITNESS_LABEL } from "../lib/report-labels";
import styles from "../styles/Dashboard.module.css";
import { CHART_HEIGHTS, CHART_MARGINS, CHART_TOOLTIP, CHART_GRID, CHART_AXIS, CHART_LEGEND, CHART_COLORS } from "../lib/chart-config";
import { classifyFitnessValue, TIER_META, CLASSIFICATION_TIERS } from "../lib/starter-metrics";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const isAdmin = session.user.role === "admin";

  let cacheKey = isAdmin ? "reports:a" : null;
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach) return { redirect: { destination: "/dashboard", permanent: false } };
    cacheKey = `reports:c:${coach.id}`;
  }

  const data = await gsspData(cacheKey, 30000, () => loadReportData({ isAdmin, userId: session.user.id }));

  // Signatory configuration is read on every request (not cached with the
  // report data) so an admin change shows up on the next generated report.
  const signatoriesByType = await loadSignatoriesByType();

  return {
    props: {
      session,
      isAdmin,
      ...data,
      signatoriesByType: JSON.parse(JSON.stringify(signatoriesByType)),
    },
  };
}

const ATH_SORT_COLS = {
  name: (a) => `${a.lastName}, ${a.firstName}`.toLowerCase(),
  code: (a) => a.athleteCode.toLowerCase(),
  sport: (a) => (a.sport || "").toLowerCase(),
  event: (a) => (a.event || "").toLowerCase(),
  coach: (a) => (a.coach || "").toLowerCase(),
  school: (a) => (a.school || "").toLowerCase(),
  status: (a) => (STATUS_LABEL[a.status] || a.status || "").toLowerCase(),
  registered: (a) => (a.dateRegistered || ""),
  assessments: (a) => a.assessmentCount,
};

const SUMMARY_FITNESS_META = {
  endurance: "Endurance",
  strength: "Strength",
  power: "Power",
  speed_agility: "Speed / Agility",
  skill_technique: "Skill / Technique",
  mobility: "Mobility",
  recovery: "Recovery",
  general: "General",
};

function shortDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function ratingTone(r) {
  if (r == null) return { color: CHART_COLORS.muted };
  if (r >= 8) return { color: "var(--accent)" };
  if (r >= 6) return { color: CHART_COLORS.warning };
  return { color: "var(--danger)" };
}

function PerformanceSummary({ athlete }) {
  const sorted = React.useMemo(() => [...athlete.trainingAssessments].sort((a, b) => new Date(a.dates) - new Date(b.dates)), [athlete.trainingAssessments]);
  const trendData = sorted.map((t) => ({ when: shortDate(t.dates), rating: t.rating }));
  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  const latestRating = latest ? latest.rating : null;
  const delta = first && latest ? latest.rating - first.rating : null;

  const fitnessSummary = React.useMemo(() => {
    const byDim = new Map();
    for (const t of sorted) {
      const key = t.fitness || "general";
      if (!byDim.has(key)) byDim.set(key, []);
      byDim.get(key).push(t.rating);
    }
    return [...byDim.entries()].map(([key, ratings]) => ({
      key,
      label: SUMMARY_FITNESS_META[key] || key,
      latest: ratings[ratings.length - 1],
      avg: Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10,
      first: ratings[0],
      last: ratings[ratings.length - 1],
    })).sort((a, b) => b.latest - a.latest);
  }, [sorted]);

  const radarData = fitnessSummary.map((d) => ({ fitness: d.label, value: d.latest }));

  const completion = athlete.completion || { planned: 0, done: 0, partial: 0, missed: 0, open: 0, percent: null };
  const completionStack = [{ name: "Plan", done: completion.done, partial: completion.partial, missed: completion.missed, open: completion.open }];
  const medals = (athlete.achievements || []).filter((a) => a.medal);
  const tone = ratingTone(latestRating);

  return (
    <section className={styles.panel} style={{ marginBottom: "var(--space-5)", pageBreakInside: "avoid" }}>
      <div className={styles.panelHeader}>
        <div><p className={styles.eyebrow}>1-page summary</p><h2>Performance Summary — {athlete.lastName}, {athlete.firstName}</h2></div>
        <span className={`${styles.badge} ${athlete.healthStatus === "healthy" ? styles.badgeActive : ["injured", "sick"].includes(athlete.healthStatus) ? styles.badgeRejected : styles.badgePending}`}>{String(athlete.healthStatus || "—").replace("_", " ")}</span>
      </div>

      <div className={styles.grid}>
        <div className={styles.detailPanel}>
          <h4>Latest training rating</h4>
          <div style={{ fontSize: 30, fontWeight: 800, color: tone.color }}>{latestRating != null ? `${latestRating}/10` : "—"}</div>
          <small style={{ color: "var(--muted)" }}>{sorted.length} assessment{sorted.length === 1 ? "" : "s"} on record</small>
        </div>
        <div className={styles.detailPanel}>
          <h4>Rating trend</h4>
          <div style={{ fontSize: 30, fontWeight: 800, color: delta > 0 ? "var(--accent)" : delta < 0 ? "var(--danger)" : "var(--muted)" }}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "→"} {delta != null ? Math.abs(delta) : "—"}
          </div>
          <small style={{ color: "var(--muted)" }}>{first && latest ? `${shortDate(first.dates)} → ${shortDate(latest.dates)}` : "Need 2+ assessments"}</small>
        </div>
        <div className={styles.detailPanel}>
          <h4>Plan completion rate</h4>
          <div style={{ fontSize: 30, fontWeight: 800, color: completion.percent == null ? "var(--muted)" : completion.percent >= 80 ? "var(--accent)" : completion.percent >= 50 ? "var(--warning)" : "var(--danger)" }}>
            {completion.percent != null ? `${completion.percent}%` : "—"}
          </div>
          <small style={{ color: "var(--muted)" }}>{completion.planned} planned activit{completion.planned === 1 ? "y" : "ies"}</small>
        </div>
        <div className={styles.detailPanel}>
          <h4>Medals</h4>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {medals.length ? medals.slice(0, 6).map((m, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700, textTransform: "capitalize", background: m.medal === "gold" ? "rgba(250,204,21,.16)" : m.medal === "silver" ? "rgba(203,213,225,.16)" : m.medal === "bronze" ? "rgba(217,119,6,.18)" : "rgba(66,135,99,.16)", color: m.medal === "gold" ? "#facc15" : m.medal === "silver" ? "#cbd5e1" : "var(--muted)" }}>
                {m.medal}
              </span>
            )) : <span style={{ color: "var(--muted)", fontSize: 14 }}>—</span>}
          </div>
          <small style={{ color: "var(--muted)" }}>{medals.length || 0} award{medals.length === 1 ? "" : "s"}</small>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.detailPanel}>
          <h4>Rating trend over time</h4>
          {trendData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={CHART_HEIGHTS.line}>
              <LineChart data={trendData} margin={CHART_MARGINS.line}>
                <CartesianGrid {...CHART_GRID.cartesian} />
                <XAxis dataKey="when" tick={CHART_AXIS.x}>
                  <Label value="Assessment date" position="insideBottom" dy={22} style={{ fill: CHART_AXIS.x.tick.fill, fontSize: 12 }} />
                </XAxis>
                <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={CHART_AXIS.y}>
                  <Label value="Rating (1–10)" angle={-90} position="insideLeft" offset={8} style={{ fill: CHART_AXIS.y.tick.fill, fontSize: 12 }} />
                </YAxis>
                <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`${v}/10`, "Rating"]} />
                <Line type="monotone" dataKey="rating" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ fill: CHART_COLORS.primary, r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>Not enough assessments to plot a trend yet.</p>}
        </div>

        <div className={styles.detailPanel}>
          <h4>Fitness balance <small style={{ color: "var(--muted)", fontWeight: 400 }}>(latest scores)</small></h4>
          {radarData.length ? (
            <ResponsiveContainer width="100%" height={CHART_HEIGHTS.radar}>
              <RadarChart data={radarData}>
                <PolarGrid {...CHART_GRID.polar} />
                <PolarAngleAxis dataKey="fitness" tick={CHART_AXIS.polarAngle} />
                <PolarRadiusAxis domain={[0, 10]} tick={CHART_AXIS.polarRadius} tickCount={5} />
                <Radar name="Score" dataKey="value" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.35} />
                <Tooltip {...CHART_TOOLTIP} formatter={(v) => [`${v}/10`, "Score"]} />
              </RadarChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>No training assessments for a fitness breakdown yet.</p>}
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.detailPanel}>
          <h4>Plan activity completion</h4>
          {completion.planned > 0 ? (
            <ResponsiveContainer width="100%" height={CHART_HEIGHTS.barStacked}>
              <BarChart data={completionStack} layout="vertical" margin={CHART_MARGINS.barHorizontal}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip {...CHART_TOOLTIP} formatter={(v, name) => [`${v} activities`, name]} cursor={{ fill: "rgba(45,212,168,0.08)" }} />
                <Bar dataKey="done" stackId="a" fill={CHART_COLORS.primary} name="Done" />
                <Bar dataKey="partial" stackId="a" fill={CHART_COLORS.warning} name="Partial" />
                <Bar dataKey="missed" stackId="a" fill={CHART_COLORS.danger} name="Missed" />
                <Bar dataKey="open" stackId="a" fill={CHART_COLORS.muted} name="Open" radius={[0, 4, 4, 0]} />
                <Legend {...CHART_LEGEND} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className={styles.empty}>No planned activities yet.</p>}
        </div>

        <div className={styles.detailPanel}>
          <h4>Before → now <small style={{ color: "var(--muted)", fontWeight: 400 }}>per fitness dimension</small></h4>
          {fitnessSummary.length ? (
            <div className={styles.infoList}>
              {fitnessSummary.map((d) => {
                const diff = d.last - d.first;
                const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "→";
                const cls = diff > 0 ? "var(--accent)" : diff < 0 ? "var(--danger)" : "var(--muted)";
                return (
                  <div key={d.key}>
                    <dt>{d.label}</dt>
                    <dd>
                      <span>{d.first} → {d.last}</span>
                      <span style={{ color: cls, marginLeft: 8 }}>{arrow} {Math.abs(diff)}</span>
                    </dd>
                  </div>
                );
              })}
            </div>
          ) : <p className={styles.empty}>No before/now comparison available yet.</p>}
        </div>
      </div>
    </section>
  );
}

function SquadFitnessBoard({ athletes }) {
  const [sport, setSport] = React.useState("all");
  const [sex, setSex] = React.useState("all");
  const [component, setComponent] = React.useState("all");

  // Only athletes that actually have a classified fitness profile count.
  const withProfile = React.useMemo(() => athletes.filter((a) => a.fitnessProfile && a.fitnessProfile.length), [athletes]);

  const sports = React.useMemo(() => {
    const set = new Set();
    for (const a of withProfile) if (a.sport) set.add(a.sport);
    return [...set].sort((x, y) => x.localeCompare(y));
  }, [withProfile]);

  const components = React.useMemo(() => {
    const set = new Set();
    for (const a of withProfile) for (const f of a.fitnessProfile) set.add(f.fitnessType);
    return [...set].sort((x, y) => (FITNESS_LABEL[x] || x).localeCompare(FITNESS_LABEL[y] || y));
  }, [withProfile]);

  // Flatten to one row per athlete × component test, then filter.
  const rows = React.useMemo(() => {
    const out = [];
    for (const a of withProfile) {
      if (sport !== "all" && a.sport !== sport) continue;
      if (sex !== "all" && a.gender !== sex) continue;
      for (const f of a.fitnessProfile) {
        if (component !== "all" && f.fitnessType !== component) continue;
        out.push({ athlete: a, f });
      }
    }
    // Best tier first, then by name — a simple, honest ranking within the view.
    return out.sort((x, y) => y.f.rank - x.f.rank || `${x.athlete.lastName}${x.athlete.firstName}`.localeCompare(`${y.athlete.lastName}${y.athlete.firstName}`));
  }, [withProfile, sport, sex, component]);

  // Tier distribution across the filtered rows (for the bar chart).
  const tierDist = React.useMemo(() => {
    const counts = {};
    for (const t of CLASSIFICATION_TIERS) counts[t] = 0;
    for (const r of rows) counts[r.f.tier] = (counts[r.f.tier] || 0) + 1;
    return CLASSIFICATION_TIERS.map((t) => ({ tier: t, label: TIER_META[t].label, count: counts[t], color: TIER_META[t].color }));
  }, [rows]);

  const tierDistData = tierDist.filter((t) => t.count > 0);

  return (
    <>
      <section className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Compare</p>
          <h2>Squad fitness board</h2>
          <p>Every logged fitness-component result from training-plan activities, classified with the DepEd PFT tier wording (Excellent / Very Good / Good / Fair / Needs Improvement) against Cauayan City reference bands — not a DepEd-published norm. Ranked best tier first within the current view.</p>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Filters</p><h2>View</h2></div></div>
        <div className={styles.toolbar} style={{ marginTop: "var(--space-4)", flexWrap: "wrap" }}>
          <label>Sport
            <select value={sport} onChange={(e) => setSport(e.target.value)}>
              <option value="all">All sports</option>
              {sports.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Sex
            <select value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="all">All</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label>Fitness component
            <select value={component} onChange={(e) => setComponent(e.target.value)}>
              <option value="all">All components</option>
              {components.map((c) => <option key={c} value={c}>{FITNESS_LABEL[c] || c}</option>)}
            </select>
          </label>
          {(sport !== "all" || sex !== "all" || component !== "all") && (
            <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={() => { setSport("all"); setSex("all"); setComponent("all"); }}>Clear filters</button>
          )}
        </div>
      </section>

      {withProfile.length === 0 ? (
        <section className={styles.panel}><p className={styles.empty}>No fitness-component results have been logged in training-plan activities yet. Coaches log these on an athlete&apos;s training plan; once results exist they appear here.</p></section>
      ) : (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Distribution</p><h2>Tier distribution</h2></div><span className={styles.badge}>{rows.length} result{rows.length === 1 ? "" : "s"}</span></div>
            {tierDistData.length ? (
              <ResponsiveContainer width="100%" height={CHART_HEIGHTS.barVertical}>
                <BarChart data={tierDistData} margin={CHART_MARGINS.barVertical}>
                  <CartesianGrid {...CHART_GRID.cartesian} />
                  <XAxis dataKey="label" tick={CHART_AXIS.x} interval={0} />
                  <YAxis allowDecimals={false} tick={CHART_AXIS.y}>
                    <Label value="Athletes" angle={-90} position="insideLeft" offset={8} style={{ fill: CHART_AXIS.y.tick.fill, fontSize: 12 }} />
                  </YAxis>
                  <Tooltip {...CHART_TOOLTIP} formatter={(v, _n, item) => [`${v} result${v === 1 ? "" : "s"}`, item?.payload?.label || "Tier"]} cursor={{ fill: "rgba(45,212,168,0.08)" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {tierDistData.map((t) => <Cell key={t.tier} fill={t.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className={styles.empty}>No results match the current filters.</p>}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Ranking</p><h2>Athletes by tier</h2></div></div>
            {rows.length ? (
              <div className={styles.reportTableScroll}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Athlete</th>
                      <th scope="col">Sport</th>
                      <th scope="col">Sex</th>
                      <th scope="col">Component</th>
                      <th scope="col">Latest result</th>
                      <th scope="col">Classification</th>
                      <th scope="col">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.athlete.id}-${r.f.fitnessType}-${i}`}>
                        <td><strong>{r.athlete.lastName}, {r.athlete.firstName}</strong> <span style={{ color: "var(--muted)" }}>{r.athlete.athleteCode}</span></td>
                        <td>{r.athlete.sport || "—"}</td>
                        <td>{GENDER_LABEL[r.athlete.gender] || r.athlete.gender || "—"}</td>
                        <td>{r.f.label}</td>
                        <td className={styles.numCell}>{r.f.value}{r.f.unit ? ` ${r.f.unit}` : ""}</td>
                        <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: TIER_META[r.f.tier]?.color || CHART_COLORS.muted, display: "inline-block" }} />{r.f.tierLabel}</span></td>
                        <td>{r.f.delta > 0 ? `▲ +${r.f.delta}` : r.f.delta < 0 ? `▼ ${r.f.delta}` : "→ 0"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className={styles.empty}>No results match the current filters.</p>}
          </section>
        </>
      )}
    </>
  );
}

export default function Reports({ session, isAdmin, athletes, coaches, signatoriesByType }) {
  const [type, setType] = React.useState("athlete");
  const [selected, setSelected] = React.useState([]);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [periodPreset, setPeriodPreset] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [finalizing, setFinalizing] = React.useState(false);
  const [finalizeResult, setFinalizeResult] = React.useState(null);

  const [sortKey, setSortKey] = React.useState("name");
  const [sortDir, setSortDir] = React.useState("asc");

  const [cSearch, setCSearch] = React.useState("");
  const [cSortKey, setCSortKey] = React.useState("name");
  const [cSortDir, setCSortDir] = React.useState("asc");

  // Facet filters on the records table. Empty string = "All".
  const [fSchool, setFSchool] = React.useState("");
  const [fStatus, setFStatus] = React.useState("");
  const [fSport, setFSport] = React.useState("");

  const list = type === "athlete" ? athletes : coaches;
  const SORT_COLS = type === "athlete" ? ATH_SORT_COLS : {
    name: (c) => `${c.lastName}, ${c.firstName}`.toLowerCase(),
    code: (c) => c.coachCode.toLowerCase(),
    sport: (c) => (c.sports && c.sports.join(", ").toLowerCase()),
    school: (c) => (c.school || "").toLowerCase(),
    assignments: (c) => c.athleteCount,
    registered: (c) => c.dateRegistered,
  };
  const sortKeyRef = type === "athlete" ? sortKey : cSortKey;
  const sortDirRef = type === "athlete" ? sortDir : cSortDir;
  const setSortKeyRef = type === "athlete" ? setSortKey : setCSortKey;
  const setSortDirRef = type === "athlete" ? setSortDir : setCSortDir;

  function toggle(id) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  function setSort(key) {
    if (sortKeyRef === key) setSortDirRef((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKeyRef(key);
      setSortDirRef("asc");
    }
  }

  function switchType(next) {
    setType(next);
    setSelected([]);
    setSearch("");
    setCSearch("");
    setFSchool("");
    setFStatus("");
    setFSport("");
  }

  // Period presets (Step 8): the preset sets From/To; editing a date is "custom".
  function applyPeriod(preset) {
    setPeriodPreset(preset);
    if (preset === "custom") return;
    const range = presetRange(preset);
    setFrom(range.from);
    setTo(range.to);
  }

  const query = (type === "athlete" ? search : cSearch).trim().toLowerCase();
  // Facet option lists come from the data actually present, so filters never
  // offer an empty result set.
  const facetValue = (item, kind) => {
    if (kind === "school") return (item.school || "").trim();
    if (kind === "status") return (item.status || "").trim();
    if (kind === "sport") return type === "athlete" ? (item.sport || "").trim() : (item.sports || []).join(", ").trim();
    return "";
  };
  const distinct = (kind) => [...new Set(list.map((item) => facetValue(item, kind)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const schoolOptions = distinct("school");
  const statusOptions = distinct("status");
  const sportOptions = distinct("sport");
  const visible = list
    .filter((item) => {
      if (fSchool && facetValue(item, "school") !== fSchool) return false;
      if (fStatus && facetValue(item, "status") !== fStatus) return false;
      if (fSport && !facetValue(item, "sport").split(", ").includes(fSport)) return false;
      const fields = type === "athlete"
        ? [item.lastName, item.firstName, item.athleteCode, item.sport, item.event, item.coach, item.school]
        : [item.lastName, item.firstName, item.coachCode, item.email, item.school, ...(item.sports || [])];
      return !query || fields.some((value) => (value || "").toLowerCase().includes(query));
    })
    .slice()
    .sort((x, y) => {
      const xv = SORT_COLS[sortKeyRef](x);
      const yv = SORT_COLS[sortKeyRef](y);
      const cmp = xv < yv ? -1 : xv > yv ? 1 : 0;
      return sortDirRef === "asc" ? cmp : -cmp;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((a) => selected.includes(a.id));

  function toggleVisible() {
    setSelected((current) => (allVisibleSelected ? current.filter((id) => !visible.some((a) => a.id === id)) : [...new Set([...current, ...visible.map((a) => a.id)])]));
  }

  const count = selected.length;
  const scrollRef = React.useRef(null);
  const filtered = list.filter((item) => selected.includes(item.id));
  const prefix = type === "athlete" ? "APR-" : "CPR-";

  // Freezes each selected record into an immutable ReportDocument. The server
  // rebuilds the snapshot from current data and stores the resolved signature
  // rows, so later edits can never rewrite the archived report.
  async function finalizeSelected() {
    if (!count || finalizing) return;
    setFinalizing(true);
    setFinalizeResult(null);
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const results = [];
      for (const item of filtered) {
        const response = await fetch("/api/reports/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
          body: JSON.stringify({ subjectType: type, subjectId: item.id, from, to }),
        }).catch(() => null);
        const body = response ? await response.json().catch(() => ({})) : {};
        results.push({
          ok: !!(response && response.ok && body.id),
          id: body.id || null,
          reference: body.reference || (type === "athlete" ? item.athleteCode : item.coachCode),
          error: body.error || (response ? null : "Network error."),
        });
      }
      setFinalizeResult(results);
    } finally {
      setFinalizing(false);
    }
  }

  function sortedHeader(key, label) {
    const active = sortKeyRef === key;
    return (
      <th scope="col" key={key}>
        <button type="button" className={`${styles.thBtn} ${active ? styles.thBtnActive : ""}`} onClick={() => setSort(key)}>
          {label}
          <span className={styles.thDir}>{active ? (sortDirRef === "asc" ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  }

const REPORTS_SECTIONS = [
    { label: "Records", sectionId: "records" },
    { label: "Squad fitness", sectionId: "squad-fitness" },
    { label: "Accomplishments", sectionId: "accomplishments" },
    { label: "Event winners", sectionId: "winners" },
    { label: "Compliance", sectionId: "compliance" },
  ];

  // Print scoping (see lib/report-doc.js + styles/report-print.css): the
  // default workspace printed by Ctrl+P is the personnel Records workspace.
  React.useEffect(() => {
    if (typeof document !== "undefined") document.body.dataset.printScope = "records";
  }, []);

  return (
    <>
      <Head><title>Official Reports | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Official & performance records" title="Official Reports" active="/reports">
        <PageSectionTabs sections={REPORTS_SECTIONS} defaultSection="records">
          <section id="records">
            <section className={styles.intro}><div><p className={styles.eyebrow}>Generate</p><h2>Official personnel records</h2><p>Select one or more records to produce a complete official personnel record covering registration, physical and health profile, performance records, training, daily training status, achievements, and event participation. {isAdmin ? "Generate reports for any athlete or coach." : "You can generate reports for the athletes assigned to you."}</p><p><Link href="/reports/archive">View finalized reports</Link></p></div></section>

            <section className={styles.panel}>
          {isAdmin && (
            <div className={styles.segmented} style={{ marginBottom: "var(--space-5)" }}>
              <button className={type === "athlete" ? styles.active : ""} aria-pressed={type === "athlete"} onClick={() => switchType("athlete")}>Athlete report</button>
              <button className={type === "coach" ? styles.active : ""} aria-pressed={type === "coach"} onClick={() => switchType("coach")}>Coach report</button>
            </div>
          )}

          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Selection</p><h2>{type === "athlete" ? "Athletes" : "Coaches"}</h2></div></div>

          <div style={{ marginTop: "var(--space-4)" }}>
            <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--muted)", marginBottom: 6 }}>
              Report period — {periodText(from, to)}
            </span>
            <div className={styles.segmented} style={{ flexWrap: "wrap" }}>
              {PERIOD_PRESETS.map((p) => (
                <button key={p.id} type="button" aria-pressed={periodPreset === p.id} className={periodPreset === p.id ? styles.active : ""} onClick={() => applyPeriod(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.toolbar} style={{ marginTop: "var(--space-4)" }}>
            <label>Search {type === "athlete" ? "athletes" : "coaches"}<input type="text" placeholder={type === "athlete" ? "Name, code, sport, event, coach, school…" : "Name, code, email, sport, school…"} value={type === "athlete" ? search : cSearch} onChange={(event) => (type === "athlete" ? setSearch(event.target.value) : setCSearch(event.target.value))} /></label>
            <label>From<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPeriodPreset("custom"); }} /></label>
            <label>To<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPeriodPreset("custom"); }} /></label>
            {count > 0 && <p className={styles.selectionSummary}>{count > 1 ? `${count} selected` : "1 selected"}<button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={() => setSelected([])}>Clear</button></p>}
<div className={styles.stackedActions}>
              <button className={styles.primary} disabled={!count} onClick={() => scrollRef.current?.scrollIntoView({ behavior: "smooth" })}>Show {count ? `${count} report${count > 1 ? "s" : ""}` : "reports"}</button>
              <button className={styles.secondary} disabled={!count} onClick={() => printScope("records")}>Print</button>
            </div>
          </div>

          {(schoolOptions.length > 0 || statusOptions.length > 0 || sportOptions.length > 0) && (
            <div style={{ marginTop: "var(--space-4)" }}>
              {schoolOptions.length > 0 && (
                <div style={{ marginBottom: "var(--space-3)" }}>
                  <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--muted)", marginBottom: 6 }}>School</span>
                  <div className={styles.segmented} style={{ flexWrap: "wrap" }}>
                    <button type="button" aria-pressed={fSchool === ""} className={fSchool === "" ? styles.active : ""} onClick={() => setFSchool("")}>All</button>
                    {schoolOptions.map((s) => (
                      <button key={s} type="button" aria-pressed={fSchool === s} className={fSchool === s ? styles.active : ""} onClick={() => setFSchool(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {statusOptions.length > 0 && (
                <div style={{ marginBottom: "var(--space-3)" }}>
                  <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--muted)", marginBottom: 6 }}>Status</span>
                  <div className={styles.segmented} style={{ flexWrap: "wrap" }}>
                    <button type="button" aria-pressed={fStatus === ""} className={fStatus === "" ? styles.active : ""} onClick={() => setFStatus("")}>All</button>
                    {statusOptions.map((s) => (
                      <button key={s} type="button" aria-pressed={fStatus === s} className={fStatus === s ? styles.active : ""} onClick={() => setFStatus(s)}>{STATUS_LABEL[s] || s}</button>
                    ))}
                  </div>
                </div>
              )}
              {sportOptions.length > 0 && (
                <div>
                  <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--muted)", marginBottom: 6 }}>Sport</span>
                  <div className={styles.segmented} style={{ flexWrap: "wrap" }}>
                    <button type="button" aria-pressed={fSport === ""} className={fSport === "" ? styles.active : ""} onClick={() => setFSport("")}>All</button>
                    {sportOptions.map((s) => (
                      <button key={s} type="button" aria-pressed={fSport === s} className={fSport === s ? styles.active : ""} onClick={() => setFSport(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
        </section>
        <section id="table">
          {list.length ? (
            <div className={styles.reportTableScroll}>
              <table>
                <thead>
                  <tr>
                    <th scope="col" className={styles.checkCell}><input type="checkbox" style={{ width: 16, height: 16, accentColor: "var(--accent)" }} checked={allVisibleSelected} onChange={toggleVisible} disabled={!visible.length} /></th>
                    {type === "athlete" ? (
                      <>
                        {sortedHeader("name", "Athlete")}
                        {sortedHeader("code", "Code")}
                        {sortedHeader("sport", "Sport")}
                        {sortedHeader("event", "Event")}
                        {sortedHeader("coach", "Coach")}
                        {sortedHeader("school", "School")}
                        {sortedHeader("status", "Status")}
                        {sortedHeader("assessments", "Assessments")}
                      </>
                    ) : (
                      <>
                        {sortedHeader("name", "Coach")}
                        {sortedHeader("code", "Code")}
                        {sortedHeader("sport", "Sports")}
                        {sortedHeader("school", "School")}
                        {sortedHeader("assignments", "Athletes")}
                        {sortedHeader("registered", "Registered")}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id} className={selected.includes(item.id) ? styles.rowSelected : undefined}>
                      <td className={styles.checkCell}><input type="checkbox" style={{ width: 16, height: 16, accentColor: "var(--accent)" }} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td>
                      {type === "athlete" ? (
                        <>
                          <td><strong>{item.lastName}, {item.firstName}</strong>{item.middleName ? ` ${item.middleName}` : ""}</td>
                          <td>{item.athleteCode}</td>
                          <td>{item.sport}</td>
                          <td>{item.event || "—"}</td>
                          <td>{item.coach || "—"}</td>
                          <td>{item.school || "—"}</td>
                          <td>{STATUS_LABEL[item.status] || item.status}</td>
                          <td className={styles.numCell}><span className={styles.countBadge}>{item.assessmentCount}</span></td>
                        </>
                      ) : (
                        <>
                          <td><strong>{item.lastName}, {item.firstName}</strong>{item.middleName ? ` ${item.middleName}` : ""}</td>
                          <td>{item.coachCode}</td>
                          <td>{item.sports && item.sports.length ? item.sports.join(", ") : "—"}</td>
                          <td>{item.school || "—"}</td>
                          <td className={styles.numCell}><span className={styles.countBadge}>{item.athleteCount}</span></td>
                          <td>{formatDate(item.dateRegistered)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {!visible.length && <tr><td colSpan={type === "athlete" ? 9 : 7} className={styles.empty}>No records match your search.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : <p className={styles.empty}>No {type === "athlete" ? "athletes" : "coaches"} found.</p>}
        </section>
        <section id="reports">
          <div ref={scrollRef} />
          <div id="report-workspace">
            {type === "athlete"
              ? filtered.map((athlete) => (
                  <React.Fragment key={athlete.id}>
                    <PerformanceSummary athlete={athlete} />
                    <AthleteReportCard athlete={athlete} session={session} from={from} to={to} prefix={prefix} signatories={signatoriesByType?.athlete_record} />
                  </React.Fragment>
                ))
              : filtered.map((coach) => <CoachReportCard key={coach.id} coach={coach} session={session} from={from} to={to} prefix={prefix} signatories={signatoriesByType?.coach_record} />)}
          </div>
          {filtered.length > 0 && (
            <div className={styles.stackedActions}>
              <button className={styles.primary} type="button" onClick={finalizeSelected} disabled={finalizing}>
                {finalizing ? "Finalizing…" : `Finalize & archive (${count})`}
              </button>
              <button className={styles.secondary} type="button" onClick={() => printScope("records")}>Print all reports</button>
            </div>
          )}
          {finalizeResult && (
            <div className={styles.selectionSummary} role="status">
              <span>{finalizeResult.filter((r) => r.ok).length} of {finalizeResult.length} archived. </span>
              {finalizeResult.map((r, i) => (
                r.ok
                  ? <Link key={i} href={`/reports/archive/${r.id}`} style={{ marginRight: "var(--space-3)" }}>{r.reference}</Link>
                  : <span key={i} style={{ marginRight: "var(--space-3)" }}>{r.reference}: {r.error}</span>
              ))}
              <Link href="/reports/archive">Open archive</Link>
            </div>
          )}
        </section>
        <section id="squad-fitness">
          <SquadFitnessBoard athletes={athletes} />
        </section>
        <AccomplishmentsReport session={session} isAdmin={isAdmin} signatories={signatoriesByType?.accomplishments} />
        <EventWinnersReport session={session} isAdmin={isAdmin} signatories={signatoriesByType?.event_winners} />
        <ComplianceReport session={session} isAdmin={isAdmin} signatories={signatoriesByType?.compliance} />
      </PageSectionTabs>
      </AppShell>
    </>
  );
}
