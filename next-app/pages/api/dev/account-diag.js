import { prisma } from "../../../lib/prisma";
import { getSession } from "next-auth/react";
import { setSecurityHeaders } from "../../../lib/api-security";
import { isSerializableProps } from "next/dist/lib/is-serializable-props";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  const report = { steps: [] };
  const step = (n) => report.steps.push(n);
  try {
    step("get-session-real-cookie");
    const session = await getSession({ req });
    if (!session) return res.status(401).json({ ok: false, reason: "no-session", steps: report.steps });
    step("query-user");
    const user = await prisma.user.findUnique({
      where: { id: Number(session.user.id) },
      include: { coach: { include: { sports: { include: { sport: true } }, school: true } } },
    });
    step("query-sports");
    const sports = await prisma.sport.findMany({ where: { status: "active" }, select: { id: true, sportName: true }, orderBy: { sportName: "asc" } });
    step("build-props");
    const iso = (d) => (d instanceof Date ? d.toISOString() : d);
    const coach = user.coach
      ? {
          ...user.coach,
          birthdate: iso(user.coach.birthdate),
          dateRegistered: iso(user.coach.dateRegistered),
          createdAt: iso(user.coach.createdAt),
          updatedAt: iso(user.coach.updatedAt),
          sports: user.coach.sports.map((cs) => ({ ...cs, sport: cs.sport })),
        }
      : null;
    const props = {
      session,
      user: {
        ...user,
        lastLoginAt: iso(user.lastLoginAt),
        passwordChangedAt: iso(user.passwordChangedAt),
        createdAt: iso(user.createdAt),
        updatedAt: iso(user.updatedAt),
        coach,
      },
      sports,
    };
    step("run-next-serializer");
    try {
      isSerializableProps("/account", "getServerSideProps", props);
      report.serializer = "ok";
      report.ok = true;
    } catch (e) {
      report.serializer = "threw";
      report.ok = false;
      report.error = "NextSerializer: " + ((e && (e.stack || e.message)) || String(e));
    }
    report.sessionSummary = { keys: Object.keys(session || {}), userKeys: Object.keys(session?.user || {}), expires: session?.expires };
    report.userId = session?.user?.id;
    report.role = user?.role;
    report.hasCoach = Boolean(user?.coach);
    report.userKeys = Object.keys(user || {});
    report.sportsCount = (sports || []).length;
    return res.status(200).json(report);
  } catch (error) {
    report.ok = false;
    report.error = (error && (error.stack || error.message)) || String(error);
    return res.status(500).json(report);
  }
}