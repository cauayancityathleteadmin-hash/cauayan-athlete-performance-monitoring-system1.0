import Head from "next/head";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { getSession } from "next-auth/react";
import { prisma } from "../../../lib/prisma";
import ProfilePhoto from "../../../components/ProfilePhoto";
import AppShell from "../../../components/AppShell";
import styles from "../../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session || session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };

  const id = Number(context.query.id);
  if (!Number.isSafeInteger(id) || id <= 0) return { notFound: true };

  const coach = await prisma.coach.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, status: true, mustChangePassword: true, createdAt: true, lastLoginAt: true } },
      school: { select: { schoolName: true } },
      sports: { include: { sport: { select: { id: true, sportName: true } } } },
      athletes: {
        include: { sport: { select: { sportName: true } }, event: { select: { eventName: true } } },
        orderBy: { lastName: "asc" },
      },
    },
  });
  if (!coach) return { notFound: true };

  return { props: { session, coach: JSON.parse(JSON.stringify(coach)) } };
}

function CoachAvi({ coach }) {
  return <ProfilePhoto url={coach.pictureUrl} firstName={coach.firstName} lastName={coach.lastName} size={36} radius={8} />;
}

function StatusBadge({ status }) {
  const value = String(status || "").toLowerCase();
  if (value === "active") return <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span>;
  if (value === "pending") return <span className={`${styles.badge} ${styles.badgePending}`}>Pending</span>;
  if (value === "rejected") return <span className={`${styles.badge} ${styles.badgeRejected}`}>Rejected</span>;
  return <span className={`${styles.badge} ${styles.badgeMuted}`}>Inactive</span>;
}

const HEALTH_META = {
  healthy: { label: "Healthy", cls: "badgeActive" },
  sick: { label: "Sick", cls: "badgeRejected" },
  injured: { label: "Injured", cls: "badgeRejected" },
  recovering: { label: "Recovering", cls: "badgePending" },
  inactive: { label: "Inactive", cls: "badgeMuted" },
};

function HealthBadge({ status }) {
  const meta = HEALTH_META[status] || { label: status || "—", cls: "badgeMuted" };
  return <span className={`${styles.badge} ${styles[meta.cls]}`}>{meta.label}</span>;
}

function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return isNaN(date) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return isNaN(date) ? "—" : date.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtBirthdate(value) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00Z`);
  return isNaN(date) ? value : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function CoachProfile({ session, coach }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const name = `${coach.firstName} ${coach.lastName}${coach.suffix ? " " + coach.suffix : ""}`;
  const status = coach.user.status;

  async function reviewCoach(decision) {
    if (decision === "deactivate" && !window.confirm("Deactivate this coach? Their athletes will become uncoached, the coach will not be able to sign in, and pending transfer requests will be cancelled. You can reactivate them later.")) return;
    if (decision === "reactivate" && !window.confirm("Reactivate this coach? Athletes who remained uncoached since the deactivation will automatically return to their roster.")) return;
    const reason = decision === "deactivate" ? window.prompt("Reason for deactivating this coach (recorded in the audit log):", "") : "";
    if (decision === "deactivate" && reason === null) return;
    setBusy(true);
    setMessage("");
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/admin/coaches/review", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ coachId: coach.id, decision, reason: reason || undefined }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error || "Action failed.");
        return;
      }
      setMessage(result.message || `Coach ${decision} successfully.`);
      setTimeout(() => router.reload(), 900);
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head><title>{name} | Coach Profile</title></Head>
      <AppShell session={session} isAdmin eyebrow="Administration" title="Coach profile" active="/admin/coaches">
        <div className={styles.pageTitle}>
          <div>
            <p className={styles.eyebrow}>Coach record</p>
            <h1>{name}</h1>
          </div>
          <div className={styles.actions}>
            <StatusBadge status={status} />
            <Link className={styles.secondary} href="/admin/coaches">Back to coaches</Link>
          </div>
        </div>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Information</p><h2>Overview</h2></div></div>
          <div className={styles.grid}>
            <div className={styles.detailPanel}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
                <ProfilePhoto url={coach.pictureUrl} firstName={coach.firstName} lastName={coach.lastName} size={120} radius={10} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h4>Personal</h4>
                  <div className={styles.infoList}>
                    <div><dt>Full name</dt><dd>{name}</dd></div>
                    <div><dt>Coach code</dt><dd>{coach.coachCode || "—"}</dd></div>
                    <div><dt>Birthdate</dt><dd>{fmtBirthdate(coach.birthdate)}</dd></div>
                    <div><dt>Email</dt><dd>{coach.user.email || coach.email || "—"}</dd></div>
                    <div><dt>Contact number</dt><dd>{coach.contactNumber || "—"}</dd></div>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.detailPanel}>
              <h4>School &amp; program</h4>
              <div className={styles.infoList}>
                <div><dt>School</dt><dd>{coach.school?.schoolName || "Not assigned"}</dd></div>
                <div><dt>Sports coached</dt><dd>{coach.sports.length ? coach.sports.map((cs) => cs.sport.sportName).join(", ") : "No sports"}</dd></div>
              </div>
            </div>
            <div className={styles.detailPanel}>
              <h4>Login &amp; notification</h4>
              <div className={styles.infoList}>
                <div><dt>Registered</dt><dd>{fmtDate(coach.user.createdAt)}</dd></div>
                <div><dt>Last login</dt><dd>{fmtDateTime(coach.user.lastLoginAt)}</dd></div>
                <div><dt>Can approve coaches</dt><dd>{coach.canApproveCoaches ? "Yes" : "No"}</dd></div>
                <div><dt>Notify by SMS</dt><dd>{coach.notifySms ? "On" : "Off"}</dd></div>
                <div><dt>Notify by email</dt><dd>{coach.notifyEmail ? "On" : "Off"}</dd></div>
                {coach.user.mustChangePassword && <div><dt>Password</dt><dd><span className={`${styles.badge} ${styles.badgePending}`}>Must change</span></dd></div>}
              </div>
            </div>
            <div className={styles.detailPanel}>
              <h4>Athletes &amp; status</h4>
              <div className={styles.infoList}>
                <div><dt>Profile status</dt><dd><StatusBadge status={status} /></dd></div>
                <div><dt>Assigned athletes</dt><dd>{coach.athletes.length}</dd></div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Account</p><h2>Manage this coach</h2></div></div>
            {message && <p role="status" className={message.startsWith("Coach") ? "alertBox" : "alertBox danger"}>{message}</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {status === "pending" && (
                <>
                  <button onClick={() => reviewCoach("approved")} disabled={busy} className={`${styles.primary} ${styles.btnSm}`}>Approve coach</button>
                  <button onClick={() => reviewCoach("rejected")} disabled={busy} className={`${styles.danger} ${styles.btnSm}`}>Reject coach</button>
                </>
              )}
              {status === "rejected" && (
                <button onClick={() => reviewCoach("approved")} disabled={busy} className={`${styles.primary} ${styles.btnSm}`}>Reapprove coach</button>
              )}
              {status === "active" && (
                <button onClick={() => reviewCoach("deactivate")} disabled={busy} className={`${styles.danger} ${styles.btnSm}`}>Deactivate coach</button>
              )}
              {status === "inactive" && (
                <button onClick={() => reviewCoach("reactivate")} disabled={busy} className={`${styles.primary} ${styles.btnSm}`}>Reactivate coach</button>
              )}
            </div>
          </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Roster</p><h2>Assigned athletes</h2></div>
            <span className={styles.formHint} style={{ alignSelf: "center" }}>{coach.athletes.length} athlete{coach.athletes.length === 1 ? "" : "s"}</span>
          </div>
          {coach.athletes.length ? (
            <div className={styles.tableWrap}><table>
              <thead><tr><th>Code</th><th>Athlete</th><th>Sport</th><th>Event / discipline</th><th>Health</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {coach.athletes.map((athlete) => (
                  <tr key={athlete.id}>
                    <td data-label="Code">{athlete.athleteCode}</td>
                    <td data-label="Athlete" style={{ display: "flex", alignItems: "center", gap: 10 }}><CoachAvi coach={athlete} /><span><Link href={`/athletes/${athlete.id}`} style={{ fontWeight: 700 }}>{athlete.firstName} {athlete.middleName || ""} {athlete.lastName}</Link><small>{athlete.gender}</small></span></td>
                    <td data-label="Sport">{athlete.sport?.sportName || "—"}</td>
                    <td data-label="Event / discipline">{athlete.event?.eventName || "—"}</td>
                    <td data-label="Health"><HealthBadge status={athlete.healthStatus} /></td>
                    <td data-label="Status"><StatusBadge status={athlete.status} /></td>
                    <td><Link className={styles.expandBtn} href={`/athletes/${athlete.id}`}>Profile</Link></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <p className={styles.empty}>No athletes assigned to this coach yet.</p>}
        </section>
      </AppShell>
    </>
  );
}