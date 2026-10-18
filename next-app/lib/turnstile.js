export function turnstileEnabled() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SITE_KEY);
}

export function turnstileSiteKey() {
  return process.env.TURNSTILE_SITE_KEY || "";
}

export async function verifyTurnstile(token) {
  if (!process.env.TURNSTILE_SECRET_KEY) return true;
  if (!token || typeof token !== "string") return false;
  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: "",
      }),
    });
    const data = await resp.json();
    return Boolean(data?.success);
  } catch (error) {
    // H-03 fix: fail closed on verification errors. If CAPTCHA is configured
    // but the check cannot be completed, reject rather than silently bypass.
    console.error("Turnstile verification failed:", error.message);
    return false;
  }
}
