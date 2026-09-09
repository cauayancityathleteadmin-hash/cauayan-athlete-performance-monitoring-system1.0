import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, text, validId, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { notifyCoach } from "../../../lib/notify";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed." });

  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:transfers`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method === "GET") {
    if (session.user.role === "admin") {
      const [claims, history] = await Promise.all([
        prisma.athleteTransfer.findMany({
          where: { fromCoachId: null, status: "pending" },
          orderBy: { createdAt: "asc" },
          include: {
            athlete: {
              select: {
                id: true, athleteCode: true, firstName: true, lastName: true,
                sport: { select: { sportName: true } },
                event: { select: { eventName: true } },
              },
            },
            toCoach: { select: { id: true, firstName: true, lastName: true, coachCode: true, school: { select: { schoolName: true } } } },
          },
        }),
        prisma.athleteTransfer.findMany({
          where: { status: { in: ["approved", "rejected", "cancelled"] } },
          orderBy: { decidedAt: "desc" },
          take: 25,
          include: {
            athlete: { select: { id: true, firstName: true, lastName: true, athleteCode: true } },
            toCoach: { select: { id: true, firstName: true, lastName: true } },
          },
        }),
      ]);
      return res.status(200).json(JSON.parse(JSON.stringify({ claims, history })));
    }

    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach) return res.status(403).json({ error: "Your account is not linked to a coach profile." });

    const [received, sent] = await Promise.all([
      prisma.athleteTransfer.findMany({
        where: { toCoachId: coach.id, status: "pending", fromCoachId: { not: null } },
        orderBy: { createdAt: "asc" },
        include: {
          athlete: {
            select: {
              id: true, athleteCode: true, firstName: true, lastName: true,
              sport: { select: { sportName: true } },
              event: { select: { eventName: true } },
            },
          },
          fromCoach: { select: { id: true, firstName: true, lastName: true, coachCode: true } },
        },
      }),
      prisma.athleteTransfer.findMany({
        where: { OR: [{ requestedBy: Number(session.user.id) }, { fromCoachId: coach.id }] },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          athlete: { select: { id: true, athleteCode: true, firstName: true, lastName: true } },
          toCoach: { select: { id: true, firstName: true, lastName: true, coachCode: true } },
          fromCoach: { select: { id: true, firstName: true, lastName: true, coachCode: true } },
        },
      }),
    ]);
    return res.status(200).json(JSON.parse(JSON.stringify({ received, sent })));
  }

  if (!requireRole(session, "coach", res)) return;
  if (!requireCsrf(req, res)) return;

  const athleteId = validId(req.body?.athleteId);
  const toCoachId = validId(req.body?.toCoachId);
  const reason = text(req.body?.reason, 500) || null;
  if (!athleteId || !toCoachId) return res.status(400).json({ error: "Athlete and target coach are required." });

  const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) } });
  if (!coach || coach.status !== "active") return res.status(403).json({ error: "Your coach account is not active." });

  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { id: true, athleteCode: true, firstName: true, lastName: true, coachId: true },
  });
  if (!athlete) return res.status(404).json({ error: "Athlete not found." });

  const target = await prisma.coach.findUnique({ where: { id: toCoachId }, select: { id: true, status: true } });
  if (!target || target.status !== "active") return res.status(400).json({ error: "The target coach account is not active." });
  if (target.id === coach.id) return res.status(400).json({ error: "You cannot request an athlete for yourself." });

  const isClaim = athlete.coachId === null;
  if (!isClaim && athlete.coachId !== coach.id) {
    return res.status(403).json({ error: "You can only request athletes assigned to you." });
  }

  const dup = await prisma.athleteTransfer.findFirst({ where: { athleteId: athlete.id, status: "pending" }, select: { id: true } });
  if (dup) return res.status(409).json({ error: "There is already a pending request for this athlete." });

  const transfer = await prisma.athleteTransfer.create({
    data: {
      athleteId: athlete.id,
      fromCoachId: athlete.coachId,
      toCoachId,
      requestedBy: Number(session.user.id),
      reason,
    },
    include: {
      athlete: { select: { firstName: true, lastName: true, athleteCode: true } },
      toCoach: { select: { firstName: true, lastName: true } },
    },
  });

  if (!isClaim) {
    const receiver = await prisma.coach.findUnique({
      where: { id: toCoachId },
      select: { firstName: true, lastName: true, email: true, contactNumber: true, notifySms: true, notifyEmail: true },
    });
    await notifyCoach({
      coach: receiver,
      subject: "Athlete transfer request",
      message: `${coach.firstName} ${coach.lastName} requested to transfer ${athlete.firstName} ${athlete.lastName} (${athlete.athleteCode}) to your roster.`,
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: Number(session.user.id),
      action: isClaim ? "claim" : "transfer_request",
      entityType: "athlete",
      entityId: athlete.id,
      description: `${isClaim ? "Claimed uncoached athlete" : "Requested transfer of athlete"} ${athlete.athleteCode} to coach #${toCoachId}${reason ? `: ${reason}` : ""}`,
    },
  });

  return res.status(201).json({
    success: true,
    transfer: JSON.parse(JSON.stringify(transfer)),
    message: isClaim ? "Request sent to the administrator for approval." : "Transfer request sent to the coach.",
  });
}