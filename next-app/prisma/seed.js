require("dotenv/config");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const schools = {};
  for (const name of [
    "Cauayan City National High School",
    "Isabela National High School",
    "University of Cagayan Valley - Cauayan",
  ]) {
    schools[name] = await prisma.school.upsert({
      where: { schoolName: name },
      update: {},
      create: { schoolName: name },
    });
  }

  const sports = {};
  for (const name of ["Athletics", "Swimming", "Basketball", "Volleyball"]) {
    sports[name] = await prisma.sport.upsert({
      where: { sportName: name },
      update: {},
      create: { sportName: name },
    });
  }

  const eventData = [
    ["Athletics", "100m Sprint", "Track sprint assessment"],
    ["Athletics", "Long Jump", "Jump distance assessment"],
    ["Swimming", "50m Freestyle", "Pool sprint assessment"],
    ["Basketball", "5x5 Basketball", "Team basketball assessment"],
    ["Volleyball", "Indoor Volleyball", "Indoor volleyball assessment"],
  ];
  const events = {};
  for (const [sport, eventName, description] of eventData) {
    events[eventName] = await prisma.event.upsert({
      where: { sportId_eventName: { sportId: sports[sport].id, eventName } },
      update: {},
      create: { sportId: sports[sport].id, eventName, description },
    });
  }

  // Reference data (schools, sports, events, metrics) is always seeded idempotently.
  // Test users, coaches, athletes, assessments, and plans are created ONLY when
  // SEED_TEST_DATA=1 (local development). Never enable this flag on production.

  if (process.env.SEED_TEST_DATA !== "1") {
    console.log("[seed] SEED_TEST_DATA not set to 1 - skipping test accounts/data.");
    return;
  }

  const passwords = {
    admin: "$2b$12$nqhFfdEmHB.7.cfwpBvmfOrrSrN3D113tSih7tyzqMjOuMWc9fv2O",
    coachOne: "$2b$12$ZOK8PXOrt6glV.ue21Jc5uM.tkKYfCrWCM5TP6xJR33yZjx18XMPK",
    coachTwo: "$2b$12$5.pWGB5vXC94SEYh8tAyPeJ9lTIfyd4WODbUG7tzyJviQLRCMTNQ.",
    coachThree: "$2b$12$E0PWVvz0m5xsxFF1OhMwsePhcjmn9nvCEmG0w96tpCoXG8APnknXC",
  };

  const users = {};
  for (const [key, data] of Object.entries({
    admin: { username: "admin", email: "admin@cauayan.local", passwordHash: passwords.admin, role: "admin" },
    coachOne: { username: "msantos", email: "maria.santos@cauayan.local", passwordHash: passwords.coachOne, role: "coach" },
    coachTwo: { username: "rdelacruz", email: "roberto.delacruz@cauayan.local", passwordHash: passwords.coachTwo, role: "coach" },
    coachThree: { username: "ereyes", email: "elena.reyes@cauayan.local", passwordHash: passwords.coachThree, role: "coach" },
  })) {
    users[key] = await prisma.user.upsert({
      where: { email: data.email },
      update: { status: "active", passwordHash: data.passwordHash, mustChangePassword: data.role === "coach" },
      create: { ...data, status: "active", mustChangePassword: data.role === "coach" },
    });
  }

  const coachData = [
    ["coachOne", "COA-100001", "Maria", "Velasco", "Santos", schools["Cauayan City National High School"], "0917 111 0001"],
    ["coachTwo", "COA-100002", "Roberto", "Dela", "Cruz", schools["Isabela National High School"], "0917 111 0002"],
    ["coachThree", "COA-100003", "Elena", "Mendoza", "Reyes", schools["University of Cagayan Valley - Cauayan"], "0917 111 0003"],
  ];
  const coaches = {};
  for (const [userKey, coachCode, firstName, middleName, lastName, school, contactNumber] of coachData) {
    coaches[userKey] = await prisma.coach.upsert({
      where: { userId: users[userKey].id },
      update: { coachCode, status: "active", contactNumber },
      create: {
        userId: users[userKey].id, coachCode, firstName, middleName, lastName,
        birthdate: new Date("1985-04-12"), email: users[userKey].email,
        contactNumber,
        schoolId: school.id, dateRegistered: new Date("2026-01-01"),
      },
    });
  }

  for (const [coachKey, sportNames] of Object.entries({ coachOne: ["Athletics", "Swimming"], coachTwo: ["Basketball", "Volleyball"], coachThree: ["Athletics", "Basketball"] })) {
    for (const sportName of sportNames) {
      await prisma.coachSport.upsert({
        where: { coachId_sportId: { coachId: coaches[coachKey].id, sportId: sports[sportName].id } },
        update: {}, create: { coachId: coaches[coachKey].id, sportId: sports[sportName].id },
      });
    }
  }

  const athleteData = [
    ["ATH-100001", "Juan", "Pedro", "Dela Cruz", "Athletics", "100m Sprint", "coachOne", "Cauayan City National High School"],
    ["ATH-100002", "Ana", "Marie", "Santos", "Swimming", "50m Freestyle", "coachOne", "Cauayan City National High School"],
    ["ATH-100003", "Miguel", "Luis", "Reyes", "Athletics", "Long Jump", "coachOne", "Cauayan City National High School"],
    ["ATH-100004", "Carlo", "Ben", "Mendoza", "Basketball", "5x5 Basketball", "coachTwo", "Isabela National High School"],
    ["ATH-100005", "Sofia", "Luna", "Garcia", "Volleyball", "Indoor Volleyball", "coachTwo", "Isabela National High School"],
    ["ATH-100006", "Mark", "Jose", "Navarro", "Basketball", "5x5 Basketball", "coachTwo", "Isabela National High School"],
    ["ATH-100007", "Leah", "Grace", "Torres", "Athletics", "100m Sprint", "coachThree", "University of Cagayan Valley - Cauayan"],
    ["ATH-100008", "Paolo", "Nico", "Ramos", "Basketball", "5x5 Basketball", "coachThree", "University of Cagayan Valley - Cauayan"],
    ["ATH-100009", "Ivy", "Mae", "Flores", "Athletics", "Long Jump", "coachThree", "University of Cagayan Valley - Cauayan"],
  ];
  const athletes = [];
  for (const [athleteCode, firstName, middleName, lastName, sportName, eventName, coachKey, schoolName] of athleteData) {
    const athlete = await prisma.athlete.upsert({
      where: { athleteCode }, update: { status: "active" },
      create: {
        athleteCode, firstName, middleName, lastName, birthdate: new Date("2008-04-15"),
        gender: athletes.length % 2 ? "female" : "male", contactNumber: `091700000${athletes.length + 1}`,
        email: `${athleteCode.toLowerCase()}@cauayan.local`, address: "Cauayan City",
        schoolId: schools[schoolName].id, sportId: sports[sportName].id, eventId: events[eventName].id,
        coachId: coaches[coachKey].id, dateRegistered: new Date("2026-01-01"),
      },
    });
    athletes.push({ athlete, eventName });
  }

  const metrics = {};
  for (const [eventName, metricName, unit, dataType, direction] of [
    ["100m Sprint", "Time", "seconds", "decimal", "lower"],
    ["Long Jump", "Distance", "meters", "decimal", "higher"],
    ["50m Freestyle", "Time", "seconds", "decimal", "lower"],
    ["5x5 Basketball", "Points", "points", "integer", "higher"],
    ["Indoor Volleyball", "Points", "points", "integer", "higher"],
  ]) {
    metrics[eventName] = await prisma.performanceMetric.upsert({
      where: { eventId_metricName: { eventId: events[eventName].id, metricName } }, update: {},
      create: { eventId: events[eventName].id, metricName, unit, dataType, betterDirection: direction, isRequired: true },
    });
  }

  for (const { athlete, eventName } of athletes.slice(0, 5)) {
    const assessment = await prisma.assessment.upsert({
      where: { id: athlete.id },
      update: {},
      create: { athleteId: athlete.id, recordedBy: coaches.coachOne.userId, assessmentDate: new Date("2026-02-15"), remarks: "Seed assessment for analytics testing" },
    });
    await prisma.assessmentResult.upsert({
      where: { assessmentId_metricId: { assessmentId: assessment.id, metricId: metrics[eventName].id } },
      update: {},
      create: { assessmentId: assessment.id, metricId: metrics[eventName].id, valueDecimal: eventName.includes("Basketball") || eventName.includes("Volleyball") ? 18 : 12.45 },
    });
  }

  const plan = await prisma.eventPlan.upsert({
    where: { id: 1 }, update: { status: "open" },
    create: { eventName: "TEST - Cauayan City Sports Festival", description: "Sample plan for testing", startDate: new Date("2026-10-10"), endDate: new Date("2026-10-12"), venue: "Cauayan City Sports Complex", status: "open", programFlow: "Opening ceremony\nAthletics heats\nBasketball games", createdBy: users.admin.id },
  });
  for (const sportName of ["Athletics", "Basketball"]) {
    await prisma.eventPlanSport.upsert({ where: { eventPlanId_sportId: { eventPlanId: plan.id, sportId: sports[sportName].id } }, update: {}, create: { eventPlanId: plan.id, sportId: sports[sportName].id } });
  }
  await prisma.eventApplication.upsert({ where: { eventPlanId_coachId: { eventPlanId: plan.id, coachId: coaches.coachOne.id } }, update: { status: "approved" }, create: { eventPlanId: plan.id, coachId: coaches.coachOne.id, status: "approved", reviewedAt: new Date(), reviewedBy: users.admin.id } });
  const achievement = await prisma.achievement.findFirst({ where: { athleteId: athletes[0].athlete.id, achievementTitle: "City Meet Gold Medal" } });
  if (!achievement) await prisma.achievement.create({ data: { athleteId: athletes[0].athlete.id, achievementTitle: "City Meet Gold Medal", achievementType: "Gold", achievementDate: new Date("2026-02-20"), organization: "Cauayan City Sports Office", description: "Seed achievement for view testing" } });
  const audit = await prisma.auditLog.findFirst({ where: { action: "seed", entityType: "system" } });
  if (!audit) await prisma.auditLog.create({ data: { userId: users.admin.id, action: "seed", entityType: "system", description: "Initial test dataset created" } });
}

main().finally(() => prisma.$disconnect());