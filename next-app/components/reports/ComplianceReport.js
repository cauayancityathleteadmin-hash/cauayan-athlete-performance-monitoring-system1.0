import React from "react";
import { printScope, reportDate, ReportHeader, ReportSignatures, ReportFooter, RdSection } from "../../lib/report-doc";
import useLazyReport, { fetchJson } from "./useLazyReport";
import styles from "../../styles/Dashboard.module.css";

function ChipRow({ label, options, value, onChange, allLabel }) {
  if (!options || options.length <= 1) return null;
  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--muted)", marginBottom: 6 }}>{label}</span>
      <div className={styles.segmented} style={{ flexWrap: "wrap" }}>
        <button type="button" aria-pressed={value === ""} className={value === "" ? styles.active : ""} onClick={() => onChange("")}>{allLabel}</button>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === String(o.id)}
            className={value === String(o.id) ? styles.active : ""}
            onClick={() => onChange(value === String(o.id) ? "" : String(o.id))}
          >
            {o.schoolName || o.sportName}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ComplianceReport({ session, isAdmin }) {
  const [schoolId, setSchoolId] = React.useState("");
  const [sportId, setSportId] = React.useState("");
  const [incomplete, setIncomplete] = React.useState(false);

  const qs = React.useMemo(() => {
    const p = new URLSearchParams();
    if (schoolId) p.set("schoolId", schoolId);
    if (sportId) p.set("sportId", sportId);
    if (incomplete) p.set("incomplete", "1");
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [schoolId, sportId, incomplete]);

  const { ref, status, data, error, load, statusRef } = useLazyReport(
    () => fetchJson(`/api/reports/document-compliance${qs}`)
  );

  // Re-run when filters change, but only after the first (visible-triggered) load.
  React.useEffect(() => {
    if (statusRef.current !== "idle") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  const ready = status === "ready" && data;
  const ref_no = ready
    ? `DCR-${String(data.generatedAt).slice(0, 10).replace(/-/g, "")}-${data.rows.length}`
    : "DCR";

  return (
    <section id="compliance" ref={ref}>
      <section className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Compliance</p>
          <h2>Document compliance report</h2>
          <p>
            Required-document status per athlete — valid uploads, missing, expiring soon, and expired.
            {isAdmin ? " Covers all registered athletes." : " Covers the athletes assigned to you."}
          </p>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader} style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <div><p className={styles.eyebrow}>Filters</p><h2>Scope</h2></div>
          <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={() => printScope("compliance")} disabled={!ready}>
            Print report
          </button>
        </div>

        <div style={{ marginTop: "var(--space-4)" }}>
          <ChipRow label="School" options={data?.filters?.schools} value={schoolId} onChange={setSchoolId} allLabel="All schools" />
          <ChipRow label="Sport" options={data?.filters?.sports} value={sportId} onChange={setSportId} allLabel="All sports" />
          <div style={{ marginBottom: "var(--space-4)" }}>
            <span style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--muted)", marginBottom: 6 }}>Show</span>
            <div className={styles.segmented} style={{ flexWrap: "wrap" }}>
              <button type="button" aria-pressed={!incomplete} className={!incomplete ? styles.active : ""} onClick={() => setIncomplete(false)}>All athletes</button>
              <button type="button" aria-pressed={incomplete} className={incomplete ? styles.active : ""} onClick={() => setIncomplete(true)}>Incomplete only</button>
            </div>
          </div>

          {status === "idle" && <p className={styles.empty}>Loading report…</p>}
          {status === "loading" && <p className={styles.empty}>Refreshing…</p>}
          {status === "error" && (
            <p className={styles.empty} role="alert">
              {error} <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={load}>Retry</button>
            </p>
          )}
          {ready && (
            <div className={styles.statRow} style={{ marginBottom: 0 }}>
              <div className={styles.stat}><strong>{data.summary.athletes}</strong><small>Athletes</small></div>
              <div className={styles.stat}><strong>{data.summary.complete}</strong><small>Fully compliant</small></div>
              <div className={styles.stat}><strong>{data.summary.incomplete}</strong><small>Incomplete</small></div>
              <div className={styles.stat}><strong>{data.summary.percent === null ? "—" : `${data.summary.percent}%`}</strong><small>Required docs valid</small></div>
            </div>
          )}
        </div>
      </section>

      {ready && (
        <div id="ws-compliance" className="print-workspace">
          <article className="report-doc">
            <ReportHeader title="Document Compliance Report" reference={ref_no} />

            <RdSection num="I." title="Coverage">
              <table className="rd-info">
                <tbody>
                  <tr>
                    <th scope="col">Athletes covered</th>
                    <td>{data.summary.athletes}</td>
                    <th scope="col">Required documents</th>
                    <td>{data.requiredTypes.length}</td>
                  </tr>
                  <tr>
                    <th scope="col">School</th>
                    <td>{schoolId ? data.filters.schools.find((s) => String(s.id) === schoolId)?.schoolName || "—" : "All schools"}</td>
                    <th scope="col">Sport</th>
                    <td>{sportId ? data.filters.sports.find((s) => String(s.id) === sportId)?.sportName || "—" : "All sports"}</td>
                  </tr>
                  <tr>
                    <th scope="col">Fully compliant</th>
                    <td>{data.summary.complete} of {data.summary.athletes} ({data.summary.percentCompleteAthletes}%)</td>
                    <th scope="col">Document slots valid</th>
                    <td>{data.summary.percent === null ? "—" : `${data.summary.percent}%`}</td>
                  </tr>
                  <tr>
                    <th scope="col">Scope</th>
                    <td colSpan="3">{isAdmin ? "All registered athletes" : "Athletes assigned to the reporting coach"}</td>
                  </tr>
                </tbody>
              </table>
            </RdSection>

            <RdSection num="II." title="Required documents" meta={`${data.requiredTypes.length} type(s)`}>
              <table className="rd-results">
                <thead><tr><th scope="col">#</th><th scope="col">Document</th><th scope="col">Expiry tracked</th></tr></thead>
                <tbody>
                  {data.requiredTypes.map((t, i) => (
                    <tr key={t.id}><td className="num">{i + 1}</td><td>{t.name}</td><td>{t.hasExpiry ? "Yes" : "No"}</td></tr>
                  ))}
                  {!data.requiredTypes.length && <tr><td colSpan="3" className="rd-empty">No active required document types.</td></tr>}
                </tbody>
              </table>
            </RdSection>

            {data.schoolSummaries.length > 0 && (
              <RdSection num="III." title="Compliance by school">
                <table className="rd-results">
                  <thead><tr><th scope="col">School</th><th scope="col" className="num">Athletes</th><th scope="col" className="num">Compliant</th><th scope="col" className="num">Incomplete</th></tr></thead>
                  <tbody>
                    {data.schoolSummaries.map((s) => (
                      <tr key={s.schoolId}><td>{s.name}</td><td className="num">{s.total}</td><td className="num">{s.complete}</td><td className="num">{s.incomplete}</td></tr>
                    ))}
                  </tbody>
                </table>
              </RdSection>
            )}

            <RdSection num="IV." title="Per-athlete compliance" meta={`${data.rows.length} record(s)`}>
              <table className="rd-results">
                <thead>
                  <tr>
                    <th scope="col">Athlete</th><th scope="col">Code</th><th scope="col">School</th><th scope="col">Sport</th>
                    <th scope="col" className="num">Valid</th><th scope="col" className="num">%</th>
                    <th scope="col">Missing</th><th scope="col">Expiring (30d)</th><th scope="col">Expired</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.athleteId}>
                      <td>{r.name}</td>
                      <td>{r.athleteCode}</td>
                      <td>{r.school || "—"}</td>
                      <td>{r.sport || "—"}</td>
                      <td className="num">{r.validUploaded}/{r.required}</td>
                      <td className="num">{r.percent === null ? "—" : `${r.percent}%`}</td>
                      <td>{r.missing.length ? r.missing.join("; ") : "—"}</td>
                      <td>{r.expiring.length ? r.expiring.map((e) => `${e.name} (${reportDate(e.expiresAt)})`).join("; ") : "—"}</td>
                      <td>{r.expired.length ? r.expired.map((e) => `${e.name} (${reportDate(e.expiresAt)})`).join("; ") : "—"}</td>
                    </tr>
                  ))}
                  {!data.rows.length && <tr><td colSpan="9" className="rd-empty">No athletes match the selected filters.</td></tr>}
                </tbody>
              </table>
            </RdSection>

            <ReportSignatures
              session={session}
              certification="This is to certify that the document compliance status reported herein reflects the required documents actually on file for each athlete, as officially recorded and maintained in the database of the City Sports Development Office of the City Government of Cauayan, Isabela, as of the date of generation."
            />
            <ReportFooter session={session} note={`Required types: ${data.requiredTypes.length} · Athletes: ${data.summary.athletes} · Compliant: ${data.summary.complete}`} />
          </article>
        </div>
      )}
    </section>
  );
}
