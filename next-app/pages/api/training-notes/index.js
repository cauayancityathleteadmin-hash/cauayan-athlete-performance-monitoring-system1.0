import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { notifyCoach } from "../../../lib/notify";

async function canAccessPlan(prismaClient, session, planId) {
  const plan = await prismaClient.trainingPlan.findUnique({ where: { id: planId }, select: { id: true, coachId: true } });
  if (!plan) return null;
  if (session.user.role === "admin") return plan;
  const coach = await prismaClient.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
  if (coach && plan.coachId === coach.id) return plan;
  return false;
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method === "GET") {
    const planId = validId(req.query.planId);
    if (!planId) return res.status(400).json({ error: "A valid planId is required." });
    const access = await canAccessPlan(prisma, session, planId);
    if (access === null) return res.status(404).json({ error: "Training plan not found." });
    if (access === false) return res.status(403).json({ error: "You do not have permission to view these notes." });

    const notes = await prisma.trainingNote.findMany({
      where: { planId },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, email: true, username: true, role: true } } },
    });
    return res.status(200).json(JSON.parse(JSON.stringify(notes)));
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const body = req.body || {};
  const action = body.action || "create";

  if (action === "create") {
    if (session.user.role !== "admin") return res.status(403).json({ error: "Only the administrator can post notes for coaches." });
    const planId = validId(body.planId);
    if (!planId) return res.status(400).json({ error: "A valid planId is required." });
    const access = await canAccessPlan(prisma, session, planId);
    if (access === null) return res.status(404).json({ error: "Training plan not found." });
    if (access === false) return res.status(403).json({ error: "Training plan not found." });

    const noteBody = text(body.body, 2000, true);
    if (!noteBody) return res.status(400).json({ error: "A comment body is required." });

    const note = await prisma.$transaction([
      prisma.trainingNote.create({ data: { planId, authorId: Number(session.user.id), body: noteBody } }),
      prisma.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "trainingNote", entityId: planId, description: `Added a note to training plan #${planId}` } }),
    ]);

    const planCoach = await prisma.trainingPlan.findUnique({ where: { id: planId }, select: { coach: { select: { id: true, firstName: true, lastName: true, email: true, contactNumber: true, notifySms: true, notifyEmail: true } } } });
    await notifyCoach({
      coach: planCoach ? planCoach.coach : null,
      subject: `New note on training plan #${planId}`,
      message: `Hello, the administrator added a new note to your training plan #${planId}. Sign in to the system to read it.`,
    });

    const full = await prisma.trainingNote.findUnique({ where: { id: note[0].id }, include: { author: { select: { id: true, email: true, username: true, role: true } } } });
    return res.status(201).json(JSON.parse(JSON.stringify(full)));
  }

  if (action === "delete") {
    if (session.user.role !== "admin") return res.status(403).json({ error: "Only the administrator can remove notes." });
    const noteId = validId(body.noteId);
    if (!noteId) return res.status(400).json({ error: "A valid noteId is required." });
    const note = await prisma.trainingNote.findUnique({ where: { id: noteId }, select: { id: true, authorId: true, planId: true } });
    if (!note) return res.status(404).json({ error: "Note not found." });
    if (note.authorId !== Number(session.user.id)) return res.status(403).json({ error: "You can only remove your own notes." });

    await prisma.trainingNote.delete({ where: { id: noteId } });
    await prisma.auditLog.create({
      data: { userId: Number(session.user.id), action: "delete", entityType: "trainingNote", entityId: noteId, description: `Removed a note from training plan #${note.planId}` },
    });
    return res.status(200).json({ success: true, message: "Note removed." });
  }

  return res.status(400).json({ error: "Unknown action." });
}