import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { useRouter } from "next/router";
import { prisma } from "../lib/prisma";
import styles from "../styles/Dashboard.module.css";
import PasswordInput from "../components/PasswordInput";
import AppShell from "../components/AppShell";
import { checkPasswordStrength } from "../lib/password";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };

  const [user, sports] = await Promise.all([
    prisma.user.findUnique({
      where: { id: Number(session.user.id) },
      include: { coach: { include: { sports: { include: { sport: true } }, school: true } } },
    }),
    prisma.sport.findMany({ where: { status: "active" }, select: { id: true, sportName: true }, orderBy: { sportName: "asc" } }),
  ]);

  if (!user) return { redirect: { destination: "/login", permanent: false } };

  return {
    props: {
      session,
      user: { ...user, coach: user.coach ? { ...user.coach, birthdate: user.coach.birthdate.toISOString(), sports: user.coach.sports.map((cs) => ({ ...cs, sport: cs.sport })) } : null },
      sports,
    },
  };
}

export default function Account({ user, sports, session }) {
  const router = useRouter();
  const [tab, setTab] = React.useState("profile");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState("");
  const [passwordData, setPasswordData] = React.useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [newPasswordStrength, setNewPasswordStrength] = React.useState(null);

  const isCoach = user.role === "coach";
  const coach = user.coach;
  const initials = ((coach?.firstName?.[0] || "") + (coach?.lastName?.[0] || "")).toUpperCase() || (user.email ? user.email[0].toUpperCase() : "A");
  const profileName = coach ? [coach.firstName, coach.middleName, coach.lastName].filter(Boolean).join(" ") : user.name || user.email;

  const handlePasswordChange = (name, value) => {
    setPasswordData((prev) => ({ ...prev, [name]: value }));
    if (name === "newPassword") {
      setNewPasswordStrength(checkPasswordStrength(value));
    }
  };

  async function submitProfile(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    if (isCoach) body.sportIds = form.getAll("sportIds").map(Number);
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/account/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(result.error || (response.ok ? result.message : "Failed to update profile."));
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    }
    setBusy(false);
  }

  async function submitPassword(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage("New passwords do not match.");
      setBusy(false);
      return;
    }

    if (!newPasswordStrength?.isValid) {
      setMessage("New password is too weak. Must meet at least 3 requirements.");
      setBusy(false);
      return;
    }

    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ currentPassword: passwordData.currentPassword, newPassword: passwordData.newPassword }),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(result.error || (response.ok ? "Password updated successfully." : "Password update failed."));
      if (response.ok && !result.error) {
        setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setNewPasswordStrength(null);
      }
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    }
    setBusy(false);
  }

  async function handleDeleteAccount(event) {
    event.preventDefault();
    if (confirmDelete !== "DELETE") {
      setMessage('Type "DELETE" to confirm.');
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/account/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ password: form.get("password"), confirm: form.get("confirm") }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) router.push("/login");
      else setMessage(result.error || "Could not delete the account.");
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    }
    setBusy(false);
  }

  return (
    <>
      <Head>
        <title>My Account | Cauayan Athlete Performance</title>
      </Head>
      <AppShell session={session} isAdmin={session?.user?.role === "admin"} eyebrow="Cauayan City" title="My Account" active="/account">
        <div className={styles.profileHeader}>
          <span className={styles.avatar}>{initials}</span>
          <div className={styles.profileMeta}>
            <h2>{profileName}</h2>
            <small>{user.email} · {user.role}</small>
          </div>
        </div>

        <div className={styles.tabs}>
          <button type="button" className={`${styles.tabBtn} ${tab === "profile" ? styles.active : ""}`} onClick={() => setTab("profile")}>Profile</button>
          <button type="button" className={`${styles.tabBtn} ${tab === "password" ? styles.active : ""}`} onClick={() => setTab("password")}>Password</button>
          <button type="button" className={`${styles.tabBtn} ${styles.dangerTab} ${tab === "delete" ? styles.active : ""}`} onClick={() => setTab("delete")}>Delete Account</button>
        </div>

        {message && <p role="status" className={message.startsWith("Password") || message.startsWith("Profile") || message.startsWith("Account") ? `${styles.formSuccess} ${styles.fullField}` : `${styles.formError} ${styles.fullField}`}>{message}</p>}

        {tab === "profile" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Settings</p><h2>Profile information</h2></div></div>
            <dl className={styles.infoList}>
              <div><dt>Role</dt><dd>{user.role}</dd></div>
              {isCoach && <><div><dt>Coach code</dt><dd>{coach.coachCode}</dd></div><div><dt>School</dt><dd>{coach.school?.schoolName || "—"}</dd></div><div><dt>Sports coached</dt><dd>{coach.sports.map((cs) => cs.sport.sportName).join(", ") || "—"}</dd></div></>}
            </dl>
            <form onSubmit={submitProfile} className={styles.formGrid} style={{ marginTop: 16 }}>
              <label>First name<input name="firstName" className={styles.fieldControl} required maxLength="100" defaultValue={coach?.firstName || ""} /></label>
              <label>Middle name<input name="middleName" className={styles.fieldControl} maxLength="100" defaultValue={coach?.middleName || ""} /></label>
              <label>Last name<input name="lastName" className={styles.fieldControl} required maxLength="100" defaultValue={coach?.lastName || ""} /></label>
              <label>Email<input name="email" className={styles.fieldControl} type="email" required maxLength="191" defaultValue={user.email} /></label>
              <label>Birthdate<input name="birthdate" className={styles.fieldControl} type="date" required defaultValue={coach?.birthdate?.split("T")[0] || ""} /></label>
              {isCoach && (
                <>
                  <label>School<input name="school" className={styles.fieldControl} defaultValue={coach?.school?.schoolName || ""} required maxLength="191" placeholder="Enter your school name" /></label>
                  <fieldset className={styles.fullField} style={{ border: "1px solid var(--border)", padding: "14px", borderRadius: "6px" }}>
                    <legend style={{ color: "var(--muted)", fontSize: "13px", fontWeight: 700, marginBottom: "8px" }}>Sports coached</legend>
                    <div className={styles.checkboxList}>{sports.map((sport) => (
                      <label key={sport.id}><input type="checkbox" name="sportIds" value={sport.id} defaultChecked={coach?.sports?.some((cs) => cs.sportId === sport.id)} /><span>{sport.sportName}</span></label>
                    ))}</div>
                  </fieldset>
                </>
              )}
              <button className={styles.primary} disabled={busy} style={{ justifySelf: "start" }}>{busy ? "Saving..." : "Save changes"}</button>
            </form>
          </section>
        )}

        {tab === "password" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Security</p><h2>Change password</h2></div></div>
            <form onSubmit={submitPassword} className={styles.formStack}>
              <label>Current password<input name="currentPassword" className={styles.fieldControl} type="password" value={passwordData.currentPassword} onChange={(e) => handlePasswordChange("currentPassword", e.target.value)} required autoComplete="current-password" /></label>
              <PasswordInput name="newPassword" label="New password (min 12 characters)" value={passwordData.newPassword} onChange={handlePasswordChange} required minLength={12} maxLength={200} autoComplete="new-password" showStrength={true} placeholder="At least 12 characters" />
              <label>Confirm new password<input name="confirmPassword" className={styles.fieldControl} type="password" value={passwordData.confirmPassword} onChange={(e) => handlePasswordChange("confirmPassword", e.target.value)} required autoComplete="new-password" minLength={12} maxLength={200} /></label>
              <div className={styles.stackedActions}><button disabled={busy} className={styles.primary}>{busy ? "Updating..." : "Update password"}</button></div>
            </form>
          </section>
        )}

        {tab === "delete" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Danger zone</p><h2>Delete account</h2></div></div>
            <div className={styles.dangerBox}>
              <h3>Delete your account</h3>
              <p>This action is irreversible. All your data will be permanently removed. Type <strong>{'"'}DELETE{'"'}</strong> to confirm.</p>
            </div>
            <form onSubmit={handleDeleteAccount} className={styles.formStack}>
              <label>Password<input name="password" className={styles.fieldControl} type="password" required autoComplete="current-password" /></label>
              <label>Type {'"'}{"DELETE"}{'"'} to confirm<input name="confirm" className={styles.fieldControl} type="text" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} required /></label>
              <div className={styles.stackedActions}><button disabled={busy} className={styles.danger}>{busy ? "Deleting..." : "Delete my account"}</button></div>
            </form>
          </section>
        )}
      </AppShell>
    </>
  );
}