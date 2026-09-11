import { useState } from "react";
import Head from "next/head";
import { getSession, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import styles from "../styles/Dashboard.module.css";
import PasswordInput from "../components/PasswordInput";
import AppShell from "../components/AppShell";
import { checkPasswordStrength } from "../lib/password";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  return { props: { session } };
}

export default function ChangePassword({ session }) {
  const router = useRouter();
  const { data: liveSession, update } = useSession();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPasswordStrength, setNewPasswordStrength] = useState(null);

  const current = liveSession ?? session;
  const isAdmin = current?.user?.role === "admin";

  const handleNewPasswordChange = (name, value) => {
    setNewPassword(value);
    setNewPasswordStrength(checkPasswordStrength(value));
  };

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      setBusy(false);
      return;
    }

    if (!newPasswordStrength?.isValid) {
      setError("New password is too weak. Must meet at least 3 requirements.");
      setBusy(false);
      return;
    }

    const tokenResponse = await fetch("/api/csrf");
    const { token } = await tokenResponse.json();
    const response = await fetch("/api/account/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": token },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Password change failed.");
    else {
      await update({ mustChangePassword: false });
      router.replace("/dashboard");
    }
    setBusy(false);
  }

  return (
    <>
      <Head><title>Change password | Cauayan Athlete Performance</title></Head>
      <AppShell session={current} isAdmin={isAdmin} eyebrow="Cauayan City" title="Change password" active="/change-password">
        <section className={styles.panel} style={{ maxWidth: "480px", margin: "0 auto" }}>
        <div className={styles.panelHeader}>
          <div><p className={styles.eyebrow}>Security</p><h2>Change your password</h2></div>
        </div>
        {!current ? (
          <p className={styles.empty}>Loading secure account...</p>
        ) : (
          <>
            <p className={styles.formHint}>Your temporary password must be replaced before continuing.</p>
            <form onSubmit={submit} className={styles.formStack}>
              <label>Current password<input name="currentPassword" className={styles.fieldControl} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" /></label>
              <PasswordInput
                name="newPassword"
                label="New password (min 12 characters)"
                value={newPassword}
                onChange={handleNewPasswordChange}
                required
                minLength={12}
                maxLength={200}
                autoComplete="new-password"
                showStrength={true}
                placeholder="At least 12 characters"
              />
              <label>Confirm new password<input name="confirmPassword" className={styles.fieldControl} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" minLength={12} maxLength={200} /></label>
              <div className={styles.stackedActions}>
                <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Updating..." : "Update password"}</button>
              </div>
              {error && (
                <p role="alert" className={`${styles.alertBox} ${styles.alertDanger}`}>{error}</p>
              )}
            </form>
          </>
        )}
      </section>
      </AppShell>
    </>
  );
}