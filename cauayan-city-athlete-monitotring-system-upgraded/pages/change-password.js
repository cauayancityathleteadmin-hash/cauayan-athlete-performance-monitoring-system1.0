import { useState } from "react";
import { getSession, useSession } from "next-auth/react";
import { useRouter } from "next/router";

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
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    if (form.get("newPassword") !== form.get("confirmPassword")) { setError("New passwords do not match."); setBusy(false); return; }
    const tokenResponse = await fetch("/api/csrf");
    const { token } = await tokenResponse.json();
    const response = await fetch("/api/account/change-password", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": token }, body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Password change failed.");
    else { await update({ mustChangePassword: false }); router.replace("/dashboard"); }
    setBusy(false);
  }
  if (!session) return <main><p>Loading secure account...</p></main>;
  return <main><h1>Change your password</h1><p>Your temporary password must be replaced before continuing.</p><form onSubmit={submit}><label htmlFor="currentPassword">Current password</label><input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" /><label htmlFor="newPassword">New password</label><input id="newPassword" name="newPassword" type="password" minLength="12" maxLength="200" required autoComplete="new-password" /><label htmlFor="confirmPassword">Confirm new password</label><input id="confirmPassword" name="confirmPassword" type="password" minLength="12" maxLength="200" required autoComplete="new-password" /><button disabled={busy}>{busy ? "Updating..." : "Update password"}</button>{error && <p role="alert">{error}</p>}</form></main>;
}