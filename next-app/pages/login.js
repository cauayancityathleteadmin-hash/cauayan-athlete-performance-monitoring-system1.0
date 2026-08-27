import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/router";
import Link from "next/link";

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await signIn("credentials", { identifier, password, redirect: false });
    if (result?.error) setError("Login failed. Check your credentials or try again later.");
    else router.push("/dashboard");
    setBusy(false);
  }

  return (
    <main className="login-page">
      <img src="/cauayan logo.png" alt="Cauayan City" className="logo" />
      <p className="auth-kicker">Cauayan City</p>
      <h1>Athlete Performance</h1>
      <p className="auth-subtitle">Secure monitoring system</p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="identifier">Username, email, or coach code</label>
        <input
          id="identifier"
          name="identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoComplete="username"
          maxLength="191"
        />
        <label htmlFor="password">Password</label>
        <div style={{ position: "relative" }}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            maxLength="200"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            disabled={busy}
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              cursor: busy ? "not-allowed" : "pointer",
              color: busy ? "var(--muted)" : "var(--foreground)",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: busy ? 0.5 : 1,
            }}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            )}
          </button>
        </div>
        <button disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
        {error && <p role="alert">{error}</p>}
      </form>
      <p className="auth-register"><Link href="/coach-register">Register as a coach</Link></p>
    </main>
  );
}