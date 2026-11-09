import { put } from "@vercel/blob";
import { requireCsrf, requireRole, requireSession, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { detectImage } from "../../../lib/image-validation";

export const config = { api: { bodyParser: { sizeLimit: "2.5mb" } } };

const MAX_BYTES = 1024 * 1024;
const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Admin-only upload for a signatory's signature / e-signature image. Kept
// separate from the ID-picture endpoint so a signature can never be uploaded
// (or overwritten) by a non-admin account.
export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireRole(session, "admin", res)) return;
  if (!requireCsrf(req, res)) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`signatory-signature:${ip}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many uploads. Please try again later." });

  const { base64, mime } = req.body || {};
  if (!base64 || !mime || !ALLOWED[mime]) {
    return res.status(400).json({ error: "Attach a valid PNG, JPG, or WEBP signature image." });
  }
  const buf = Buffer.from(base64, "base64");
  if (!buf.length || buf.length > MAX_BYTES) {
    return res.status(400).json({ error: "The signature image is empty or larger than 1 MB." });
  }
  const detected = detectImage(buf);
  if (!detected) {
    return res.status(400).json({ error: "The file content is not a valid PNG, JPG, or WEBP image." });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: "Image storage is not configured on the server." });
  }

  try {
    const { ext, mime: realMime } = detected;
    const name = `signatures/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { url } = await put(name, buf, { access: "public", contentType: realMime });
    return res.status(200).json({ url });
  } catch (error) {
    console.error("Signature image upload failed", error);
    return res.status(500).json({ error: "The signature image could not be uploaded." });
  }
}
