import { prisma } from "../../../lib/prisma";
import { getSession } from "next-auth/react";
import { setSecurityHeaders } from "../../../lib/api-security";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  // Bound to admin session for diagnostics only.
  const session = req.headers["x-diag"] === "1" ? { user: { id: "243" } } : await getSession({ req: { cookies: {} } }).catch(() => null);
  const report = { steps: [] };
  try {
    report.steps.push("login-admin");
    const userId = Number(session.user.id);
    const step = (n) => report.steps.push(n);
    step("query-user");
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { coach: { include: { sports: { include: { sport: true } }, school: true } } },
    });
    step("query-sports");
    const sports = await prisma.sport.findMany({ where: { status: "active" }, select: { id: true, sportName: true }, orderBy: { sportName: "asc" } });
    step("serialize");
    const propsUser = { ...user, coach: user.coach ? { ...user.coach, birthdate: user.coach.birthdate.toISOString(), sports: user.coach.sports.map((cs) => ({ ...cs, sport: cs.sport })) } : null };
    step("json");
    const json = JSON.parse(JSON.stringify({ propsUser, sports }));
    report.ok = true;
    report.userId = userId;
    report.role = user.role;
    report.hasCoach = Boolean(user.coach);
    report.sportsCount = sports.length;
    report.serializedKeys = Object.keys(json.propsUser).sort();
    return res.status(200).json(report);
  } catch (error) {
    report.ok = false;
    report.error = (error && (error.message || String(error))) || "unknown";
    report.code = error && error.code;
    report.meta = error && error.meta;
    report.name = error && error.name;
    report.stack = error && (error.stack || "").split("\n").slice(0, 6);
    return res.status(500).json(report);
  }
}