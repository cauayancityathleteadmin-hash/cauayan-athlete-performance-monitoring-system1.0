import crypto from "crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../pages/api/auth/[...nextauth]";

export async function requireSession(req, res) {
  const origin = req.headers.origin;
  const expected = `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
  if (origin && origin !== expected) { res.status(403).json({ error: "Request origin rejected." }); return null; }
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) { res.status(401).json({ error: "Authentication required." }); return null; }
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

export function csrfToken(req, res) {
  const existing = req.cookies?.csrf_token;
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const token = crypto.randomBytes(32).toString("hex");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `csrf_token=${token}; Path=/; SameSite=Strict${secure}`);
  return token;
}

export function requireCsrf(req, res) {
  const cookie = req.cookies?.csrf_token;
  const header = req.headers["x-csrf-token"];
  if (!cookie || !header || cookie.length !== String(header).length || !crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(String(header)))) {
    res.status(403).json({ error: "CSRF validation failed." });
    return false;
  }
  return true;
}