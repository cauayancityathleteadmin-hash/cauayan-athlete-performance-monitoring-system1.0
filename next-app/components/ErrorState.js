import Head from "next/head";
import Link from "next/link";

/**
 * Themed, friendly error surface used by pages/404.js, pages/500.js and
 * pages/_error.js so users never see Next's unstyled white default screen.
 */
export default function ErrorState({ statusCode, title, message }) {
  const is404 = statusCode === 404;
  const heading = title || (is404 ? "Page not found" : "Something went wrong");
  const body =
    message ||
    (is404
      ? "The page you are looking for does not exist or may have been moved."
      : "An unexpected error occurred. Please try again. If it keeps happening, contact the system administrator.");

  const primary = {
    flex: "1 1 auto",
    textAlign: "center",
    padding: "var(--space-3) var(--space-5)",
    borderRadius: "var(--radius-md)",
    background: "var(--accent)",
    color: "#041f18",
    fontWeight: 700,
  };
  const secondary = {
    flex: "1 1 auto",
    textAlign: "center",
    padding: "var(--space-3) var(--space-5)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    color: "var(--muted)",
    fontWeight: 600,
  };

  return (
    <main className="login-page">
      <Head>
        <title>{statusCode ? `${statusCode} | ` : ""}Cauayan Athlete Performance</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="auth-logos">
        <img src="/cauayan logo.png" alt="Official Seal of the City Government of Cauayan" className="logo" />
        <img src="/sports_logo.png" alt="Cauayan City Sports" className="logo" />
      </div>
      <p className="auth-kicker">Cauayan City</p>
      <h1>
        {statusCode ? `${statusCode} — ` : ""}
        {heading}
      </h1>
      <p className="auth-subtitle">{body}</p>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", justifyContent: "center", width: "100%", marginTop: "var(--space-2)" }}>
        <Link href="/dashboard" style={primary}>
          Back to dashboard
        </Link>
        <Link href="/login" style={secondary}>
          Sign in
        </Link>
      </div>
    </main>
  );
}
