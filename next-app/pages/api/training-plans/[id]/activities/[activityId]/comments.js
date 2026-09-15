import { prisma } from "../../../../../../lib/prisma";
import { requireCsrf, requireSession, validId, text, setSecurityHeaders } from "../../../../../../lib/api-security";
import { rateLimiters } from "../../../../../../lib/rate-limit";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (!["GET", "POST", "DELETE"].includes(req.method)) return res.status(405).json({ error: "Method not allowed." });

  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:activitycomments`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  const planId = validId(req.query?.id);
  const activityId = validId(req.query?.activityId);
  if (!planId || !activityId) return res.status(400).json({ error: "Invalid plan or activity ID." });

  const plan = await prisma.trainingPlan.findUnique({
    where: { id: planId },
    select: { id: true, coachId: true },
  });
  if (!plan) return res.status(404).json({ error: "Training plan not found." });

  const activity = await prisma.planActivity.findUnique({
    where: { id: activityId },
    select: { id: true, planId: true },
  });
  if (!activity || activity.planId !== planId) {
    return res.status(404).json({ error: "Activity not found in this plan." });
  }

  if (req.method === "POST") {
    if (!requireCsrf(req, res)) return;
    if (session.user.role !== "admin") return res.status(403).json({ error: "Only administrators can post activity comments." });
    const body = text(req.body?.body, 2000);
    if (!body) return res.status(400).json({ error: "Write a comment first." });

    const athleteId = validId(req.body?.athleteId);
    if (!athleteId) return res.status(400).json({ error: "This comment must be attached to an athlete in the plan." });

    const inPlan = await prisma.trainingPlanAthlete.findUnique({
      where: { planId_athleteId: { planId, athleteId } },
      select: { id: true },
    });
    if (!inPlan) return res.status(400).json({ error: "That athlete is not part of this training plan." });

    const comment = await prisma.activityPlanComment.create({
      data: { planId, activityId, athleteId, authorId: Number(session.user.id), body },
      include: {
        author: { select: { username: true, email: true, coach: { select: { firstName: true, lastName: true } } } },
        athlete: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return res.status(201).json({ comment: JSON.parse(JSON.stringify(comment)) });
  }

  if (req.method === "DELETE") {
    if (!requireCsrf(req, res)) return;
    if (session.user.role !== "admin") return res.status(403).json({ error: "Only administrators can delete comments." });
    const commentId = validId(req.body?.commentId);
    if (!commentId) return res.status(400).json({ error: "Missing comment ID." });

    const comment = await prisma.activityPlanComment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true, activityId: true },
    });
    if (!comment || comment.activityId !== activityId) {
      return res.status(404).json({ error: "Comment not found." });
    }
    if (comment.authorId !== Number(session.user.id)) {
      return res.status(403).json({ error: "You can only remove your own comments." });
    }
    await prisma.activityPlanComment.delete({ where: { id: commentId } });
    return res.status(200).json({ message: "Comment removed." });
  }

  if (session.user.role === "coach") {
    const [coach] = await Promise.all([
      prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } }),
    ]);
    const ownsPlan = coach && plan.coachId === coach.id;
    if (!ownsPlan) {
      return res.status(403).json({ error: "You do not have access to these comments." });
    }
  }

  const comments = await prisma.activityPlanComment.findMany({
    where: { activityId },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { username: true, email: true, coach: { select: { firstName: true, lastName: true } } } },
      athlete: { select: { id: true, firstName: true, lastName: true, athleteCode: true } },
    },
  });
  return res.status(200).json({ comments: JSON.parse(JSON.stringify(comments)) });
}
