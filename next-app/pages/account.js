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
          <div className={styles.grid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.eyebrow}>Settings</p>
                  <h2>Account Settings</h2>
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
                <button
                  className={`${styles.secondary} ${tab === "profile" ? styles.primary : ""}`}
                  onClick={() => setTab("profile")}
                  style={{
                    background: tab === "profile" ? "var(--accent)" : "rgba(45, 212, 168, .16)",
                    color: tab === "profile" ? "#041f18" : "var(--accent)",
                  }}
                >
                  Profile
                </button>
                <button
                  className={`${styles.secondary} ${tab === "password" ? styles.primary : ""}`}
                  onClick={() => setTab("password")}
                  style={{
                    background: tab === "password" ? "var(--accent)" : "rgba(45, 212, 168, .16)",
                    color: tab === "password" ? "#041f18" : "var(--accent)",
                  }}
                >
                  Password
                </button>
                <button
                  className={`${styles.secondary} ${tab === "delete" ? styles.primary : ""}`}
                  onClick={() => setTab("delete")}
                  style={{
                    background: tab === "delete" ? "var(--danger)" : "rgba(248, 113, 113, .16)",
                    color: tab === "delete" ? "#fff" : "var(--danger)",
                    border: tab === "delete" ? "none" : "1px solid var(--danger)",
                  }}
                >
                  Delete Account
                </button>
              </div>

              {message && (
                <p
                  role="status"
                  style={{
                    color: message.startsWith("Password") || message.startsWith("Profile") || message.startsWith("Account") ? "#365448" : "#8b3a3a",
                    marginBottom: "14px",
                    padding: "12px",
                    background: message.startsWith("Password") || message.startsWith("Profile") || message.startsWith("Account") ? "rgba(45, 212, 168, .16)" : "rgba(248, 113, 113, .16)",
                    borderRadius: "6px",
                    border: message.startsWith("Password") || message.startsWith("Profile") || message.startsWith("Account") ? "1px solid var(--accent)" : "1px solid var(--danger)",
                  }}
                >
                  {message}
                </p>
              )}

              {tab === "profile" && (
                <form onSubmit={submitProfile} className={styles.formGrid}>
                  <label>First name<input name="firstName" required maxLength="100" defaultValue={coach?.firstName || ""} /></label>
                  <label>Middle name<input name="middleName" maxLength="100" defaultValue={coach?.middleName || ""} /></label>
                  <label>Last name<input name="lastName" required maxLength="100" defaultValue={coach?.lastName || ""} /></label>
                  <label>Email<input name="email" type="email" required maxLength="191" defaultValue={user.email} /></label>
                  <label>Birthdate<input name="birthdate" type="date" required defaultValue={coach?.birthdate?.split("T")[0] || ""} /></label>
{isCoach && (
                      <>
                        <label>
                          School
                          <input
                            name="school"
                            defaultValue={coach?.school?.schoolName || ""}
                            required
                            maxLength="191"
                            placeholder="Enter your school name"
                          />
                        </label>
                        <fieldset className={styles.fullField} style={{ border: "1px solid var(--border)", padding: "14px", borderRadius: "6px" }}>
                        <legend style={{ color: "var(--muted)", fontSize: "13px", fontWeight: 700, marginBottom: "8px" }}>Sports coached</legend>
                        {sports.map((sport) => (
                          <label key={sport.id} style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 0" }}>
                            <input type="checkbox" name="sportIds" value={sport.id} defaultChecked={coach?.sports?.some((cs) => cs.sportId === sport.id)} />
                            <span>{sport.sportName}</span>
                          </label>
                        ))}
                      </fieldset>
                    </>
                  )}
                  <button className={styles.primary} disabled={busy} style={{ justifySelf: "start" }}>
                    {busy ? "Saving..." : "Save changes"}
                  </button>
                </form>
              )}

              {tab === "password" && (
                <form onSubmit={submitPassword} style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "420px" }}>
                  <div style={{ position: "relative" }}>
                    <label htmlFor="currentPassword" style={{ color: "var(--muted)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "6px" }}>
                      Current password
                    </label>
                    <input
                      id="currentPassword"
                      name="currentPassword"
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) => handlePasswordChange("currentPassword", e.target.value)}
                      required
                      autoComplete="current-password"
                      style={{
                        width: "100%",
                        padding: "14px 16px",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        background: "#06261e",
                        color: "var(--foreground)",
                        font: "inherit",
                        fontSize: "16px",
                      }}
                    />
                  </div>
                  <PasswordInput
                    name="newPassword"
                    label="New password (min 12 characters)"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    required
                    minLength={12}
                    maxLength={200}
                    autoComplete="new-password"
                    showStrength={true}
                    placeholder="At least 12 characters"
                  />
                  <div style={{ position: "relative" }}>
                    <label htmlFor="confirmPassword" style={{ color: "var(--muted)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "6px" }}>
                      Confirm new password
                    </label>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => handlePasswordChange("confirmPassword", e.target.value)}
                      required
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={200}
                      style={{
                        width: "100%",
                        padding: "14px 16px",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        background: "#06261e",
                        color: "var(--foreground)",
                        font: "inherit",
                        fontSize: "16px",
                      }}
                    />
                  </div>
                  <button disabled={busy} className={styles.primary} style={{ alignSelf: "flex-start" }}>
                    {busy ? "Updating..." : "Update password"}
                  </button>
                </form>
              )}

              {tab === "delete" && (
                <form onSubmit={handleDeleteAccount} style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "420px" }}>
                  <div style={{ padding: "16px", background: "rgba(248, 113, 113, .1)", border: "1px solid var(--danger)", borderRadius: "8px" }}>
                    <h3 style={{ margin: "0 0 8px", color: "var(--danger)" }}>Delete your account</h3>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>
                      This action is irreversible. All your data will be permanently removed.
                      Type <strong>{'"'}DELETE{'"'}</strong> to confirm.
                    </p>
                  </div>
                  <div style={{ position: "relative" }}>
                    <label htmlFor="deletePassword" style={{ color: "var(--muted)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "6px" }}>
                      Password
                    </label>
                    <input
                      id="deletePassword"
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      style={{
                        width: "100%",
                        padding: "14px 16px",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        background: "#06261e",
                        color: "var(--foreground)",
                        font: "inherit",
                        fontSize: "16px",
                      }}
                    />
                  </div>
                  <div style={{ position: "relative" }}>
                    <label htmlFor="deleteConfirm" style={{ color: "var(--muted)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "6px" }}>
Type {"'"}DELETE{"'"} to confirm
                    </label>
                    <input
                      id="deleteConfirm"
                      name="confirm"
                      type="text"
                      value={confirmDelete}
                      onChange={(e) => setConfirmDelete(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "14px 16px",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        background: "#06261e",
                        color: "var(--foreground)",
                        font: "inherit",
                        fontSize: "16px",
                      }}
                    />
                  </div>
                  <button disabled={busy} className={styles.danger} style={{ alignSelf: "flex-start" }}>
                    {busy ? "Deleting..." : "Delete my account"}
                  </button>
                </form>
              )}
            </section>
          </div>
      </AppShell>
    </>
  );
}