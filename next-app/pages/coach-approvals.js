import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role === "admin") return { redirect: { destination: "/admin/coaches", permanent: false } };
  if (!session.user.canApproveCoaches) return { redirect: { destination: "/dashboard", permanent: false } };
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
  const [activationRequired, setActivationRequired] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [activating, setActivating] = React.useState(false);

  const load = React.useCallback(() => {
    fetch("/api/coaches/approvals")
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        if (!ok) {
          if (status === 403 && data?.code === "APPROVAL_NOT_ACTIVATED") {
            setActivationRequired(true);
            setError("");
            setApplications([]);
          } else {
            setError(data.error || "Could not load pending applications.");
            setApplications([]);
          }
        } else {
          setError("");
          setActivationRequired(false);
          setApplications(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => { setError("Could not load pending applications."); })
      .finally(() => {
        setLoading(false);
        setBusy(false);
        setActivating(false);
      });
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function activate() {
    if (!/^\d{6}$/.test(code.trim())) { setMessage({ kind: "error", text: "Enter the 6-digit code." }); return; }
    setActivating(true);
    setMessage(null);
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/coaches/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ action: "activate", code: code.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        setMessage({ kind: "error", text: result.error || "Activation failed." });
        setActivating(false);
        return;
      }
      setMessage({ kind: "success", text: result.message || "Approval power activated." });
      setCode("");
      load();
    } catch (err) {
      setMessage({ kind: "error", text: "Unable to reach the server. Please try again later." });
      setActivating(false);
    }
  }

  async function resendCode() {
    setBusy(true);
    setMessage(null);
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/coaches/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ action: "resend_code" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        setMessage({ kind: "error", text: result.error || "Could not send a new code." });
      } else {
        setMessage({ kind: "success", text: result.message || "A new code was sent." });
      }
    } catch (err) {
      setMessage({ kind: "error", text: "Unable to reach the server. Please try again later." });
    } finally {
      setBusy(false);
    }
  }

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
        <div className={styles.pageTitle}><h1>Coach approvals</h1></div>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Review</p><h2>Pending coach applications</h2></div>
          </div>

          {message && (
            <p role="status" className={`${styles.alertBox} ${message.kind === "error" ? styles.alertDanger : styles.alertSuccess}`}>
              {message.text}
            </p>
          )}

          {activationRequired ? (
            <div style={{ border: "1px solid rgba(45,212,168,.5)", borderRadius: "var(--radius-lg)", padding: "var(--space-4)", background: "rgba(6,38,30,.5)", marginBottom: "var(--space-4)" }}>
              <p className={styles.eyebrow}>Activation required</p>
              <h3 style={{ margin: "0 0 6px" }}>Your coach approval power is ready but not yet active</h3>
              <p className={styles.formHint} style={{ marginTop: 0 }}>The administrator granted you the ability to approve coach applications. Enter the 6-digit activation code that was emailed and sent by SMS to finish activating it. Codes expire after 24 hours.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 10 }}>
                <input
                  className={styles.fieldControl}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength="6"
                  value={code}
                  placeholder="6-digit code"
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); activate(); } }}
                  style={{ width: 150, letterSpacing: 4, textAlign: "center", fontSize: 16 }}
                />
                <button className={styles.primary} disabled={activating || busy} onClick={activate}>{activating ? "Activating..." : "Activate"}</button>
                <button className={`${styles.secondary} ${styles.btnSm}`} disabled={activating || busy} onClick={resendCode}>{busy ? "Sending..." : "Resend code"}</button>
              </div>
            </div>
          ) : null}

          {loading ? <p className={styles.empty}>Loading pending applications...</p> : activationRequired ? null : error ? <p className={styles.empty}>{error}</p> : applications.length === 0 ? (
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
                      <td data-label="Applicant"><strong>{app.lastName}, {app.firstName}{app.middleName ? ` ${app.middleName}` : ""}</strong></td>
                      <td data-label="Coach code">{app.coachCode}</td>
                      <td data-label="Email &amp; contact">{app.email}<small>{app.contactNumber || "—"}</small></td>
                      <td data-label="School">{app.school?.schoolName || "Not assigned"}</td>
                      <td data-label="Sports">{app.sports.length ? app.sports.join(", ") : "—"}</td>
                      <td data-label="Applied">{formatDate(app.dateRegistered)}</td>
                      <td data-label="Action">
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