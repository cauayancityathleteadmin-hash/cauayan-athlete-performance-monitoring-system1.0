import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  return { props: { session } };
}

function formatDate(value) {
  const date = new Date(value);
  return isNaN(date) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function CoachApprovals({ session }) {
  const isAdmin = session?.user?.role === "admin";
  const [applications, setApplications] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    fetch("/api/coaches/approvals")
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setError(data.error || "Could not load pending applications."); setApplications([]); }
        else { setError(""); setApplications(Array.isArray(data) ? data : []); }
      })
      .catch(() => { setError("Could not load pending applications."); })
      .finally(() => setLoading(false));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function act(app, decision) {
    const actionLabel = decision === "approved" ? "approve" : "reject";
    if (!window.confirm(`${actionLabel === "approve" ? "Approve" : "Reject"} the coach application of ${app.firstName} ${app.lastName} (${app.coachCode})?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/coaches/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ coachId: app.id, decision }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        setMessage({ kind: "error", text: result.error || "Action failed." });
      } else {
        setApplications((current) => current.filter((a) => a.id !== app.id));
        setMessage({ kind: "success", text: result.message || "Done." });
      }
    } catch (err) {
      setMessage({ kind: "error", text: "Unable to reach the server. Please try again later." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head><title>Coach Approvals | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Coach registrations" title="Coach Approvals" active="/coach-approvals">
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Review</p><h2>Pending coach applications</h2></div>
            <button className={styles.secondary} onClick={load}>Refresh</button>
          </div>

          {message && (
            <p role="status" style={{ margin: "0 0 16px", padding: "12px 14px", borderRadius: "8px", border: `1px solid ${message.kind === "error" ? "var(--danger)" : "var(--accent)"}`, background: `rgba(${message.kind === "error" ? "248,113,113" : "45,212,168"}, .14)`, color: message.kind === "error" ? "var(--danger)" : "var(--foreground)" }}>
              {message.text}
            </p>
          )}

          {loading ? <p className={styles.empty}>Loading pending applications...</p> : error ? <p className={styles.empty}>{error}</p> : applications.length === 0 ? (
            <p className={styles.empty}>No pending coach applications right now.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th>Coach code</th>
                    <th>Email &amp; contact</th>
                    <th>School</th>
                    <th>Sports</th>
                    <th>Applied</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app.id}>
                      <td><strong>{app.lastName}, {app.firstName}{app.middleName ? ` ${app.middleName}` : ""}</strong></td>
                      <td>{app.coachCode}</td>
                      <td>{app.email}<small>{app.contactNumber || "—"}</small></td>
                      <td>{app.school?.schoolName || "Not assigned"}</td>
                      <td>{app.sports.length ? app.sports.join(", ") : "—"}</td>
                      <td>{formatDate(app.dateRegistered)}</td>
                      <td>
                        <button className={`${styles.primary} ${styles.btnSm}`} onClick={() => act(app, "approved")} disabled={busy} style={{ marginRight: 8 }}>Approve</button>
                        <button className={`${styles.danger} ${styles.btnSm}`} onClick={() => act(app, "rejected")} disabled={busy}>Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className={styles.formHint} style={{ marginTop: 16 }}>This approval power is limited to coach registrations only. Approving an application activates that coach&apos;s login account; it does not grant any other administrative authority.</p>
        </section>
      </AppShell>
    </>
  );
}