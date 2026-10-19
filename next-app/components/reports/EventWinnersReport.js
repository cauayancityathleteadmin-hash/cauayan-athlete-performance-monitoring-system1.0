import React from "react";
import { printScope, reportDate, ReportHeader, ReportSignatures, ReportFooter, RdSection } from "../../lib/report-doc";
import useLazyReport, { fetchJson } from "./useLazyReport";
import styles from "../../styles/Dashboard.module.css";
import { MEDAL_ORDER } from "../../lib/points";

const MEDAL_LABEL = { gold: "Gold", silver: "Silver", bronze: "Bronze", fourth: "4th", participation: "Participation" };
const LEVEL_LABEL = { intramural: "Intramural", barangay: "Barangay", city: "City", provincial: "Provincial", regional: "Regional", national: "National", international: "International" };
const STATUS_LABEL = { draft: "Draft", open: "Open", closed: "Closed", cancelled: "Cancelled" };

function fmtDay(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function roman(n) {
  const map = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [value, sym] of map) {
    while (n >= value) { out += sym; n -= value; }
  }
  return out || "I";
}

export default function EventWinnersReport({ session, isAdmin }) {
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState(null);
  const [results, setResults] = React.useState(null);
  const [resultsError, setResultsError] = React.useState(null);
  const [resultsLoading, setResultsLoading] = React.useState(false);
  const pickTokenRef = React.useRef(0);

  const { ref, status, data, error, load } = useLazyReport(() => fetchJson("/api/reports/event-winners"));

  const meets = data?.meets || [];
  const q = search.trim().toLowerCase();
  const visibleMeets = q
    ? meets.filter((m) => m.eventName.toLowerCase().includes(q) || (m.venue || "").toLowerCase().includes(q))
    : meets;

  async function pick(meet) {
    const token = ++pickTokenRef.current;
    setSelected(meet);
    setResults(null);
    setResultsError(null);
    setResultsLoading(true);
    try {
      const d = await fetchJson(`/api/reports/event-winners?eventPlanId=${meet.id}`);
      if (token !== pickTokenRef.current) return;
      setResults(d);
      setResultsLoading(false);
    } catch (e) {
      if (token !== pickTokenRef.current) return;
      setResultsError(e?.message || "Failed to load results.");
      setResultsLoading(false);
    }
  }

  const ready = !!results;
  const ref_no = ready ? `EWR-${String(results.plan.id).padStart(4, "0")}` : "EWR";

  return (
    <section id="winners" ref={ref}>
      <section className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Event winners</p>
          <h2>Event winners report</h2>
          <p>
            Official results of a single meet — medal winners per sport and discipline, records set,
            and the school delegation tally. Pick a meet below. {isAdmin ? "" : "Draft events are not shown."}
          </p>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader} style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <div><p className={styles.eyebrow}>Meets</p><h2>{selected ? selected.eventName : "Pick a meet"}</h2></div>
          <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={() => printScope("winners")} disabled={!ready}>
            Print report
          </button>
        </div>

        <div className={styles.toolbar} style={{ marginTop: "var(--space-4)" }}>
          <label>Search meets
            <input type="search" placeholder="Event name or venue…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>

        {status === "idle" && <p className={styles.empty}>Loading meets…</p>}
        {status === "loading" && <p className={styles.empty}>Loading meets…</p>}
        {status === "error" && (
          <p className={styles.empty} role="alert">
            {error} <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={load}>Retry</button>
          </p>
        )}
        {status === "ready" && (
          visibleMeets.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
              {visibleMeets.map((m) => {
                const active = selected?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pick(m)}
                    className={styles.detailPanel}
                    style={{
                      textAlign: "left",
                      cursor: "pointer",
                      borderColor: active ? "var(--accent)" : undefined,
                      background: active ? "rgba(45,212,168,.08)" : undefined,
                    }}
                    aria-pressed={active}
                  >
                    <strong style={{ display: "block", fontSize: 14 }}>{m.eventName}</strong>
                    <small style={{ display: "block", color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{fmtDay(m.startDate)}{m.venue ? ` · ${m.venue}` : ""}</small>
                    <span style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ padding: "2px 8px", borderRadius: "var(--radius-xl)", background: "rgba(6,38,30,.35)", border: "1px solid var(--border)", fontSize: 11, fontWeight: 700, textTransform: "capitalize" }}>{STATUS_LABEL[m.status] || m.status}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>{m.winners} winner{m.winners === 1 ? "" : "s"}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{m.participants} athletes</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className={styles.empty}>No meets match your search.</p>
          )
        )}

        {resultsLoading && <p className={styles.empty} style={{ marginTop: "var(--space-4)" }}>Loading results…</p>}
        {resultsError && (
          <p className={styles.empty} role="alert" style={{ marginTop: "var(--space-4)" }}>
            {resultsError}
          </p>
        )}
        {!resultsLoading && !results && !resultsError && status === "ready" && (
          <p className={styles.empty} style={{ marginTop: "var(--space-4)" }}>Select a meet to view its official results.</p>
        )}
      </section>

      {ready && (
        <div id="ws-winners" className="print-workspace">
          <article className="report-doc">
            <ReportHeader title="Event Winners and Official Results" reference={ref_no} />

            <RdSection num="I." title="Event details">
              <table className="rd-info">
                <tbody>
                  <tr>
                    <th>Event</th>
                    <td colSpan="3">{results.plan.eventName}</td>
                  </tr>
                  <tr>
                    <th>Venue</th>
                    <td>{results.plan.venue || "—"}</td>
                    <th>Status</th>
                    <td style={{ textTransform: "capitalize" }}>{STATUS_LABEL[results.plan.status] || results.plan.status}</td>
                  </tr>
                  <tr>
                    <th>Schedule</th>
                    <td>{fmtDay(results.plan.startDate)}{results.plan.endDate && results.plan.endDate !== results.plan.startDate ? ` — ${fmtDay(results.plan.endDate)}` : ""}</td>
                    <th>Total entries</th>
                    <td>{results.summary.entries} across {results.summary.sports} sport(s)</td>
                  </tr>
                  <tr>
                    <th>Records set</th>
                    <td>{results.summary.records}</td>
                    <th>Schools represented</th>
                    <td>{results.summary.delegations}</td>
                  </tr>
                </tbody>
              </table>
            </RdSection>

            {results.groups.map((g, i) => (
              <RdSection key={g.sport} num={`${roman(i + 1)}.`} title={g.sport} meta={`${g.entries.length} result(s)`}>
                <table className="rd-results">
                  <thead>
                    <tr>
                      <th className="num">#</th><th>Athlete</th><th>Code</th><th>School</th>
                      <th>Discipline</th><th>Medal</th><th>Level</th>
                      <th className="num">Points</th><th>Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.entries.map((e, j) => (
                      <tr key={e.achievementId}>
                        <td className="num">{j + 1}</td>
                        <td>{e.athlete}</td>
                        <td>{e.athleteCode}</td>
                        <td>{e.school || "—"}</td>
                        <td>{e.discipline || "—"}</td>
                        <td>{e.medal ? MEDAL_LABEL[e.medal] || e.medal : "—"}</td>
                        <td>{e.level ? LEVEL_LABEL[e.level] || e.level : "—"}</td>
                        <td className="num">{e.points}</td>
                        <td>{e.isRecord ? "RECORD" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </RdSection>
            ))}

            {!results.groups.length && (
              <RdSection num="II." title="Results">
                <p className="rd-empty">No achievement results are linked to this event yet.</p>
              </RdSection>
            )}

            <RdSection num={`${roman((results.groups.length || 1) + 2)}.`} title="School delegation tally">
              <table className="rd-results">
                <thead>
                  <tr>
                    <th>School</th>
                    {MEDAL_ORDER.map((m) => <th key={m} className="num">{MEDAL_LABEL[m]}</th>)}
                    <th className="num">Total</th><th className="num">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {results.tally.map((t) => (
                    <tr key={t.school}>
                      <td>{t.school}</td>
                      {MEDAL_ORDER.map((m) => <td key={m} className="num">{t[m] || 0}</td>)}
                      <td className="num">{t.total}</td>
                      <td className="num">{t.points}</td>
                    </tr>
                  ))}
                  {!results.tally.length && <tr><td colSpan={MEDAL_ORDER.length + 3} className="rd-empty">No delegations recorded.</td></tr>}
                </tbody>
              </table>
            </RdSection>

            <ReportSignatures
              session={session}
              certification="This is to certify that the event results, medal winners, records, and school delegation tally reported herein reflect the official results of the above-stated event, as officially recorded and maintained in the database of the City Sports Development Office of the City Government of Cauayan, Isabela."
            />
            <ReportFooter session={session} note={`${results.plan.eventName} · ${results.summary.entries} entries · ${results.summary.delegations} school(s) · Records: ${results.summary.records}`} />
          </article>
        </div>
      )}
    </section>
  );
}
