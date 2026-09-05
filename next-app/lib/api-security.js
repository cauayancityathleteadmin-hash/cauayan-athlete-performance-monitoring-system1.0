import crypto from "crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../pages/api/auth/[...nextauth]";

export function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

export async function requireSession(req, res) {
  setSecurityHeaders(res);
  const origin = req.headers.origin;
  const expected = `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
  if (origin && origin !== expected) {
    res.status(403).json({ error: "Request origin rejected." });
    return null;
  }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }
  return session;
}

export function text(value, max, required = false) {
  if (typeof value !== "string") return required ? null : "";
  const clean = value.trim();
  return clean && clean.length <= max ? clean : (required ? null : "");
}

export function requireRole(session, role, res) {
  if (session.user.role !== role) {
    res.status(403).json({ error: "You do not have permission for this action." });
    return false;
  }
  return true;
}

export function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function validateEmail(email) {
  if (typeof email !== "string") return false;
  const clean = email.trim().toLowerCase();
  return clean.length <= 191 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : null;
}

export function sanitizeInput(value, maxLength = 1000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength).replace(/[<>]/g, "");
}

export function csrfToken(req, res) {
  const existing = req.cookies?.csrf_token;
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const token = crypto.randomBytes(32).toString("hex");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `csrf_token=${token}; Path=/; SameSite=Strict${secure}; HttpOnly`);
  return token;
}

export function requireCsrf(req, res) {
  setSecurityHeaders(res);
  const cookie = req.cookies?.csrf_token;
  const header = req.headers["x-csrf-token"];
  if (!cookie || !header || cookie.length !== String(header).length || !crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(String(header)))) {
    res.status(403).json({ error: "CSRF validation failed." });
    return false;
  }
  return true;
}