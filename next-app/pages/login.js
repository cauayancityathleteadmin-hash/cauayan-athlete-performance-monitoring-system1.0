import { useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Link from "next/link";

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const identifierRef = useRef(null);
  const passwordRef = useRef(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const identifier = identifierRef.current ? identifierRef.current.value : "";
      const password = passwordRef.current ? passwordRef.current.value : "";
      
      const csrfRes = await fetch("/api/auth/csrf");
      const { csrfToken } = await csrfRes.json();
      
      const formData = new URLSearchParams();
      formData.append("csrfToken", csrfToken);
      formData.append("identifier", identifier);
      formData.append("password", password);
      formData.append("callbackUrl", "/dashboard");
      formData.append("json", "true");
      
      const res = await fetch("/api/auth/callback/credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
        credentials: "include",
      });
      
      const data = await res.json();
      
      if (data.url && data.url.includes("error")) {
        if (data.url.includes("PENDING_APPROVAL")) {
          setError("Approval still pending.");
        } else {
          setError("Login failed. Try again.");
        }
      } else {
        const cb = typeof router.query.callbackUrl === "string" ? router.query.callbackUrl : "";
        if (cb && cb.startsWith("/") && !cb.startsWith("//") && !cb.startsWith("/api/auth/")) {
          window.location.href = cb;
        } else {
          window.location.href = "/dashboard";
        }
        return;
      }
    } catch (err) {
      setError("Unable to sign in.");
    }
    setBusy(false);
  }

  return (
    <main className="login-page">
      <Head><title>Sign in | A Performance Monitoring System for Athletes in Cauayan City, Isabela</title></Head>
      <div className="auth-logos">
        <img src="/cauayan logo.png" alt="Official Seal of the City Government of Cauayan" className="logo" />
        <img src="/sports_logo.png" alt="Cauayan City Sports" className="logo" />
      </div>
      <p className="auth-kicker">Cauayan City</p>
      <h1 className="auth-system-title">A Performance Monitoring System for Athletes in Cauayan City, Isabela</h1>
      <p className="auth-subtitle">Tracking development progress from initial to current performance with analytics</p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="identifier">
          Username or email
          <input
            id="identifier"
            name="identifier"
            ref={identifierRef}
            required
            autoComplete="username"
            maxLength="191"
          />
        </label>
        <label htmlFor="password">
          Password
          <div style={{ position: "relative" }}>
            <input
              id="password"
              name="password"
              ref={passwordRef}
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              maxLength="200"
              style={{ paddingRight: "52px", height: "48px", boxSizing: "border-box" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              disabled={busy}
              style={{
                position: "absolute",
                top: 0,
                right: "8px",
                bottom: 0,
                margin: "auto",
                width: "40px",
                height: "40px",
                background: "transparent",
                border: "none",
                cursor: busy ? "not-allowed" : "pointer",
                color: busy ? "var(--muted)" : "var(--foreground)",
                padding: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
                opacity: busy ? 0.5 : 1,
              }}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              )}
            </button>
          </div>
        </label>
        <button type="submit" disabled={busy}>{busy ? "Logging in..." : "Log in"}</button>
        {error && <p role="alert">{error}</p>}
      </form>
      <p className="auth-register"><Link href="/coach-register">Register as a coach</Link></p>
      <p className="auth-register"><Link href="/forgot-password">Forgot password?</Link></p>
    </main>
  );
}