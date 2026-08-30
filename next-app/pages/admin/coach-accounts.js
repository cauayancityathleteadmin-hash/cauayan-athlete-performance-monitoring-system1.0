import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session || session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };
  const coaches = await prisma.coach.findMany({
    include: {
      user: { select: { id: true, email: true, username: true, status: true } },
      school: { select: { schoolName: true } },
      sports: { include: { sport: { select: { sportName: true } } } },
    },
    orderBy: { lastName: "asc" },
  });
  return { props: { session, coaches: coaches.map((c) => ({ ...c, sports: c.sports.map((cs) => ({ ...cs, sport: cs.sport })) })) } };
}

function statusLabel(status) {
  if (status === "active") return <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span>;
  if (status === "pending") return <span className={`${styles.badge} ${styles.badgePending}`}>Pending</span>;
  if (status === "rejected") return <span className={`${styles.badge} ${styles.badgeRejected}`}>Rejected</span>;
  return <span className={`${styles.badge} ${styles.badgeMuted}`}>Inactive</span>;
}

export default function AdminCoachAccounts({ coaches, session }) {
  const [selected, setSelected] = React.useState(new Set());
  const [message, setMessage] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const activeCoaches = coaches.filter((c) => c.user.status === "active");
  const selectedActive = [...selected].filter((id) => activeCoaches.some((c) => c.id === id));

  function toggle(id, canSelect) {
    if (!canSelect) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedActive.length === activeCoaches.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(activeCoaches.map((c) => c.id)));
    }
  }

  async function resetSelected() {
    if (!selectedActive.length) return;
    if (!window.confirm(`Reset ${selectedActive.length} coach account(s) to the default password and email each one?\n\nThey will be required to change their password on next login.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/admin/coaches/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ coachIds: selectedActive }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        setMessage({ kind: "error", text: result.error || "Reset failed." });
      } else {
        setMessage({
          kind: result.emailed === result.updated ? "success" : "warn",
          text: `${result.message} Emailed: ${result.emailed} of ${result.updated}.`,
        });
        setSelected(new Set());
      }
    } catch (err) {
      setMessage({ kind: "error", text: "Unable to reach the server. Please try again later." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head><title>Coach Accounts | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin eyebrow="Administration" title="Coach Accounts" active="/admin/coach-accounts">
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Account management</p>
              <h2>Coach Accounts</h2>
            </div>
          </div>

          <div className={styles.toolbar}>
            <label style={{ minWidth: 220 }}>
              <small>Select active coaches to reset their password to the default and email each one. They must change it on next login.</small>
            </label>
            <span style={{ flex: 1 }} />
            {selectedActive.length > 0 && (
              <span className={styles.selectionSummary}><strong>{selectedActive.length}</strong> selected</span>
            )}
            <button type="button" className={styles.secondary} onClick={toggleAll} disabled={activeCoaches.length === 0}>
              {selectedActive.length === activeCoaches.length ? "Clear all" : "Select all active"}
            </button>
            <button type="button" className={`${styles.primary} ${styles.btnLg}`} disabled={busy || selectedActive.length === 0} onClick={resetSelected}>
              {busy ? "Resetting..." : `Reset selected (${selectedActive.length})`}
            </button>
          </div>

          {message && (
            <p role="status" style={{ margin: "0 0 16px", padding: "12px 14px", borderRadius: "8px", border: `1px solid ${message.kind === "error" ? "var(--danger)" : "var(--accent)"}`, background: `rgba(${message.kind === "error" ? "248,113,113" : "45,212,168"}, .14)`, color: message.kind === "error" ? "var(--danger)" : "var(--foreground)" }}>
              {message.text}
            </p>
          )}

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}><input type="checkbox" checked={activeCoaches.length > 0 && selectedActive.length === activeCoaches.length} onChange={toggleAll} disabled={activeCoaches.length === 0} style={{ accentColor: "var(--accent)", width: 18, height: 18, cursor: "pointer" }} /></th>
                  <th>Coach</th>
                  <th>Email</th>
                  <th>School</th>
                  <th>Sports</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {coaches.map((coach) => {
                  const canSelect = coach.user.status === "active";
                  const checked = canSelect && selected.has(coach.id);
                  return (
                    <tr key={coach.id} style={checked ? { background: "rgba(45,212,168,.06)" } : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canSelect}
                          onChange={() => toggle(coach.id, canSelect)}
                          style={{ accentColor: "var(--accent)", width: 18, height: 18, cursor: canSelect ? "pointer" : "not-allowed" }}
                        />
                      </td>
                      <td><strong>{coach.firstName} {coach.lastName}</strong><small>{coach.coachCode} · {coach.user.username || "—"}</small></td>
                      <td>{coach.user.email}</td>
                      <td>{coach.school?.schoolName || "Not assigned"}</td>
                      <td>
                        {coach.sports.length ? coach.sports.map((cs) => <span key={cs.sportId} className={styles.badge} style={{ background: "rgba(45,212,168,.16)", color: "var(--accent)", margin: "2px 4px 2px 0" }}>{cs.sport.sportName}</span>) : <span style={{ color: "var(--muted)", fontSize: 12 }}>No sports</span>}
                      </td>
                      <td>{statusLabel(coach.user.status)}</td>
                    </tr>
                  );
                })}
                {coaches.length === 0 && <tr><td colSpan="6" className={styles.empty}>No coaches found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </AppShell>
    </>
  );
}
