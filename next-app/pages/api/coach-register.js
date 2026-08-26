import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { sendCoachRegistrationNotice } from "../../lib/email";
import { requireCsrf, text, validId } from "../../lib/api-security";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const body = req.body || {};
  const firstName = text(body.firstName, 100, true);
  const middleName = text(body.middleName, 100) || null;
  const lastName = text(body.lastName, 100, true);
  const email = text(body.email, 191, true)?.toLowerCase();
  const password = String(body.password || "");
  const birthdate = text(body.birthdate, 10, true);
  const schoolId = validId(body.schoolId);
  const sportIds = Array.isArray(body.sportIds) ? [...new Set(body.sportIds.map(validId).filter(Boolean))] : [];
  const parsedBirthdate = birthdate && new Date(`${birthdate}T00:00:00Z`);
  const age = parsedBirthdate && Math.floor((Date.now() - parsedBirthdate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  if (!firstName || !lastName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10 || password.length > 200 || !birthdate || Number.isNaN(parsedBirthdate?.getTime()) || parsedBirthdate > new Date() || age < 18 || !schoolId || sportIds.length === 0 || sportIds.length > 20) return res.status(400).json({ error: "Complete all fields. Coaches must be at least 18 and select one or more sports." });

  const [school, sports] = await Promise.all([
    prisma.school.findFirst({ where: { id: schoolId, status: "active" }, select: { id: true } }),
    prisma.sport.findMany({ where: { id: { in: sportIds }, status: "active" }, select: { id: true } }),
  ]);
  if (!school || sports.length !== sportIds.length) return res.status(400).json({ error: "The selected school or sports are invalid." });

  const coachCode = `COA-${String((await prisma.coach.count()) + 1).padStart(6, "0")}`;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { username: coachCode, email, passwordHash: await bcrypt.hash(password, 12), role: "coach", status: "pending", mustChangePassword: false } });
      const coach = await tx.coach.create({ data: { userId: user.id, coachCode, firstName, middleName, lastName, birthdate: parsedBirthdate, email, schoolId, status: "active", dateRegistered: new Date(), sports: { create: sportIds.map((sportId) => ({ sportId })) } } });
      await tx.auditLog.create({ data: { action: "register", entityType: "coach", entityId: coach.id, description: `Coach registration submitted ${coachCode}` } });
      return coach;
    });
    try { await sendCoachRegistrationNotice({ email, name: `${firstName} ${lastName}`, coachCode }); } catch (emailError) { console.error("Coach registration email failed", emailError); }
    return res.status(201).json({ success: true, coachCode: created.coachCode, message: "Registration received. An administrator must approve your account before sign-in." });
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "That email or coach account already exists." });
    console.error("Coach registration failed", error);
    return res.status(500).json({ error: "Registration could not be completed." });
  }
}
