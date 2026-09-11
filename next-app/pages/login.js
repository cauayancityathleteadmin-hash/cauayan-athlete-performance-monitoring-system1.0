import { useRef, useState } from "react";
import Head from "next/head";
import { signIn } from "next-auth/react";
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
      const result = await signIn("credentials", { identifier, password, redirect: false });
      if (!result || result.error) {
        if (result?.error === "PENDING_APPROVAL") {
          setError("Your application is still under review. You'll receive an email or SMS once an admin or authorized coach approves your account.");
        } else {
          setError("Login failed. Check your credentials or try again later.");
        }
      } else if (result.ok) {
        const cb = typeof router.query.callbackUrl === "string" ? router.query.callbackUrl : "";
        if (cb && cb.startsWith("/") && !cb.startsWith("//") && !cb.startsWith("/api/auth/")) {
          router.push(cb);
        } else {
          router.push("/dashboard");
        }
      } else {
        setError("Login failed. Check your credentials or try again later.");
      }
    } catch (err) {
      setError("Unable to sign in. Please try again later.");
    }
    setBusy(false);
  }

  return (
    <main className="login-page">
      <Head><title>Sign in | Cauayan Athlete Performance</title></Head>
      <img src="/sports_logo.png" alt="Cauayan City Sports" className="logo" />
      <p className="auth-kicker">Cauayan City</p>
      <h1>Athlete Performance System</h1>
      <p className="auth-subtitle">Secure monitoring platform</p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="identifier">Username, email, coach code, or ID</label>
        <input
          id="identifier"
          name="identifier"
          ref={identifierRef}
          required
          autoComplete="username"
          maxLength="191"
        />
        <label htmlFor="password">Password</label>
        <div style={{ position: "relative" }}>
          <input
            id="password"
            name="password"
            ref={passwordRef}
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            maxLength="200"
            style={{ paddingRight: "52px" }}
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
        <button type="submit" disabled={busy}>{busy ? "Logging in..." : "Log in"}</button>
        {error && <p role="alert">{error}</p>}
      </form>
      <p className="auth-register"><Link href="/coach-register">Register as a coach</Link></p>
      <p className="auth-register" style={{ marginTop: "8px" }}><Link href="/forgot-password">Forgot password?</Link></p>
    </main>
  );
}