import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";
import { attendanceFeatureEnabled } from "../../lib/feature-flags";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };
  return { props: { session, featureEnabled: attendanceFeatureEnabled() } };
}

const ATTENDANCE_LABEL = { present: "Present", late: "Late", excused: "Excused", absent: "Absent" };
const SESSION_TYPE_LABEL = {
  regular: "Regular",
  conditioning: "Conditioning",
  technical: "Technical",
  tactical: "Tactical",
  recovery: "Recovery",
  competition_simulation: "Competition Simulation",
  tryout: "Tryout",
};

function formatDate(value) {
  const date = new Date(value);
  return isNaN(date) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AttendanceArchive({ session, featureEnabled }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/attendance-archive").catch(() => null);
      const body = res ? await res.json().catch(() => ({})) : {};
      if (cancelled) return;
      if (res && res.ok) setData(body);
      else setError(body.error || "Could not load the archive.");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = data?.rows || [];
  const summary = data?.summary || { total: 0, present: 0, late: 0, excused: 0, absent: 0 };
  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!q) return true;
    return `${r.athleteName || ""} ${r.athleteCode || ""} ${r.sport || ""} ${r.coachName || ""} ${r.venue || ""}`.toLowerCase().includes(q);
  });

  return (
    <>
      <Head><title>Attendance Archive | Administration</title></Head>
      <AppShell session={session} isAdmin eyebrow="Records" title="Attendance archive" active="/admin/attendance-archive">
        <div className={styles.pageTitle}><h1>Attendance archive</h1></div>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Retired records</p><h2>Old session attendance</h2></div>
            <a className={styles.btnSm} href="/api/admin/attendance-archive?format=csv" download>Download CSV</a>
          </div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>
            Session attendance (present / late / excused / absent roll-call) is no longer used because athletes
            train individually, wherever and whenever their plan assigns. These older records are kept here,
            read-only, so nothing is lost. Daily participation is now shown as <strong>daily training status</strong> on
            each athlete&apos;s page.
          </p>
          {featureEnabled && (
            <p className={styles.formHint} style={{ color: "var(--warning)" }}>
              The attendance feature is switched back on for this deployment (ATTENDANCE_FEATURE_ENABLED).
            </p>
          )}

          {loading ? (
            <p className={styles.empty}>Loading archived records…</p>
          ) : error ? (
            <p role="alert" className={styles.formError}>{error}</p>
          ) : (
            <>
              <div className={styles.infoList} style={{ marginBottom: "var(--space-4)" }}>
                <div><dt>Total records</dt><dd>{summary.total}</dd></div>
                <div><dt>Present</dt><dd style={{ color: "var(--accent)" }}>{summary.present}</dd></div>
                <div><dt>Late</dt><dd style={{ color: "var(--warning)" }}>{summary.late}</dd></div>
                <div><dt>Excused</dt><dd style={{ color: "var(--muted)" }}>{summary.excused}</dd></div>
                <div><dt>Absent</dt><dd style={{ color: "var(--danger)" }}>{summary.absent}</dd></div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "flex-end", marginBottom: "var(--space-4)" }}>
                <label style={{ minWidth: 220, fontSize: 13 }}>Search
                  <input className={styles.fieldControl} type="search" placeholder="Athlete, code, sport, coach…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
                <label style={{ minWidth: 160, fontSize: 13 }}>Status
                  <select className={styles.fieldControl} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">All statuses</option>
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="excused">Excused</option>
                    <option value="absent">Absent</option>
                  </select>
                </label>
                <span className={styles.countBadge}>{filtered.length} shown</span>
              </div>

              {filtered.length ? (
                <div className={styles.tableWrap}><table>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Athlete</th>
                      <th scope="col">Status</th>
                      <th scope="col">Session</th>
                      <th scope="col">Sport</th>
                      <th scope="col">Coach</th>
                      <th scope="col">Venue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 500).map((r) => (
                      <tr key={r.id}>
                        <td data-label="Date">{formatDate(r.sessionDate)}</td>
                        <td data-label="Athlete">{r.athleteName || "—"}{r.athleteCode ? ` (${r.athleteCode})` : ""}</td>
                        <td data-label="Status"><span className={`${styles.badge} ${r.status === "present" ? styles.badgeActive : r.status === "late" ? styles.badgePending : r.status === "excused" ? styles.badgeMuted : styles.badgeRejected}`}>{ATTENDANCE_LABEL[r.status] || r.status}</span></td>
                        <td data-label="Session">{SESSION_TYPE_LABEL[r.sessionType] || r.sessionType || "—"}</td>
                        <td data-label="Sport">{r.sport || "—"}</td>
                        <td data-label="Coach">{r.coachName || "—"}</td>
                        <td data-label="Venue">{r.venue || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              ) : <p className={styles.empty}>No archived attendance records match.</p>}
              {filtered.length > 500 && <p className={styles.formHint}>Showing the first 500 matches. Use Download CSV for the full set.</p>}
            </>
          )}
        </section>
      </AppShell>
    </>
  );
}
