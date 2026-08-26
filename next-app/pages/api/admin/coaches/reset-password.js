import { prisma } from "../../../../lib/prisma";
import { requireSession, requireRole, requireCsrf, text } from "../../../../lib/api-security";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const session = await requireSession(req, res);
    if (!session) return;

    await requireRole(session, "admin", res);
    if (res.headersSent) return;

    await requireCsrf(req, res);
    if (res.headersSent) return;

    const { coachId } = req.body;
    if (!coachId || typeof coachId !== "number" || coachId <= 0) {
      return res.status(400).json({ error: "Invalid coach ID" });
    }

    const coach = await prisma.coach.findUnique({
      where: { id: coachId },
      include: { user: true },
    });

    if (!coach) {
      return res.status(404).json({ error: "Coach not found" });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: coach.userId },
        data: { mustChangePassword: true, passwordChangedAt: null },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "coach_password_reset",
          details: JSON.stringify({ coachId, coachEmail: coach.user.email }),
        },
      }),
    ]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error in reset coach password:", error);
    return res.status(500).json({ error: "Failed to reset password" });
  }
}
