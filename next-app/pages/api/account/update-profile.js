import { prisma } from "../../../lib/prisma";
import { requireSession, requireCsrf, text, validId, validateEmail } from "../../../lib/api-security";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const session = await requireSession(req, res);
    if (!session) return;

    await requireCsrf(req, res);
    if (res.headersSent) return;

    const body = req.body || {};
    const userId = Number(session.user.id);

    const firstName = text(body.firstName, 100);
    const middleName = text(body.middleName, 100) || null;
    const lastName = text(body.lastName, 100);
    const email = validateEmail(body.email);
    const schoolName = text(body.school, 191);
    const sportIds = Array.isArray(body.sportIds) ? [...new Set(body.sportIds.map(validId).filter(Boolean))] : [];

    const isCoach = session.user.role === "coach";
    const birthdate = isCoach ? text(body.birthdate, 10) : "";
    const parsedBirthdate = birthdate && new Date(`${birthdate}T00:00:00Z`);
    const age = parsedBirthdate && Math.floor((Date.now() - parsedBirthdate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "Complete all required fields." });
    }
    if (isCoach && (!birthdate || Number.isNaN(parsedBirthdate?.getTime()) || parsedBirthdate > new Date() || age < 18)) {
      return res.status(400).json({ error: "Complete all required fields. You must be at least 18 years old." });
    }

    const [emailExists, school] = await Promise.all([
      prisma.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } }),
      schoolName ? prisma.school.findFirst({ where: { schoolName: { equals: schoolName, mode: "insensitive" }, status: "active" }, select: { id: true } }) : Promise.resolve(null),
    ]);

    if (emailExists) return res.status(409).json({ error: "That email is already in use." });

    let schoolId = school?.id;
    if (schoolName && !schoolId) {
      const newSchool = await prisma.school.create({
        data: { schoolName: schoolName, status: "active" },
        select: { id: true },
      });
      schoolId = newSchool.id;
    }

    let sports = [];
    if (isCoach) {
      const coach = await prisma.coach.findUnique({ where: { userId }, select: { id: true } });
      if (coach && sportIds.length > 0) {
        sports = await prisma.sport.findMany({ where: { id: { in: sportIds }, status: "active" }, select: { id: true } });
        if (sports.length !== sportIds.length) return res.status(400).json({ error: "One or more selected sports are invalid." });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { email },
      });

      if (isCoach) {
        const coach = await tx.coach.findUnique({ where: { userId }, select: { id: true } });
        if (coach) {
          await tx.coach.update({
            where: { id: coach.id },
            data: {
              firstName,
              middleName,
              lastName,
              birthdate: parsedBirthdate,
              email,
              schoolId: schoolId || null,
            },
          });
          await tx.coachSport.deleteMany({ where: { coachId: coach.id } });
          if (sportIds.length > 0) {
            await tx.coachSport.createMany({ data: sportIds.map((sportId) => ({ coachId: coach.id, sportId })) });
          }
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: "update_profile",
        entityType: "user",
        entityId: userId,
        description: `Updated profile information`,
      },
    });

    return res.status(200).json({ success: true, message: "Profile updated successfully." });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({ error: "Failed to update profile.", detail: error instanceof Error ? error.message : String(error) });
  }
}