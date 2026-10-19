import React from "react";
import { printScope, reportDate, ReportHeader, ReportSignatures, ReportFooter, RdSection } from "../../lib/report-doc";
import useLazyReport, { fetchJson } from "./useLazyReport";
import styles from "../../styles/Dashboard.module.css";
import { MEDAL_ORDER } from "../../lib/points";
import { PERIOD_PRESETS, presetRange, periodText } from "../../lib/period-presets";

const MEDAL_LABEL = { gold: "Gold", silver: "Silver", bronze: "Bronze", fourth: "4th", participation: "Participation" };
const LEVEL_LABEL = { intramural: "Intramural", barangay: "Barangay", city: "City", provincial: "Provincial", regional: "Regional", national: "National", international: "International" };

const periodLabel = periodText;

export default function AccomplishmentsReport({ session, isAdmin }) {
  const [preset, setPreset] = React.useState("sy");
  const [customFrom, setCustomFrom] = React.useState("");
  const [customTo, setCustomTo] = React.useState("");

  const range = preset === "custom" ? { from: customFrom, to: customTo } : presetRange(preset);
  const qs = React.useMemo(() => {
    const p = new URLSearchParams();
    if (range.from) p.set("from", range.from);
    if (range.to) p.set("to", range.to);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [range.from, range.to]);

  const { ref, status, data, error, load, statusRef } = useLazyReport(
    () => fetchJson(`/api/reports/accomplishments${qs}`)
  );

  React.useEffect(() => {
    if (statusRef.current !== "idle") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  const ready = status === "ready" && data;
  const ref_no = ready
    ? `ACR-${(data.period.from || "ALL").replace(/-/g, "")}${data.period.to ? `-${data.period.to.replace(/-/g, "")}` : ""}`
    : "ACR";
  const medals = ready ? data.medalTally : null;

  return (
    <section id="accomplishments" ref={ref}>
      <section className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Accomplishments</p>
          <h2>Accomplishments report</h2>
          <p>
            Period summary of registered achievements — medal and level tallies, per-sport points,
            top athletes, records, meets held, and registrations. {isAdmin ? "Covers all registered athletes." : "Covers your assigned athletes."} Computed server-side with the same points engine as Standing.
          </p>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader} style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <div><p className={styles.eyebrow}>Period</p><h2>{periodLabel(range.from, range.to)}</h2></div>
          <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={() => printScope("accomplishments")} disabled={!ready}>
            Print report
          </button>
        </div>

        <div style={{ marginTop: "var(--space-4)" }}>
          <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--muted)", marginBottom: 6 }}>Report period</span>
          <div className={styles.segmented} style={{ flexWrap: "wrap" }}>
            {PERIOD_PRESETS.map((p) => (
              <button key={p.id} type="button" aria-pressed={preset === p.id} className={preset === p.id ? styles.active : ""} onClick={() => setPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>

          {preset === "custom" && (
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginTop: "var(--space-4)" }}>
              <label style={{ flex: "1 1 160px" }}>From<input type="date" className={styles.fieldControl} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></label>
              <label style={{ flex: "1 1 160px" }}>To<input type="date" className={styles.fieldControl} value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></label>
            </div>
          )}

          <div style={{ marginTop: "var(--space-4)" }}>
            {status === "idle" && <p className={styles.empty}>Loading report…</p>}
            {status === "loading" && <p className={styles.empty}>Refreshing…</p>}
            {status === "error" && (
              <p className={styles.empty} role="alert">
                {error} <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={load}>Retry</button>
              </p>
            )}
            {ready && (
              <div className={styles.statRow} style={{ marginBottom: 0 }}>
                <div className={styles.stat}><strong>{data.counts.achievements}</strong><small>Achievements</small></div>
                <div className={styles.stat}><strong>{data.counts.points}</strong><small>Points</small></div>
                <div className={styles.stat}><strong>{data.counts.athletesWithAchievements}</strong><small>Athletes scored</small></div>
                <div className={styles.stat}><strong>{data.counts.meetsHeld}</strong><small>Meets in period</small></div>
                <div className={styles.stat}><strong>{data.counts.assessments}</strong><small>Assessments</small></div>
              </div>
            )}
          </div>
        </div>
      </section>

      {ready && (
        <div id="ws-accomplishments" className="print-workspace">
          <article className="report-doc">
            <ReportHeader title="Athletic Accomplishments Report" reference={ref_no} />

            <RdSection num="I." title="Report coverage">
              <table className="rd-info">
                <tbody>
                  <tr>
                    <th>Period</th>
                    <td>{periodLabel(data.period.from, data.period.to)}</td>
                    <th>Scope</th>
                    <td>{data.scope === "all" ? "All registered athletes" : "Athletes assigned to the reporting coach"}</td>
                  </tr>
                  <tr>
                    <th>Achievements</th>
                    <td>{data.counts.achievements} ({data.counts.points} points)</td>
                    <th>Athletes scoring</th>
                    <td>{data.counts.athletesWithAchievements} of {data.counts.athletesInScope}</td>
                  </tr>
                  <tr>
                    <th>Schools / Sports</th>
                    <td>{data.counts.schools} / {data.counts.sports}</td>
                    <th>Meets held</th>
                    <td>{data.counts.meetsHeld}</td>
                  </tr>
                  <tr>
                    <th>Athletes registered</th>
                    <td>{data.counts.athletesRegistered === null ? "All-time (no period filter)" : data.counts.athletesRegistered}</td>
                    <th>Assessments logged</th>
                    <td>{data.counts.assessments}</td>
                  </tr>
                </tbody>
              </table>
            </RdSection>

            <RdSection num="II." title="Medal and level tally">
              <table className="rd-results">
                <thead>
                  <tr>
                    <th>Tally</th>
                    {MEDAL_ORDER.map((m) => <th key={m} className="num">{MEDAL_LABEL[m]}</th>)}
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Medals / placements</td>
                    {MEDAL_ORDER.map((m) => <td key={m} className="num">{medals[m] || 0}</td>)}
                    <td className="num">{MEDAL_ORDER.reduce((n, m) => n + (medals[m] || 0), 0)}</td>
                  </tr>
                </tbody>
              </table>
              <table className="rd-results" style={{ marginTop: "12px" }}>
                <thead><tr><th>Level</th><th className="num">Achievements</th></tr></thead>
                <tbody>
                  {Object.keys(LEVEL_LABEL).filter((l) => data.levelTally[l]).map((l) => (
                    <tr key={l}><td>{LEVEL_LABEL[l]}</td><td className="num">{data.levelTally[l]}</td></tr>
                  ))}
                  {!Object.keys(data.levelTally).length && <tr><td colSpan="2" className="rd-empty">No achievements in the selected period.</td></tr>}
                </tbody>
              </table>
            </RdSection>

            <RdSection num="III." title="By sport">
              <table className="rd-results">
                <thead>
                  <tr>
                    <th>Sport</th><th className="num">Achievements</th>
                    <th className="num">Gold</th><th className="num">Silver</th><th className="num">Bronze</th>
                    <th className="num">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sportTally.map((s) => (
                    <tr key={s.sport}>
                      <td>{s.sport}</td>
                      <td className="num">{s.count}</td>
                      <td className="num">{s.medals.gold}</td>
                      <td className="num">{s.medals.silver}</td>
                      <td className="num">{s.medals.bronze}</td>
                      <td className="num">{s.points}</td>
                    </tr>
                  ))}
                  {!data.sportTally.length && <tr><td colSpan="6" className="rd-empty">No achievements in the selected period.</td></tr>}
                </tbody>
              </table>
            </RdSection>

            <RdSection num="IV." title="Top athletes by points" meta="top 15">
              <table className="rd-results">
                <thead>
                  <tr>
                    <th className="num">Rank</th><th>Athlete</th><th>Code</th><th>School</th>
                    <th className="num">G</th><th className="num">S</th><th className="num">B</th>
                    <th className="num">Achv.</th><th className="num">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topAthletes.map((a, i) => (
                    <tr key={a.athleteId}>
                      <td className="num">{i + 1}</td>
                      <td>{a.name}</td>
                      <td>{a.athleteCode}</td>
                      <td>{a.school || "—"}</td>
                      <td className="num">{a.medals.gold}</td>
                      <td className="num">{a.medals.silver}</td>
                      <td className="num">{a.medals.bronze}</td>
                      <td className="num">{a.count}</td>
                      <td className="num">{a.points}</td>
                    </tr>
                  ))}
                  {!data.topAthletes.length && <tr><td colSpan="9" className="rd-empty">No scored achievements in the selected period.</td></tr>}
                </tbody>
              </table>
            </RdSection>

            <RdSection num="V." title="Records set in period" meta={`${data.records.length} record(s)`}>
              <table className="rd-results">
                <thead><tr><th>Record</th><th>Athlete</th><th>Code</th><th>Sport</th><th>Level</th><th>Date</th></tr></thead>
                <tbody>
                  {data.records.map((r, i) => (
                    <tr key={i}>
                      <td>{r.title}</td><td>{r.athlete}</td><td>{r.athleteCode}</td>
                      <td>{r.sport || "—"}</td><td>{r.level ? LEVEL_LABEL[r.level] || r.level : "—"}</td><td>{reportDate(r.date)}</td>
                    </tr>
                  ))}
                  {!data.records.length && <tr><td colSpan="6" className="rd-empty">No records recorded in the selected period.</td></tr>}
                </tbody>
              </table>
            </RdSection>

            <RdSection num="VI." title="Meets in period" meta={`${data.meets.length} meet(s)`}>
              <table className="rd-results">
                <thead><tr><th>Event</th><th>Date</th><th>Venue</th><th>Status</th></tr></thead>
                <tbody>
                  {data.meets.slice(0, 40).map((m) => (
                    <tr key={m.id}>
                      <td>{m.eventName}</td>
                      <td>{reportDate(m.startDate)}</td>
                      <td>{m.venue || "—"}</td>
                      <td style={{ textTransform: "capitalize" }}>{m.status}</td>
                    </tr>
                  ))}
                  {!data.meets.length && <tr><td colSpan="4" className="rd-empty">No meets within the selected period.</td></tr>}
                </tbody>
              </table>
            </RdSection>

            <ReportSignatures
              session={session}
              certification="This is to certify that the athletic accomplishments, medal tallies, points, and records reported herein were computed from the official achievement records of the City Sports Development Office of the City Government of Cauayan, Isabela, using the office's standard points system, and are true and correct to the best of our knowledge."
            />
            <ReportFooter session={session} note={`Period: ${periodLabel(data.period.from, data.period.to)} · Achievements: ${data.counts.achievements} · Points: ${data.counts.points}`} />
          </article>
        </div>
      )}
    </section>
  );
}
