import Head from "next/head";
import Link from "next/link";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import styles from "../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session || session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };
  const coaches = await prisma.coach.findMany({ include: { user: { select: { id: true, email: true, status: true, mustChangePassword: true } }, school: { select: { schoolName: true } } }, orderBy: { user: { email: "asc" } } });
  return { props: { session, coaches: coaches.map((c) => ({ ...c, user: { ...c.user } })) } };
}

export default function AdminCoaches({ coaches, session }) {
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function resetCoach(coachId) {
    setBusy(true);
    setMessage("");
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const result = await fetch("/api/admin/coaches/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify({ coachId }),
    }).then((r) => r.json());
    setMessage(result.error || "Coach password reset. They must change it on next login.");
    setBusy(false);
  }

  async function reviewCoach(coachId, decision) {
    setBusy(true);
    setMessage("");
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const result = await fetch("/api/admin/coaches/review", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ coachId, decision }) }).then((r) => r.json());
    setMessage(result.error || `Coach ${decision}. Refresh to update the list.`);
    setBusy(false);
  }

  return (
    <>
      <Head>
        <title>Manage Coaches | Cauayan Athlete Performance</title>
      </Head>
      <div className={styles.app}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Administration</p>
            <h1>Coaches</h1>
          </div>
          <Link className={styles.account} href="/admin">
            Back to admin
          </Link>
        </header>
        <nav className={styles.nav} aria-label="Primary navigation">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/admin">Admin</Link>
          <Link href="/admin/coaches" aria-current="page">Coaches</Link>
        </nav>
        <main className={styles.main}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Team</p>
                <h2>Coaches</h2>
              </div>
              <strong>{coaches.length} coaches · {coaches.filter((coach) => coach.user.status === "pending").length} pending</strong>
            </div>
            {message && <p role="status" style={{ color: message.startsWith("Coach") ? "#365448" : "#8b3a3a", marginBottom: "14px" }}>{message}</p>}
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>School</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {coaches.map((coach) => (
                    <tr key={coach.id}>
                      <td>
                        <strong>{coach.user.email}</strong>
                        <small>{coach.coachCode || "No code"}</small>
                      </td>
                      <td>{coach.school?.schoolName || "Not assigned"}</td>
                      <td>{coach.user.status === "active" ? "Active" : "Inactive"} {coach.user.mustChangePassword && <small>(Must change password)</small>}</td>
                      <td>
                        {coach.user.status === "pending" ? <><button onClick={() => reviewCoach(coach.id, "approved")} disabled={busy} style={{ padding: "6px 12px", fontSize: "12px", background: "#2dd4a8", border: 0, cursor: "pointer", fontWeight: 700 }}>Approve</button> <button onClick={() => reviewCoach(coach.id, "rejected")} disabled={busy} style={{ padding: "6px 12px", fontSize: "12px", background: "transparent", color: "#f87171", border: "1px solid #f87171", cursor: "pointer", fontWeight: 700 }}>Reject</button></> : <button
                          onClick={() => resetCoach(coach.id)}
                          disabled={busy}
                          style={{ padding: "6px 12px", fontSize: "12px", background: "#cae47a", border: 0, cursor: "pointer", fontWeight: 700 }}
                        >Reset password</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
