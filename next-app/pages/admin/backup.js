import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };
  return { props: { session } };
}

function getCsrf() {
  return fetch("/api/csrf").then((r) => r.json());
}

function filenameFromDisposition(header, fallback) {
  const match = header && header.match(/filename="?([^";]+)"?/i);
  return match ? match[1] : fallback;
}

function formatBytes(size) {
  if (!size) return "";
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function Backup({ session }) {
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState({ kind: "", text: "" });
  const [snapshots, setSnapshots] = React.useState([]);
  const [schedule, setSchedule] = React.useState("monthly");
  const [confirmText, setConfirmText] = React.useState("");
  const [restoring, setRestoring] = React.useState(null);

  async function refresh() {
    try {
      const response = await fetch("/api/admin/backup");
      if (!response.ok) throw new Error("Could not load backup information.");
      const data = await response.json();
      setSnapshots(data.snapshots || []);
      setSchedule(data.schedule || "monthly");
    } catch (err) {
      setMessage({ kind: "danger", text: err.message });
    }
  }

  React.useEffect(() => {
    let active = true;
    fetch("/api/admin/backup")
      .then((response) => { if (!response.ok) throw new Error("Could not load backup information."); return response.json(); })
      .then((data) => { if (!active) return; setSnapshots(data.snapshots || []); setSchedule(data.schedule || "monthly"); })
      .catch((err) => { if (active) setMessage({ kind: "danger", text: err.message }); });
    return () => { active = false; };
  }, []);

  async function saveOffSite(event) {
    event.preventDefault();
    setBusy("save");
    setMessage({ kind: "", text: "" });
    try {
      const csrf = await getCsrf();
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ action: "save", note: "" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) throw new Error(result.error || "The backup could not be created.");
      setMessage({ kind: "success", text: result.message });
      await refresh();
    } catch (err) {
      setMessage({ kind: "danger", text: err.message });
    } finally {
      setBusy("");
    }
  }

  async function download(event) {
    event.preventDefault();
    setBusy("download");
    setMessage({ kind: "", text: "" });
    try {
      const csrf = await getCsrf();
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ action: "download" }),
      });
      if (!response.ok) throw new Error("The backup file could not be generated.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFromDisposition(response.headers.get("content-disposition"), "system-backup.json");
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage({ kind: "success", text: "Backup file downloaded." });
    } catch (err) {
      setMessage({ kind: "danger", text: err.message });
    } finally {
      setBusy("");
    }
  }

  async function restoreFromFile(event) {
    event.preventDefault();
    setBusy("restore");
    setMessage({ kind: "", text: "" });
    const file = event.currentTarget.file.files[0];
    if (!file) { setMessage({ kind: "danger", text: "Choose a backup file first." }); setBusy(""); return; }
    try {
      const snapshot = JSON.parse(await file.text());
      await performRestore({ source: "file", snapshot });
    } catch (err) {
      setMessage({ kind: "danger", text: "The file is not a valid backup: " + err.message });
    } finally {
      setBusy("");
    }
  }

  async function restoreSnapshot(url, label) {
    setBusy("restore");
    setMessage({ kind: "", text: "" });
    try {
      await performRestore({ source: "blob", url });
      setRestoring(null);
      setConfirmText("");
    } catch (err) {
      setMessage({ kind: "danger", text: err.message });
    } finally {
      setBusy("");
    }
  }

  async function performRestore(payload) {
    const csrf = await getCsrf();
    const response = await fetch("/api/admin/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) throw new Error(result.error || "The restore could not be completed.");
    setMessage({ kind: "success", text: result.message });
    await refresh();
  }

  return (
    <>
      <Head><title>Database Backup & Restore | Administration</title></Head>
      <AppShell session={session} isAdmin eyebrow="Maintenance" title="Database Backup & Restore" active="/admin/backup">
        <div className={styles.pageTitle}>
          <div><p className={styles.eyebrow}>Snapshot</p><h2>Back up and restore</h2></div>
          <span className={styles.countBadge}>Automatic: every {schedule}</span>
        </div>
        <div className={styles.alertBox}>
          Backups are full snapshots of every table. Each snapshot is saved off-site (cloud storage) and old snapshots beyond the last 20 are automatically removed. A safety backup is taken automatically before every restore, so nothing is lost if a restore goes wrong.
        </div>

        {message.text && <p role="status" className={message.kind === "success" ? styles.formSuccess : styles.formError}>{message.text}</p>}

        <div className={styles.panel}>
          <h3 style={{ margin: "0 0 12px" }}>Create a backup now</h3>
          <div className={styles.stackedActions}>
            <button className={styles.primary} disabled={Boolean(busy)} onClick={saveOffSite}>{busy === "save" ? "Backing up..." : "Save full backup off-site"}</button>
            <button className={styles.secondary} disabled={Boolean(busy)} onClick={download}>{busy === "download" ? "Preparing..." : "Download backup file"}</button>
          </div>
        </div>

        <div className={styles.panel}>
          <h3 style={{ margin: "0 0 12px" }}>Stored off-site snapshots</h3>
          {!snapshots.length ? <p className={styles.empty}>No stored snapshots yet. Create one with the buttons above (or wait for the automatic monthly backup).</p> : (
            <div className={styles.tableWrap}><table><thead><tr><th>Created (UTC)</th><th>Size</th><th>Restore</th></tr></thead><tbody>
              {snapshots.map((snap) => (
                <tr key={snap.url}>
                  <td>{new Date(snap.uploadedAt).toLocaleString()}</td>
                  <td>{formatBytes(snap.size)}</td>
                  <td>
                    <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => setRestoring(snap)}>Restore this snapshot</button>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          )}
          {restoring && (
            <div className={styles.formStack} style={{ marginTop: 16 }}>
              <p>Restoring will replace the current database with the snapshot from {new Date(restoring.uploadedAt).toLocaleString()}. A safety backup is created first. Type <strong>RESTORE</strong> to confirm.</p>
              <label>Type RESTORE to confirm<input type="text" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} /></label>
              <div className={styles.stackedActions}>
                <button className={styles.primary} disabled={confirmText !== "RESTORE" || busy === "restore"} onClick={() => restoreSnapshot(restoring.url)}>{busy === "restore" ? "Restoring..." : "Confirm restore"}</button>
                <button className={styles.secondary} disabled={busy === "restore"} onClick={() => { setRestoring(null); setConfirmText(""); }}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className={styles.panel}>
          <h3 style={{ margin: "0 0 12px" }}>Restore from a downloaded file</h3>
          <form onSubmit={restoreFromFile} className={styles.formStack}>
            <label>Backup file (.json from a full-system backup)<input type="file" name="file" accept=".json,application/json" /></label>
            <div className={styles.stackedActions}>
              <button className={styles.secondary} disabled={busy === "restore"}>{busy === "restore" ? "Restoring..." : "Restore from this file"}</button>
            </div>
          </form>
        </div>
      </AppShell>
    </>
  );
}