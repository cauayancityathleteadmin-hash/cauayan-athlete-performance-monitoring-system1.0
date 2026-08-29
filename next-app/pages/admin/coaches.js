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
      user: { select: { id: true, email: true, status: true, mustChangePassword: true, createdAt: true, lastLoginAt: true } },
      school: { select: { schoolName: true } },
      sports: { include: { sport: { select: { sportName: true } } } },
      athletes: { select: { id: true } },
    },
    orderBy: { user: { email: "asc" } }
  });
  return { props: { session, coaches: coaches.map((c) => ({ ...c, user: { ...c.user, createdAt: c.user.createdAt.toISOString() }, sports: c.sports.map(cs => ({ ...cs, sport: cs.sport })), athletesCount: c.athletes.length })) } };
}

const FILTERS = ["all", "active", "pending", "rejected", "inactive"];

const SORT_OPTIONS = [
  { key: "name", label: "Coach name" },
  { key: "code", label: "Coach code" },
  { key: "email", label: "Email" },
  { key: "school", label: "School" },
  { key: "sports", label: "Sports count" },
  { key: "athletes", label: "Athletes" },
  { key: "status", label: "Status" },
  { key: "registered", label: "Registered" },
  { key: "lastLogin", label: "Last login" },
];

const STATUS_RANK = { active: 0, pending: 1, rejected: 2, inactive: 3 };

function sortCoaches(list, key, dir) {
  const factor = dir === "desc" ? -1 : 1;
  const sorted = [...list];
  sorted.sort((a, b) => {
    let av;
    let bv;
    switch (key) {
      case "name": av = `${a.firstName} ${a.lastName}`.toLowerCase(); bv = `${b.firstName} ${b.lastName}`.toLowerCase(); break;
      case "code": av = a.coachCode || ""; bv = b.coachCode || ""; break;
      case "email": av = (a.user?.email || "").toLowerCase(); bv = (b.user?.email || "").toLowerCase(); break;
      case "school": av = (a.school?.schoolName || "").toLowerCase(); bv = (b.school?.schoolName || "").toLowerCase(); break;
      case "sports": av = a.sports?.length || 0; bv = b.sports?.length || 0; break;
      case "athletes": av = a.athletesCount; bv = b.athletesCount; break;
      case "status": av = STATUS_RANK[a.user?.status] ?? 9; bv = STATUS_RANK[b.user?.status] ?? 9; break;
      case "registered": av = a.user?.createdAt ? new Date(a.user.createdAt) : new Date(0); bv = b.user?.createdAt ? new Date(b.user.createdAt) : new Date(0); break;
      case "lastLogin": av = a.user?.lastLoginAt ? new Date(a.user.lastLoginAt) : new Date(0); bv = b.user?.lastLoginAt ? new Date(b.user.lastLoginAt) : new Date(0); break;
      default: av = ""; bv = "";
    }
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    return 0;
  });
  return sorted;
}

export default function AdminCoaches({ coaches, session }) {
  const [list, setList] = React.useState(coaches);
  const [filter, setFilter] = React.useState("all");
  const [sortKey, setSortKey] = React.useState("name");
  const [sortDir, setSortDir] = React.useState("asc");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function coachName(coach) {
    return `${coach.firstName} ${coach.lastName}${coach.suffix ? " " + coach.suffix : ""}`;
  }

  function patchStatus(coachId, status) {
    setList((current) => {
      if (status === "deleted") return current.filter((c) => c.id !== coachId);
      return current.map((c) => (c.id === coachId ? { ...c, user: { ...c.user, status } } : c));
    });
  }

  async function resetCoach(coachId) {
    setBusy(true);
    setMessage("");
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/admin/coaches/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ coachId }),
      });
      const result = await response.json().catch(() => ({}));
      if (result.error) setMessage(result.error);
      else if (!response.ok) setMessage("Action failed.");
      else if (result.temporaryPassword) setMessage("Temporary password: " + result.temporaryPassword + " — share it securely.");
      else setMessage(result.message || "Coach password reset.");
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    }
    setBusy(false);
  }

  async function reviewCoach(coachId, decision) {
    if (decision === "delete" && !window.confirm("Delete this coach account permanently? This cannot be undone.")) return;
    setBusy(true);
    setMessage("");
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/admin/coaches/review", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ coachId, decision }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error || "Action failed.");
        return;
      }
      patchStatus(coachId, result.status === "active" ? "active" : result.status);
      setMessage(result.message || `Coach ${decision} successfully.`);
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function formatDateTime(dateString) {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const visible = list.filter((coach) => filter === "all" || coach.user.status === filter);
  const sorted = sortCoaches(visible, sortKey, sortDir);

  return (
    <>
      <Head>
        <title>Manage Coaches | Cauayan Athlete Performance</title>
      </Head>
      <AppShell session={session} isAdmin eyebrow="Administration" title="Coaches" active="/admin/coaches">
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Team</p>
                <h2>Coaches</h2>
              </div>
              <small style={{ color: "var(--muted)" }}>Rejected coaches can be reapproved or deleted.</small>
            </div>
            <div className={styles.toolbar} style={{ marginBottom: 16 }}>
              {FILTERS.map((item) => (
                <button key={item} type="button" onClick={() => setFilter(item)} className={filter === item ? styles.primary : styles.secondary} style={{ textTransform: "capitalize" }}>{item}</button>
              ))}
              <span style={{ flex: 1 }} />
              <label>Sort coaches by
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
                  {SORT_OPTIONS.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}
                </select>
              </label>
              <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={() => setSortDir((current) => (current === "asc" ? "desc" : "asc"))}>{sortDir === "asc" ? "Ascending" : "Descending"}</button>
            </div>
            {message && <p role="status" style={{ color: message.startsWith("Coach") ? "#365448" : "#8b3a3a", margin: "0 0 14px", padding: "12px", background: message.startsWith("Coach") ? "rgba(45, 212, 168, .16)" : "rgba(248, 113, 113, .16)", borderRadius: "6px", border: message.startsWith("Coach") ? "1px solid var(--accent)" : "1px solid var(--danger)" }}>{message}</p>}
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Coach</th>
                    <th>Email</th>
                    <th>School</th>
                    <th>Sports</th>
                    <th>Athletes</th>
                    <th>Status</th>
                    <th>Registered</th>
                    <th>Last Login</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((coach) => (
                    <tr key={coach.id}>
                      <td>
                        <strong>{coachName(coach)}</strong>
                        <small>{coach.coachCode || "No code"}</small>
                      </td>
                      <td>{coach.user.email}</td>
                      <td>{coach.school?.schoolName || "Not assigned"}</td>
                      <td>
                        {coach.sports.length > 0 ? (
                          coach.sports.map((cs) => <span key={cs.sportId} style={{display:"inline-block",background:"rgba(45,212,168,.16)",color:"var(--accent)",padding:"2px 8px",borderRadius:"12px",fontSize:"11px",fontWeight:700,margin:"2px 4px 2px 0"}}>{cs.sport.sportName}</span>)
                        ) : (
                          <span style={{color:"var(--muted)",fontSize:"13px"}}>No sports</span>
                        )}
                      </td>
                      <td>{coach.athletesCount}</td>
                      <td>
                        {coach.user.status === "active" ? (
                          <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span>
                        ) : coach.user.status === "pending" ? (
                          <span className={`${styles.badge} ${styles.badgePending}`}>Pending</span>
                        ) : coach.user.status === "rejected" ? (
                          <span className={`${styles.badge} ${styles.badgeRejected}`}>Rejected</span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeMuted}`}>Inactive</span>
                        )}
                        {coach.user.mustChangePassword && <small style={{display:"block",color:"#fbbf24",marginTop:"4px"}}>(Must change password)</small>}
                      </td>
                      <td>{formatDate(coach.user.createdAt)}</td>
                      <td>{formatDateTime(coach.user.lastLoginAt)}</td>
                      <td>
                        {coach.user.status === "pending" ? (
                          <>
                            <button onClick={() => reviewCoach(coach.id, "approved")} disabled={busy} className={`${styles.primary} ${styles.btnSm}`} style={{marginRight:"8px"}}>Approve</button>
                            <button onClick={() => reviewCoach(coach.id, "rejected")} disabled={busy} className={`${styles.danger} ${styles.btnSm}`}>Reject</button>
                          </>
                        ) : coach.user.status === "rejected" ? (
                          <>
                            <button onClick={() => reviewCoach(coach.id, "approved")} disabled={busy} className={`${styles.primary} ${styles.btnSm}`} style={{marginRight:"8px"}}>Reapprove</button>
                            <button onClick={() => reviewCoach(coach.id, "delete")} disabled={busy} className={`${styles.danger} ${styles.btnSm}`}>Delete</button>
                          </>
                        ) : (
                          <button onClick={() => resetCoach(coach.id)} disabled={busy} className={`${styles.secondary} ${styles.btnSm}`}>Reset password</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr><td colSpan="9" className={styles.empty}>No coaches in this category.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
      </AppShell>
    </>
  );
}