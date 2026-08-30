import bcrypt from "bcryptjs";
import { prisma } from "../../../lib/prisma";
import { setSecurityHeaders } from "../../../lib/api-security";

const PROVISION_KEY = process.env.SEED_PROVISION_KEY || "";

async function findOrCreateSchool(name) {
  let school = await prisma.school.findFirst({
    where: { schoolName: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (!school) school = await prisma.school.create({ data: { schoolName: name, status: "active" }, select: { id: true } });
  return school;
}

async function findOrCreateSport(name) {
  let sport = await prisma.sport.findFirst({
    where: { sportName: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (!sport) sport = await prisma.sport.create({ data: { sportName: name, status: "active" }, select: { id: true } });
  return sport;
}

async function provisionCoach({ username, email, password, firstName, lastName, schoolName, sportNames, coachIndex }) {
  const school = await findOrCreateSchool(schoolName);
  const passwordHash = await bcrypt.hash(password, 12);
  const coachCode = `COA-${String(100000 + coachIndex)}`;

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: { passwordHash, status: "active", mustChangePassword: false, role: "coach" },
      create: { username, email, passwordHash, role: "coach", status: "active", mustChangePassword: false },
      select: { id: true },
    });
    const coach = await tx.coach.upsert({
      where: { userId: user.id },
      update: { coachCode, schoolId: school.id, status: "active", firstName, lastName, email },
      create: {
        userId: user.id, coachCode, firstName, middleName: null, lastName,
        birthdate: new Date("1990-01-01"), email, contactNumber: `0917 000 00${coachIndex}`,
        schoolId: school.id, status: "active", dateRegistered: new Date(),
      },
      select: { id: true },
    });
    for (const sportName of sportNames) {
      const sport = await findOrCreateSport(sportName);
      await tx.coachSport.upsert({
        where: { coachId_sportId: { coachId: coach.id, sportId: sport.id } },
        update: {},
        create: { coachId: coach.id, sportId: sport.id },
      });
    }
    return coachCode;
  });

  return { coachCode, username, email, password };
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  if (!PROVISION_KEY) return res.status(404).json({ error: "Not found." });
  const provided = req.headers["x-provision-key"];
  if (!provided || provided !== PROVISION_KEY) return res.status(404).json({ error: "Not found." });

  try {
    const adminEmail = "admin.101@cauayan.local";
    const adminPasswordHash = await bcrypt.hash("admin.101", 12);
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { username: "admin.101", passwordHash: adminPasswordHash, role: "admin", status: "active", mustChangePassword: false },
      create: { username: "admin.101", email: adminEmail, passwordHash: adminPasswordHash, role: "admin", status: "active", mustChangePassword: false },
    });

    const coachDefs = [
      ["coach.a", "coach.a@cauayan.local", "UpgradeCoachA1!", "CoachA", "Test", "Cauayan Test HS A", ["Athletics", "Swimming"]],
      ["coach.b", "coach.b@cauayan.local", "UpgradeCoachB2!", "CoachB", "Test", "Cauayan Test HS B", ["Basketball", "Volleyball"]],
      ["coach.c", "coach.c@cauayan.local", "UpgradeCoachC3!", "CoachC", "Test", "Cauayan Test HS C", ["Athletics", "Basketball"]],
      ["coach.d", "coach.d@cauayan.local", "UpgradeCoachD4!", "CoachD", "Test", "Cauayan Test HS D", ["Volleyball", "Swimming"]],
      ["coach.e", "coach.e@cauayan.local", "UpgradeCoachE5!", "CoachE", "Test", "Cauayan Test HS E", ["Basketball", "Athletics"]],
    ];

    const coaches = [];
    for (let i = 0; i < coachDefs.length; i += 1) {
      const [username, email, password, firstName, lastName, schoolName, sports] = coachDefs[i];
      coaches.push(await provisionCoach({
        username, email, password, firstName, lastName, schoolName, sportNames: sports, coachIndex: i + 1,
      }));
    }

    return res.status(200).json({
      success: true,
      message: "Test accounts provisioned. For testing only — remove SEED_PROVISION_KEY and this route before launch.",
      admin: { username: "admin.101", email: adminEmail, password: "admin.101" },
      coaches,
    });
  } catch (error) {
    console.error("Provision failed", error);
    return res.status(500).json({ error: "Provisioning failed." });
  }
}
