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
  const [actions, setActions] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [filters, setFilters] = React.useState({ action: "", entityType: "", actor: "", role: "", q: "", from: "", to: "" });

  function load(nextPage) {
    const params = new URLSearchParams();
    params.set("page", nextPage);
    params.set("limit", "25");
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    setLoading(true);
    setError("");
    fetch(`/api/admin/audit-logs?${params.toString()}`)
      .then((response) => { if (!response.ok) throw new Error("Could not load audit logs."); return response.json(); })
      .then((data) => { setLogs(data.logs || []); setTotal(data.total || 0); if (data.actions) setActions(data.actions); setPage(nextPage); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  React.useEffect(() => {
    let active = true;
    fetch("/api/admin/audit-logs?page=1&limit=25")
      .then((response) => { if (!response.ok) throw new Error("Could not load audit logs."); return response.json(); })
      .then((data) => { if (!active) return; setLogs(data.logs || []); setTotal(data.total || 0); if (data.actions) setActions(data.actions); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <>
      <Head><title>Audit Logs | Administration</title></Head>
      <AppShell session={session} isAdmin eyebrow="Activity trail" title="Audit Logs" active="/admin/audit-logs">
        <div className={styles.pageTitle}>
          <div><p className={styles.eyebrow}>System</p><h2>Audit log</h2></div>
          <span className={styles.countBadge}>{total} entries</span>
        </div>
        <div className={styles.alertBox}>Captures sign-ins and sign-outs, failed attempts, registrations, approvals, creates, updates, deletes, photo changes, backup and restore events, and notification settings with the acting user, entity, and timestamp for full accountability.</div>
        <div className={styles.toolbar}>
          <label>Action<select value={filters.action} onChange={(event) => setFilters((f) => ({ ...f, action: event.target.value }))}><option value="">Any</option>{actions.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
          <label>Entity<input type="text" value={filters.entityType} onChange={(event) => setFilters((f) => ({ ...f, entityType: event.target.value }))} placeholder="e.g. athlete" /></label>
          <label>Actor email<input type="text" value={filters.actor} onChange={(event) => setFilters((f) => ({ ...f, actor: event.target.value }))} placeholder="search by email" /></label>
          <label>Role<select value={filters.role} onChange={(event) => setFilters((f) => ({ ...f, role: event.target.value }))}><option value="">Any</option><option value="admin">admin</option><option value="coach">coach</option></select></label>
          <label>From<input type="date" value={filters.from} onChange={(event) => setFilters((f) => ({ ...f, from: event.target.value }))} /></label>
          <label>To<input type="date" value={filters.to} onChange={(event) => setFilters((f) => ({ ...f, to: event.target.value }))} /></label>
        </div>
        <div className={styles.toolbar}>
          <label>Search details<input type="text" value={filters.q} onChange={(event) => setFilters((f) => ({ ...f, q: event.target.value }))} placeholder="text inside the log description" /></label>
          <button className={styles.primary} disabled={loading} onClick={() => load(1)}>{loading ? "Loading..." : "Apply filters"}</button>
        </div>
        <div className={styles.panel}>
          {loading ? <p className={styles.empty}>Loading audit log...</p> : error ? <p className={styles.formError}>{error}</p> : (
            <>
              <div className={styles.tableWrap}><table><thead><tr><th>When</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{formatDate(log.createdAt)}</td><td>{log.user?.email || "system"}</td><td>{log.user?.role || "—"}</td><td><span className={`${styles.badge} ${styles.badgeActive}`}>{log.action}</span></td><td>{log.entityType} {log.entityId ? `#${log.entityId}` : ""}</td><td>{log.description || "—"}</td></tr>)}{!logs.length && <tr><td colSpan="6" className={styles.empty}>No log entries match the filters.</td></tr>}</tbody></table></div>
              <div className={styles.pagination}>
                <button className={styles.secondary} disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button>
                <span>Page {page} of {totalPages}</span>
                <button className={styles.secondary} disabled={page >= totalPages} onClick={() => load(page + 1)}>Next</button>
              </div>
            </>
          )}
        </div>
      </AppShell>
    </>
  );
}