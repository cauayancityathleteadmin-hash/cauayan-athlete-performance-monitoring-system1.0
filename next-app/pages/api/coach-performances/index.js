import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";

const EVAL_FIELDS = ["sessionPlanning", "exerciseSelection", "technicalInstruction", "athleteDevelopment", "communication", "safetyCompliance"];

function score(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 5 ? n : fallback;
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method === "GET") {
    const evals = await prisma.coachPerformance.findMany({
      orderBy: { createdAt: "desc" },
      include: { coach: { select: { id: true, coachCode: true, firstName: true, lastName: true } }, evaluator: { select: { id: true, email: true, username: true } } },
    });
    return res.status(200).json(JSON.parse(JSON.stringify(evals)));
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;
  if (!requireRole(session, "admin", res)) return;

  const body = req.body || {};
  const coachId = validId(body.coachId);
  const periodStart = text(body.periodStart, 10, true);
  const periodEnd = text(body.periodEnd, 10, true);
  if (!coachId || !periodStart || !periodEnd) return res.status(400).json({ error: "Coach and evaluation period are required." });
  const coach = await prisma.coach.findUnique({ where: { id: coachId, status: "active" }, select: { id: true, coachCode: true } });
  if (!coach) return res.status(400).json({ error: "Selected coach is invalid." });

  const sessionPlanning = score(body.sessionPlanning, 0);
  const exerciseSelection = score(body.exerciseSelection, 0);
  const technicalInstruction = score(body.technicalInstruction, 0);
  const athleteDevelopment = score(body.athleteDevelopment, 0);
  const communication = score(body.communication, 0);
  const safetyCompliance = score(body.safetyCompliance, 0);
  const overallScore = ((sessionPlanning + exerciseSelection + technicalInstruction + athleteDevelopment + communication + safetyCompliance) / 6);

  const created = await prisma.$transaction(async (tx) => {
    const e = await tx.coachPerformance.create({
      data: {
        coachId,
        evaluatorId: Number(session.user.id),
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        sessionPlanning,
        exerciseSelection,
        technicalInstruction,
        athleteDevelopment,
        communication,
        safetyCompliance,
        overallScore: Math.round(overallScore * 10) / 10,
        strengths: text(body.strengths, 2000) || null,
        areasForImprovement: text(body.areasForImprovement, 2000) || null,
        actionPlan: text(body.actionPlan, 2000) || null,
      },
      select: { id: true },
    });
    await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "coachPerformance", entityId: e.id, description: `Evaluated coach ${coach.coachCode}` } });
    return e.id;
  });

  const full = await prisma.coachPerformance.findUnique({ where: { id: created }, include: { coach: { select: { id: true, coachCode: true, firstName: true, lastName: true } }, evaluator: { select: { id: true, username: true, email: true } } } });
  return res.status(201).json(JSON.parse(JSON.stringify(full)));
}