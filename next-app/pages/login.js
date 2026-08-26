import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/router";

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const result = await signIn("credentials", { identifier: form.get("identifier"), password: form.get("password"), redirect: false });
    if (result?.error) setError("Login failed. Check your credentials or try again later.");
    else router.push("/dashboard");
    setBusy(false);
  }
  return <main><p className="auth-kicker">Cauayan City</p><h1>Athlete Performance</h1><p className="auth-subtitle">Secure monitoring system</p><form onSubmit={submit} noValidate><label htmlFor="identifier">Username, email, or coach code</label><input id="identifier" name="identifier" required autoComplete="username" maxLength="191" /><label htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" maxLength="200" /><button disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>{error && <p role="alert">{error}</p>}</form></main>;
}