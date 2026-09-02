import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import PasswordInput from "../components/PasswordInput";
import { checkPasswordStrength } from "../lib/password";

export default function ResetPassword() {
  const router = useRouter();
  const token = router.query.token || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [strength, setStrength] = useState(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function onChange(name, value) {
    if (name === "password") {
      setPassword(value);
      setStrength(checkPasswordStrength(value));
    } else if (name === "confirm") {
      setConfirm(value);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!password) return setMessage("Enter a new password.");
    if (password !== confirm) return setMessage("Passwords do not match.");
    if (!strength?.isValid) return setMessage("Password is too weak. Meet at least 3 requirements.");
    setBusy(true);
    setMessage("");
    setIsError(false);
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (result.error) {
        setMessage(result.error);
        setIsError(true);
      } else {
        setMessage(result.message || "Your password has been reset.");
        setIsError(false);
        setDone(true);
      }
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
      setIsError(true);
    }
    setBusy(false);
  }

  return (
    <main className="login-page">
      <img src="/sports_logo.jpg" alt="Cauayan City" className="logo" />
      <p className="auth-kicker">Cauayan City</p>
      <h1>Choose a new password</h1>
      <p className="auth-subtitle">Enter a new password for your account</p>

      {done ? (
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
          {message} <Link href="/login">Sign in now</Link>
        </p>
      ) : (
        <form onSubmit={submit} noValidate style={{ width: "100%" }}>
          <div style={{ marginBottom: "16px" }}>
            <PasswordInput
              name="password"
              label="New password"
              value={password}
              onChange={onChange}
              required
              minLength="12"
              maxLength="200"
              autoComplete="new-password"
              showStrength={true}
              placeholder="At least 12 characters"
            />
          </div>
          <PasswordInput
            name="confirm"
            label="Confirm new password"
            value={confirm}
            onChange={onChange}
            required
            minLength="12"
            maxLength="200"
            autoComplete="new-password"
            placeholder="Re-enter the password"
          />
          <button disabled={busy || !token} style={{ marginTop: "14px" }}>
            {busy ? "Resetting..." : "Reset password"}
          </button>
          {message && <p role="alert" style={{ color: isError ? "var(--danger)" : "var(--accent)" }}>{message}</p>}
        </form>
      )}
      {!done && <p className="auth-register"><Link href="/login">Back to sign in</Link></p>}
    </main>
  );
}
