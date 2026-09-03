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
      _count: { select: { athletes: true } },
    },
    orderBy: { user: { email: "asc" } }
  });
  return { props: { session, coaches: coaches.map((c) => ({ ...c, user: { ...c.user, createdAt: c.user.createdAt.toISOString() }, sports: c.sports.map(cs => ({ ...cs, sport: cs.sport })), athletesCount: c._count.athletes })) } };
}

const FILTERS = ["all", "active", "pending", "rejected", "inactive"];

const SORT_OPTIONS = [
  { key: "name", label: "Coach name" },
  { key: "code", label: "Coach code" },
  { key: "school", label: "School" },
  { key: "sports", label: "Sports" },
  { key: "status", label: "Status" },
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
      case "school": av = (a.school?.schoolName || "").toLowerCase(); bv = (b.school?.schoolName || "").toLowerCase(); break;
      case "sports": av = (a.sports || []).map((cs) => cs.sport.sportName).join(", ").toLowerCase(); bv = (b.sports || []).map((cs) => cs.sport.sportName).join(", ").toLowerCase(); break;
      case "status": av = STATUS_RANK[a.user?.status] ?? 9; bv = STATUS_RANK[b.user?.status] ?? 9; break;
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
  const [view, setView] = React.useState("sport");
  const [filter, setFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState("name");
  const [sortDir, setSortDir] = React.useState("asc");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [openId, setOpenId] = React.useState(null);

  function coachName(coach) {
    return `${coach.firstName} ${coach.lastName}${coach.suffix ? " " + coach.suffix : ""}`;
  }

  function statusBadge(status) {
    if (status === "active") return <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span>;
    if (status === "pending") return <span className={`${styles.badge} ${styles.badgePending}`}>Pending</span>;
    if (status === "rejected") return <span className={`${styles.badge} ${styles.badgeRejected}`}>Rejected</span>;
    return <span className={`${styles.badge} ${styles.badgeMuted}`}>Inactive</span>;
  }

  function patchStatus(coachId, status) {
    setList((current) => {
      if (status === "deleted") return current.filter((c) => c.id !== coachId);
      return current.map((c) => (c.id === coachId ? { ...c, user: { ...c.user, status } } : c));
    });
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

  function formatBirthdate(value) {
    if (!value) return "—";
    const date = new Date(value.includes("T") ? value : `${value}T00:00:00Z`);
    return isNaN(date) ? value : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  const visible = list.filter((coach) => {
    if (filter !== "all" && coach.user.status !== filter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      `${coach.firstName} ${coach.lastName}${coach.suffix ? " " + coach.suffix : ""}`.toLowerCase().includes(q) ||
      (coach.coachCode || "").toLowerCase().includes(q) ||
      (coach.school?.schoolName || "").toLowerCase().includes(q) ||
      ((coach.sports || []).map((cs) => cs.sport?.sportName).join(" ")).toLowerCase().includes(q) ||
      (coach.user?.email || "").toLowerCase().includes(q)
    );
  });
  const sorted = sortCoaches(visible, sortKey, sortDir);

  const grouped = React.useMemo(() => {
    const map = new Map();
    for (const coach of visible) {
      const sports = (coach.sports && coach.sports.length) ? coach.sports.map((cs) => cs.sport.sportName) : ["Unassigned"];
      for (const sport of sports) {
        if (!map.has(sport)) map.set(sport, []);
        map.get(sport).push(coach);
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  return (
    <>
      <Head>
        <title>Manage Coaches | Cauayan Athlete Performance</title>
      </Head>
      <AppShell session={session} isAdmin eyebrow="Administration" title="Coaches" active="/admin/coaches">
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Registered coaches</p>
              <h2>{view === "list" ? "All coaches" : "All coaches by sport"}</h2>
            </div>
            <div className={styles.segmented}>
              <button className={view === "sport" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} onClick={() => setView("sport")}>By sport</button>
              <button className={view === "list" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} onClick={() => setView("list")}>List</button>
            </div>
          </div>
          <div className={styles.toolbar}>
            <label style={{ minWidth: 240 }}>Search coaches<input type="text" placeholder="Name, code, sport, school, email…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
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
          {message && <p role="status" className={`alertBox ${message.startsWith("Coach") ? "" : "danger"}`}>{message}</p>}

          {view === "list" && (
            <CoachTable coaches={sorted} coachName={coachName} statusBadge={statusBadge} openId={openId} setOpenId={setOpenId} busy={busy} reviewCoach={reviewCoach} formatDate={formatDate} formatDateTime={formatDateTime} formatBirthdate={formatBirthdate} />
          )}

          {view === "sport" && (
            grouped.length ? grouped.map(([sportName, roster]) => (
              <div key={sportName} className={styles.sectionGap}>
                <h3 className={styles.sectionTitle}>{sportName} <span className={styles.formHint}>({roster.length})</span></h3>
                <CoachTable coaches={roster} coachName={coachName} statusBadge={statusBadge} openId={openId} setOpenId={setOpenId} busy={busy} reviewCoach={reviewCoach} formatDate={formatDate} formatDateTime={formatDateTime} formatBirthdate={formatBirthdate} />
              </div>
            )) : <p className={styles.empty}>No coaches in this category.</p>
          )}
        </section>
      </AppShell>
    </>
  );
}

function CoachTable({ coaches, coachName, statusBadge, openId, setOpenId, busy, reviewCoach, formatDate, formatDateTime, formatBirthdate }) {
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead>
          <tr>
            <th>Coach</th>
            <th>ID</th>
            <th>School</th>
            <th>Sports</th>
            <th>Status</th>
            <th>Athletes</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {coaches.map((coach) => (
            <React.Fragment key={coach.id}>
              <tr>
                <td><strong>{coachName(coach)}</strong></td>
                <td>{coach.coachCode || "—"}</td>
                <td>{coach.school?.schoolName || "Not assigned"}</td>
                <td>
                  {coach.sports.length > 0 ? (
                    coach.sports.map((cs) => <span key={cs.sportId} style={{ display: "inline-block", background: "rgba(45,212,168,.16)", color: "var(--accent)", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, margin: "2px 4px 2px 0" }}>{cs.sport.sportName}</span>)
                  ) : (
                    <span style={{ color: "var(--muted)", fontSize: "13px" }}>No sports</span>
                  )}
                </td>
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
                  {coach.user.mustChangePassword && <small style={{ display: "block", color: "#fbbf24", marginTop: "4px" }}>(Must change password)</small>}
                </td>
                <td>
                  <span className={styles.countBadge}>{coach.athletesCount || 0}</span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <button type="button" className={styles.expandBtn} onClick={() => setOpenId((current) => (current === coach.id ? null : coach.id))}>
                      {openId === coach.id ? "Hide details ▲" : "View details ▼"}
                    </button>
                    {coach.user.status === "pending" && (
                      <>
                        <button onClick={() => reviewCoach(coach.id, "approved")} disabled={busy} className={`${styles.primary} ${styles.btnSm}`}>Approve</button>
                        <button onClick={() => reviewCoach(coach.id, "rejected")} disabled={busy} className={`${styles.danger} ${styles.btnSm}`}>Reject</button>
                      </>
                    )}
                    {coach.user.status === "rejected" && (
                      <>
                        <button onClick={() => reviewCoach(coach.id, "approved")} disabled={busy} className={`${styles.primary} ${styles.btnSm}`}>Reapprove</button>
                        <button onClick={() => reviewCoach(coach.id, "delete")} disabled={busy} className={`${styles.danger} ${styles.btnSm}`}>Delete</button>
                      </>
                    )}
                    {(coach.user.status === "active" || coach.user.status === "inactive") && (
                      <button onClick={() => reviewCoach(coach.id, "delete")} disabled={busy} className={`${styles.danger} ${styles.btnSm}`}>Remove</button>
                    )}
                  </div>
                </td>
              </tr>
              {openId === coach.id && (
                <tr>
                  <td colSpan="7" style={{ padding: 0, background: "transparent" }}>
                    <div className={styles.detailPanel}>
                      <div className={styles.grid}>
                        <div>
                          <h4>Personal information</h4>
                          <dl className={styles.infoList}>
                            <div><dt>Full name</dt><dd>{coachName(coach)}</dd></div>
                            <div><dt>Coach code</dt><dd>{coach.coachCode || "—"}</dd></div>
                            <div><dt>Email</dt><dd>{coach.user.email}</dd></div>
                            <div><dt>Contact number</dt><dd>{coach.contactNumber || "—"}</dd></div>
                            <div><dt>Birthdate</dt><dd>{formatBirthdate(coach.birthdate)}</dd></div>
                            <div><dt>School</dt><dd>{coach.school?.schoolName || "Not assigned"}</dd></div>
                            <div><dt>Sports coached</dt><dd>{coach.sports.length ? coach.sports.map((cs) => cs.sport.sportName).join(", ") : "No sports"}</dd></div>
                            <div><dt>Status</dt><dd>{statusBadge(coach.user.status)}</dd></div>
                            <div><dt>Registered</dt><dd>{formatDate(coach.user.createdAt)}</dd></div>
                            <div><dt>Last login</dt><dd>{formatDateTime(coach.user.lastLoginAt)}</dd></div>
                            <div><dt>Athletes assigned</dt><dd><span className={styles.countBadge}>{coach.athletesCount || 0}</span></dd></div>
                          </dl>
                        </div>
                        <div>
                          <h4>Account actions</h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {coach.user.status === "pending" && (
                              <>
                                <button onClick={() => reviewCoach(coach.id, "approved")} disabled={busy} className={`${styles.primary} ${styles.btnSm}`}>Approve coach</button>
                                <button onClick={() => reviewCoach(coach.id, "rejected")} disabled={busy} className={`${styles.danger} ${styles.btnSm}`}>Reject coach</button>
                              </>
                            )}
                            {coach.user.status === "rejected" && (
                              <>
                                <button onClick={() => reviewCoach(coach.id, "approved")} disabled={busy} className={`${styles.primary} ${styles.btnSm}`}>Reapprove coach</button>
                                <button onClick={() => reviewCoach(coach.id, "delete")} disabled={busy} className={`${styles.danger} ${styles.btnSm}`}>Delete account</button>
                              </>
                            )}
                            {(coach.user.status === "active" || coach.user.status === "inactive") && (
                              <button onClick={() => reviewCoach(coach.id, "delete")} disabled={busy} className={`${styles.danger} ${styles.btnSm}`}>Remove coach</button>
                            )}
                            <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={() => setOpenId(null)}>Close details</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
</React.Fragment>
            ))}
          {coaches.length === 0 && (
            <tr><td colSpan="7" className={styles.empty}>No coaches in this category.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}