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

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date ? date.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function AuditLogs({ session }) {
  const [logs, setLogs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [filter, setFilter] = React.useState("");

  React.useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/audit-logs?page=${page}&limit=25`);
        if (!response.ok) throw new Error("Could not load audit logs.");
        const data = await response.json();
        if (!active) return;
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [page]);

  const displayed = filter ? logs.filter((log) => [log.action, log.entityType, log.description, log.user?.email].filter(Boolean).join(" ").toLowerCase().includes(filter.toLowerCase())) : logs;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <>
      <Head><title>Audit Logs | Administration</title></Head>
      <AppShell session={session} isAdmin eyebrow="Activity trail" title="Audit Logs" active="/admin/audit-logs">
        <div className={styles.pageTitle}>
          <div><p className={styles.eyebrow}>System</p><h2>Audit log</h2></div>
          <span className={styles.countBadge}>{total} entries</span>
        </div>
        <div className={styles.alertBox}>Captures every sensitive action (logins, creates, updates, password changes, registrations, backups) with the acting user, entity, and timestamp for full accountability.</div>
        <div className={styles.toolbar}>
          <label>Filter current page<input type="text" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search action, entity, user..." /></label>
        </div>
        <div className={styles.panel}>
          {loading ? <p className={styles.empty}>Loading audit log...</p> : error ? <p className={styles.formError}>{error}</p> : (
            <>
              <div className={styles.tableWrap}><table><thead><tr><th>When</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead><tbody>{displayed.map((log) => <tr key={log.id}><td>{formatDate(log.createdAt)}</td><td>{log.user?.email || "system"}</td><td>{log.user?.role || "—"}</td><td><span className={`${styles.badge} ${styles.badgeActive}`}>{log.action}</span></td><td>{log.entityType} {log.entityId ? `#${log.entityId}` : ""}</td><td>{log.description}</td></tr>)}{!displayed.length && <tr><td colSpan="6" className={styles.empty}>No log entries.</td></tr>}</tbody></table></div>
              <div className={styles.pagination}>
                <button className={styles.secondary} disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
                <span>Page {page} of {totalPages}</span>
                <button className={styles.secondary} disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
              </div>
            </>
          )}
        </div>
      </AppShell>
    </>
  );
}
