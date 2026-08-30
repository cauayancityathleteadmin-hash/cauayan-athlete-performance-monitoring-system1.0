import { setSecurityHeaders } from "../../../lib/api-security";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed.", note: "probe" });
  return res.status(404).json({ error: "Not found.", note: "probe POST reached handler", method: req.method });
}
