import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };
  return { props: { session, ranAt: new Date().toISOString() } };
}

export default function Backup({ session, ranAt }) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState({ kind: "", text: "" });

  async function requestBackup(event) {
    event.preventDefault();
    setBusy(true);
    setMessage({ kind: "", text: "" });
    const form = new FormData(event.currentTarget);
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch("/api/admin/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify({ note: form.get("note") }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    if (response && response.ok && !result.error) {
      setMessage({ kind: "success", text: result.message || "Backup request recorded." });
      event.currentTarget.reset();
    } else {
      setMessage({ kind: "danger", text: result.error || "Could not record backup request." });
    }
    setBusy(false);
  }

  return (
    <>
      <Head><title>Database Backup | Administration</title></Head>
      <AppShell session={session} isAdmin eyebrow="Maintenance" title="Database Backup" active="/admin" showAdminNav>
      <div className={styles.pageTitle}>
        <div>
          <p className={styles.eyebrow}>Snapshot</p>
          <h2>Backup request</h2>
        </div>
        <span className={styles.countBadge}>Checked {new Date(ranAt).toLocaleString()}</span>
      </div>
      <div className={styles.panel}>
        <div className={styles.alertBox}>
          This system runs on a hosted PostgreSQL database. To protect data, record a backup request below (this is written to the audit log), then download a snapshot from your hosting provider&apos;s export tool (e.g. Neon or phpMyAdmin) and keep it off-site. Schedule backups regularly.
        </div>
        <form onSubmit={requestBackup} className={styles.formStack}>
          <label>
            Backup note (optional)
            <textarea name="note" rows="3" maxLength="500" placeholder="Reason or scope, e.g. pre-competition snapshot" />
          </label>
          <div className={styles.stackedActions}>
            <button className={styles.primary} disabled={busy}>{busy ? "Recording..." : "Record backup request"}</button>
          </div>
          {message.text && <p role="status" className={message.kind === "success" ? styles.formSuccess : styles.formError}>{message.text}</p>}
        </form>
      </div>
    </AppShell>
    </>
  );
}
