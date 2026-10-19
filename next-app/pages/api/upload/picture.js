import { put } from "@vercel/blob";
import { requireCsrf, requireSession, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

export const config = { api: { bodyParser: { sizeLimit: "2.5mb" } } };

const MAX_BYTES = 1024 * 1024;
const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireCsrf(req, res)) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`upload:${ip}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many uploads. Please try again later." });

  const { base64, mime } = req.body || {};
  if (!base64 || !mime || !ALLOWED[mime]) {
    return res.status(400).json({ error: "Attach a valid JPEG, PNG, or WEBP ID picture." });
  }
  const buf = Buffer.from(base64, "base64");
  if (!buf.length || buf.length > MAX_BYTES) {
    return res.status(400).json({ error: "The ID picture is empty or larger than 1 MB." });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: "Image storage is not configured on the server." });
  }

  try {
    const ext = ALLOWED[mime];
    const name = `id-photos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { url } = await put(name, buf, { access: "public", contentType: mime });
    return res.status(200).json({ url });
  } catch (error) {
    console.error("ID picture upload failed", error);
    return res.status(500).json({ error: "The ID picture could not be uploaded." });
  }
}
