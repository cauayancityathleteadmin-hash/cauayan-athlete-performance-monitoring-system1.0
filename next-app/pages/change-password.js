import { useState } from "react";
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

export default function ChangePassword() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPasswordStrength, setNewPasswordStrength] = useState(null);

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

  if (!session)
    return (
      <main className={styles.app}>
        <header className={styles.header}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <img src="/sports_logo.png" alt="Cauayan City" className="logo" style={{ height: "48px", width: "auto" }} />
          </div>
        </header>
        <main className={styles.main}>
          <p>Loading secure account...</p>
        </main>
      </main>
    );

  return (
    <AppShell session={session} isAdmin={session?.user?.role === "admin"} eyebrow="Cauayan City" title="Change password" active="/change-password">
      <section className={styles.panel} style={{ maxWidth: "480px", margin: "0 auto" }}>
          <h2>Change your password</h2>
          <p style={{ color: "var(--muted)", marginBottom: "24px" }}>Your temporary password must be replaced before continuing.</p>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <label htmlFor="currentPassword" style={{ color: "var(--muted)", fontSize: "13px", fontWeight: 700 }}>
              Current password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                border: "1px solid var(--border)",
                background: "#06261e",
                color: "var(--foreground)",
                padding: "12px 14px",
                borderRadius: "8px",
                font: "inherit",
                fontSize: "15px",
              }}
            />
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
            <div style={{ position: "relative" }}>
              <label htmlFor="confirmPassword" style={{ color: "var(--muted)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "6px" }}>
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
            <button
              disabled={busy}
              style={{
                padding: "14px 18px",
                background: "var(--accent)",
                color: "#041f18",
                border: "none",
                borderRadius: "8px",
                fontWeight: 700,
                cursor: busy ? "wait" : "pointer",
                font: "inherit",
                fontSize: "15px",
                marginTop: "8px",
                opacity: busy ? 0.65 : 1,
              }}
            >
              {busy ? "Updating..." : "Update password"}
            </button>
            {error && (
              <p
                role="alert"
                style={{
                  color: "var(--danger)",
                  fontSize: "14px",
                  padding: "12px",
                  background: "rgba(248,113,113,.16)",
                  border: "1px solid var(--danger)",
                  borderRadius: "6px",
                }}
              >
                {error}
              </p>
            )}
          </form>
        </section>
    </AppShell>
  );
}