import { useState } from "react";
import Link from "next/link";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setIsError(false);
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ email }),
      });
      const result = await response.json().catch(() => ({}));
      if (result.error) {
        setMessage(result.error);
        setIsError(true);
      } else {
        setMessage(result.message || "Check your email for a reset link.");
        setIsError(false);
        setSent(true);
      }
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
      setIsError(true);
    }
    setBusy(false);
  }

  return (
    <main className="login-page">
      <img src="/cauayan logo.png" alt="Cauayan City" className="logo" />
      <p className="auth-kicker">Cauayan City</p>
      <h1>Reset password</h1>
      <p className="auth-subtitle">We&apos;ll email you a link to set a new password</p>

      {sent ? (
        <p
          role="status"
          style={{
            marginTop: "18px",
            padding: "12px",
            borderRadius: "8px",
            background: "rgba(45,212,168,.16)",
            border: "1px solid var(--accent)",
            color: "var(--accent)",
          }}
        >
          {message}
        </p>
      ) : (
        <form onSubmit={submit} noValidate>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength="191"
            autoComplete="email"
          />
          <button disabled={busy}>{busy ? "Sending..." : "Send reset link"}</button>
          {message && <p role="alert" style={{ color: "var(--danger)" }}>{message}</p>}
        </form>
      )}
      <p className="auth-register"><Link href="/login">Back to sign in</Link></p>
    </main>
  );
}
