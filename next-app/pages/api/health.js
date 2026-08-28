import { prisma } from "../../lib/prisma";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: "ok", db: "up", uptimeSec: Math.round(process.uptime()), latencyMs: Date.now() - started, service: "cauayan-athlete-performance" });
  } catch (err) {
    console.error("health check failed:", err);
    return res.status(503).json({ status: "degraded", db: "down", latencyMs: Date.now() - started, service: "cauayan-athlete-performance" });
  }
}
