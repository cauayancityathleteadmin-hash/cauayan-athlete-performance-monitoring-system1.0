require("dotenv/config");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Reference data (always seeded, idempotent)
// ---------------------------------------------------------------------------

async function seedReferenceData() {
  const schools = {};
  for (const name of [
    "Cauayan City National High School",
    "Isabela National High School",
    "University of Cagayan Valley - Cauayan",
    "Cauayan City Science High School",
    "Burgos National High School",
    "St. Michael Institute of Cauayan",
  ]) {
    schools[name] = await prisma.school.upsert({
      where: { schoolName: name },
      update: {},
      create: { schoolName: name },
    });
  }

  const sports = {};
  for (const [name, description] of [
    ["Athletics", "Track and field events including sprints, jumps, and throws"],
    ["Swimming", "Competitive swimming events in the pool"],
    ["Basketball", "Indoor 5x5 basketball competition"],
    ["Volleyball", "Indoor team volleyball competition"],
    ["Badminton", "Racket sport played in singles and doubles"],
    ["Baseball", "Bat-and-ball team sport"],
  ]) {
    sports[name] = await prisma.sport.upsert({
      where: { sportName: name },
      update: { description },
      create: { sportName: name, description },
    });
  }

  const eventData = [
    ["Athletics", "100m Sprint", "Track sprint assessment"],
    ["Athletics", "200m Sprint", "Track double-lap sprint assessment"],
    ["Athletics", "Long Jump", "Jump distance assessment"],
    ["Athletics", "Shot Put", "Throw distance assessment"],
    ["Swimming", "50m Freestyle", "Pool sprint assessment"],
    ["Swimming", "100m Butterfly", "Pool butterfly stroke assessment"],
    ["Swimming", "200m Breaststroke", "Pool breaststroke endurance assessment"],
    ["Basketball", "5x5 Basketball", "Team basketball assessment"],
    ["Volleyball", "Indoor Volleyball", "Indoor volleyball assessment"],
    ["Badminton", "Singles", "Badminton singles assessment"],
    ["Baseball", "9-Inning Game", "Baseball full game assessment"],
  ];
  const events = {};
  for (const [sport, eventName, description] of eventData) {
    events[eventName] = await prisma.event.upsert({
      where: { sportId_eventName: { sportId: sports[sport].id, eventName } },
      update: {},
      create: { sportId: sports[sport].id, eventName, description },
    });
  }

  const metricData = [
    ["100m Sprint", "Time", "seconds", "decimal", "lower", 1, 8, 14, true],
    ["200m Sprint", "Time", "seconds", "decimal", "lower", 1, 18, 30, true],
    ["Long Jump", "Distance", "meters", "decimal", "higher", 2, 2, 8, true],
    ["Shot Put", "Distance", "meters", "decimal", "higher", 2, 4, 16, true],
    ["50m Freestyle", "Time", "seconds", "decimal", "lower", 1, 22, 40, true],
    ["100m Butterfly", "Time", "seconds", "decimal", "lower", 1, 55, 90, true],
    ["200m Breaststroke", "Time", "seconds", "decimal", "lower", 1, 120, 200, true],
    ["5x5 Basketball", "Points", "points", "integer", "higher", 0, 0, 50, true],
    ["Indoor Volleyball", "Points", "points", "integer", "higher", 0, 0, 40, true],
    ["Singles", "Points", "points", "integer", "higher", 0, 0, 21, true],
    ["9-Inning Game", "Points", "points", "integer", "higher", 0, 0, 20, true],
  ];
  const metrics = {};
  for (const [eventName, metricName, unit, dataType, direction, decimalPlaces, min, max, isRequired] of metricData) {
    metrics[eventName] = await prisma.performanceMetric.upsert({
      where: { eventId_metricName: { eventId: events[eventName].id, metricName } },
      update: {},
      create: {
        eventId: events[eventName].id,
        metricName,
        unit,
        dataType,
        betterDirection: direction,
        decimalPlaces,
        minimumValue: min,
        maximumValue: max,
        isRequired,
      },
    });
  }

  const pointsConfig = [
    ["gold", "intramural", 5], ["gold", "district", 10], ["gold", "regional", 15], ["gold", "national", 20], ["gold", "international", 30],
    ["silver", "intramural", 3], ["silver", "district", 7], ["silver", "regional", 10], ["silver", "national", 15], ["silver", "international", 20],
    ["bronze", "intramural", 1], ["bronze", "district", 4], ["bronze", "regional", 6], ["bronze", "national", 8], ["bronze", "international", 12],
    ["participation", "district", 1], ["participation", "regional", 2], ["participation", "national", 3], ["participation", "international", 4],
  ];
  for (const [medal, level, points] of pointsConfig) {
    await prisma.pointsConfig.upsert({
      where: { medal_level: { medal, level } },
      update: { points },
      create: { medal, level, points },
    });
  }

  const settings = [
    ["pointsConfigEnabled", "true"],
    ["sportsOffice", "City Sports Development Office - Cauayan City"],
    ["eventReminderDays", "7"],
    ["trainingAssessmentScale", "10"],
  ];
  for (const [key, value] of settings) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  return { schools, sports, events, metrics };
}

// ---------------------------------------------------------------------------
// Helpers for test data
// ---------------------------------------------------------------------------

const TEST_PASSWORD_COACH = "CoachTest2026!";
const TEST_PASSWORD_ADMIN = "AdminTest2026!";

function hash(pw) {
  return bcrypt.hashSync(pw, 12);
}

async function ensureUser({ username, email, password, role, status = "active", mustChangePassword = false, canApproveCoaches = false }) {
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash(password), status, role, mustChangePassword, username: username || email.split("@")[0] },
    create: {
      username: username || email.split("@")[0],
      email,
      passwordHash: hash(password),
      role,
      status,
      mustChangePassword,
    },
  });
}

async function ensureCoach({ user, coachCode, firstName, middleName, lastName, suffix = null, birthdate, email, contactNumber, school, sportNames, status = "active", dateRegistered, canApproveCoaches = false }) {
  const coach = await prisma.coach.upsert({
    where: { userId: user.id },
    update: { coachCode, firstName, middleName, lastName, suffix, email, contactNumber, status, canApproveCoaches },
    create: {
      userId: user.id,
      coachCode,
      firstName,
      middleName,
      lastName,
      suffix,
      birthdate,
      email,
      contactNumber,
      schoolId: school ? school.id : null,
      status,
      dateRegistered,
      canApproveCoaches,
      notifySms: true,
      notifyEmail: true,
    },
  });
  for (const sportName of sportNames) {
    const sport = await prisma.sport.findUnique({ where: { sportName: sportName } });
    if (sport) {
      await prisma.coachSport.upsert({
        where: { coachId_sportId: { coachId: coach.id, sportId: sport.id } },
        update: {},
        create: { coachId: coach.id, sportId: sport.id },
      });
    }
  }
  return coach;
}

async function ensureAthlete({ athleteCode, firstName, middleName, lastName, suffix = null, birthdate, gender, contactNumber, email, address, school, sportName, eventName, coach = null, status = "active", dateRegistered, height = null, weight = null, healthStatus = "healthy", healthNotes = null, pictureUrl = null }) {
  const sport = await prisma.sport.findUnique({ where: { sportName: sportName } });
  const event = eventName ? await prisma.event.findUnique({
    where: { sportId_eventName: { sportId: sport.id, eventName } },
  }) : null;
  const base = {
    athleteCode,
    firstName, middleName: middleName || null, lastName, suffix,
    birthdate, gender, contactNumber, email: email || null, address: address || null,
    schoolId: school ? school.id : null,
    sportId: sport.id,
    eventId: event ? event.id : null,
    coachId: coach ? coach.id : null,
    status, dateRegistered, height: height || null, weight: weight || null,
    healthStatus, healthNotes: healthNotes || null, pictureUrl: pictureUrl || null,
  };
  return prisma.athlete.upsert({
    where: { athleteCode },
    update: { status, coachId: coach ? coach.id : null, healthStatus, sportId: sport.id },
    create: base,
  });
}

async function ensureCoachSportLink(coach, sportName) {
  const sport = await prisma.sport.findUnique({ where: { sportName } });
  if (!sport) return;
  await prisma.coachSport.upsert({
    where: { coachId_sportId: { coachId: coach.id, sportId: sport.id } },
    update: {},
    create: { coachId: coach.id, sportId: sport.id },
  });
}

async function once(client, model, findWhere, createData) {
  const existing = await client[model].findFirst({ where: findWhere });
  if (existing) return existing;
  return client[model].create({ data: createData });
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

async function seedTestData(ref) {
  const { schools, sports, events, metrics } = ref;
  console.log("[seed] Seeding comprehensive test data...");

  // --- Users & coaches -----------------------------------------------------
  const admin = await ensureUser({
    username: "admin", email: "admin@cauayan.local",
    password: TEST_PASSWORD_ADMIN, role: "admin", status: "active", mustChangePassword: false,
  });

  const coachUsers = {};
  const coachRegs = [
    ["coachOne", "msantos", "maria.santos@cauayan.local", "COA-100001", "Maria", "Velasco", "Santos", "1985-04-12", "0917 111 0001"],
    ["coachTwo", "rdelacruz", "roberto.delacruz@cauayan.local", "COA-100002", "Roberto", "Dela", "Cruz", "1980-09-23", "0917 111 0002"],
    ["coachThree", "ereyes", "elena.reyes@cauayan.local", "COA-100003", "Elena", "Mendoza", "Reyes", "1988-01-15", "0917 111 0003"],
    ["coachFour", "jramos", "jose.ramos@cauayan.local", "COA-100004", "Jose", "Martin", "Ramos", "1983-07-30", "0917 111 0004"],
    ["coachFive", "rosdiaz", "rosa.diaz@cauayan.local", "COA-100005", "Rosa", "Bautista", "Diaz", "1990-11-05", "0917 111 0005"],
    ["coachSix", "testcoach", "test.coach@cauayan.local", "COA-000011", "Test", "Coach", "Lastname", "1990-01-01", "0917 111 0011"],
  ];
  for (const [key, username, email, code, first, middle, last, bday, contact] of coachRegs) {
    const user = await ensureUser({
      username, email, password: TEST_PASSWORD_COACH, role: "coach", status: "active", mustChangePassword: true,
    });
    coachUsers[key] = user;
  }

  const coaches = {};
  const coachProfiles = [
    ["coachOne", schools["Cauayan City National High School"], ["Athletics", "Swimming"]],
    ["coachTwo", schools["Isabela National High School"], ["Basketball", "Volleyball"]],
    ["coachThree", schools["University of Cagayan Valley - Cauayan"], ["Athletics", "Basketball"]],
    ["coachFour", schools["Cauayan City Science High School"], ["Badminton", "Baseball"]],
    ["coachFive", schools["Burgos National High School"], ["Swimming", "Badminton"]],
    ["coachSix", schools["Cauayan City National High School"], ["Athletics", "Swimming"]],
  ];
  for (const [key, school, sportNames] of coachProfiles) {
    const u = coachUsers[key];
    const reg = coachRegs.find((r) => r[0] === key);
    if (!reg) continue;
    coaches[key] = await ensureCoach({
      user: u,
      coachCode: reg[3],
      firstName: reg[4],
      middleName: reg[5],
      lastName: reg[6],
      birthdate: new Date(reg[7]),
      email: u.email,
      contactNumber: reg[8],
      school,
      sportNames,
      status: "active",
      dateRegistered: new Date("2025-06-15"),
      canApproveCoaches: key === "coachFour",
    });
  }

  // A pending coach application (tests the admin approval flow).
  const pendingUser = await ensureUser({
    username: "pdelvalle", email: "pedro.delvalle@cauayan.local",
    password: TEST_PASSWORD_COACH, role: "coach", status: "pending", mustChangePassword: true,
  });
  const pendingCoach = await ensureCoach({
    user: pendingUser,
    coachCode: "COA-100006",
    firstName: "Pedro", middleName: "Agcaoili", lastName: "Del Valle",
    birthdate: new Date("1992-03-18"), email: pendingUser.email,
    contactNumber: "0917 111 0006",
    school: schools["St. Michael Institute of Cauayan"],
    sportNames: ["Athletics", "Volleyball"],
    status: "inactive",
    dateRegistered: new Date("2026-09-01"),
  });

  // A rejected coach (tests re-approval from rejected state).
  const rejectedUser = await ensureUser({
    username: "lflores", email: "liza.flores@cauayan.local",
    password: TEST_PASSWORD_COACH, role: "coach", status: "rejected", mustChangePassword: true,
  });
  await ensureCoach({
    user: rejectedUser,
    coachCode: "COA-100007",
    firstName: "Liza", middleName: "Santos", lastName: "Flores",
    birthdate: new Date("1991-12-02"), email: rejectedUser.email,
    contactNumber: "0917 111 0007",
    school: schools["Isabela National High School"],
    sportNames: ["Volleyball"],
    status: "inactive",
    dateRegistered: new Date("2026-09-05"),
  });

  // --- Athletes ------------------------------------------------------------
  // [code, first, mid, last, birthdate, gender, schoolName, sport, event, coachKey, status, health, height, weight]
  const athleteSeed = [
    ["ATH-100001", "Juan", "Pedro", "Dela Cruz", "2008-04-15", "male", "Cauayan City National High School", "Athletics", "100m Sprint", "coachOne", "active", "healthy", 172, 62],
    ["ATH-100002", "Ana", "Marie", "Santos", "2009-07-02", "female", "Cauayan City National High School", "Swimming", "50m Freestyle", "coachOne", "active", "healthy", 164, 55],
    ["ATH-100003", "Miguel", "Luis", "Reyes", "2007-11-20", "male", "Cauayan City National High School", "Athletics", "Long Jump", "coachOne", "active", "healthy", 178, 70],
    ["ATH-100004", "Carlo", "Ben", "Mendoza", "2008-02-10", "male", "Isabela National High School", "Basketball", "5x5 Basketball", "coachTwo", "active", "healthy", 183, 78],
    ["ATH-100005", "Sofia", "Luna", "Garcia", "2009-05-25", "female", "Isabela National High School", "Volleyball", "Indoor Volleyball", "coachTwo", "active", "healthy", 170, 58],
    ["ATH-100006", "Mark", "Jose", "Navarro", "2007-09-12", "male", "Isabela National High School", "Basketball", "5x5 Basketball", "coachTwo", "active", "sick", 180, 74],
    ["ATH-100007", "Leah", "Grace", "Torres", "2008-12-01", "female", "University of Cagayan Valley - Cauayan", "Athletics", "100m Sprint", "coachThree", "active", "healthy", 162, 54],
    ["ATH-100008", "Paolo", "Nico", "Ramos", "2007-03-30", "male", "University of Cagayan Valley - Cauayan", "Basketball", "5x5 Basketball", "coachThree", "active", "healthy", 181, 76],
    ["ATH-100009", "Ivy", "Mae", "Flores", "2009-08-14", "female", "University of Cagayan Valley - Cauayan", "Athletics", "Long Jump", "coachThree", "active", "recovering", 166, 57],
    ["ATH-100010", "Rafael", "Cruz", "Domingo", "2008-01-25", "male", "Cauayan City National High School", "Athletics", "100m Sprint", "coachOne", "active", "healthy", 175, 66],
    ["ATH-100011", "Katrina", "Jane", "Aquino", "2009-06-08", "female", "Cauayan City National High School", "Athletics", "100m Sprint", "coachOne", "active", "healthy", 160, 52],
    ["ATH-100012", "Jerome", "Santiago", "Catalan", "2007-10-19", "male", "Cauayan City National High School", "Athletics", "100m Sprint", "coachOne", "active", "injured", 176, 69],
    ["ATH-100013", "Bianca", "Rose", "Lim", "2008-04-03", "female", "Cauayan City National High School", "Athletics", "200m Sprint", "coachOne", "active", "healthy", 163, 53],
    ["ATH-100014", "Ethan", "Dave", "Soriano", "2007-12-22", "male", "Cauayan City National High School", "Athletics", "Long Jump", "coachOne", "active", "healthy", 179, 72],
    ["ATH-100015", "Nina", "Celine", "Villar", "2009-02-27", "female", "Cauayan City National High School", "Athletics", "Shot Put", "coachOne", "active", "healthy", 168, 63],
    ["ATH-100016", "Kyle", "Adrian", "Torres", "2008-05-11", "male", "Cauayan City National High School", "Swimming", "50m Freestyle", "coachOne", "active", "healthy", 174, 64],
    ["ATH-100017", "Mia", "Kristine", "Salazar", "2009-09-09", "female", "Cauayan City National High School", "Swimming", "50m Freestyle", "coachOne", "active", "healthy", 161, 51],
    ["ATH-100018", "Denzel", "Pio", "Castillo", "2007-01-17", "male", "Cauayan City National High School", "Swimming", "100m Butterfly", "coachOne", "active", "healthy", 177, 71],
    ["ATH-100019", "Angeline", "Faith", "Roa", "2008-07-29", "female", "Isabela National High School", "Basketball", "5x5 Basketball", "coachTwo", "active", "healthy", 169, 60],
    ["ATH-100020", "Vincent", "Ray", "Padilla", "2006-11-05", "male", "Isabela National High School", "Basketball", "5x5 Basketball", "coachTwo", "inactive", "inactive", 185, 80],
    ["ATH-100021", "Chloe", "Anne", "Guzman", "2009-03-16", "female", "Isabela National High School", "Volleyball", "Indoor Volleyball", "coachTwo", "active", "healthy", 165, 56],
    ["ATH-100022", "Marcus", "Ivan", "Beltran", "2008-10-04", "male", "Isabela National High School", "Volleyball", "Indoor Volleyball", "coachTwo", "active", "recovering", 182, 77],
    ["ATH-100023", "Angelica", "Lou", "Mercado", "2009-01-21", "female", "University of Cagayan Valley - Cauayan", "Athletics", "100m Sprint", "coachThree", "active", "healthy", 158, 49],
    ["ATH-100024", "Harvey", "James", "Ong", "2007-06-06", "male", "University of Cagayan Valley - Cauayan", "Athletics", "Long Jump", "coachThree", "active", "healthy", 176, 68],
    ["ATH-100025", "Danica", "Rae", "Sotto", "2008-08-13", "female", "University of Cagayan Valley - Cauayan", "Athletics", "200m Sprint", "coachThree", "active", "healthy", 164, 55],
    ["ATH-100026", "Tristan", "Miguel", "Uy", "2007-04-27", "male", "University of Cagayan Valley - Cauayan", "Basketball", "5x5 Basketball", "coachThree", "active", "healthy", 178, 73],
    ["ATH-100027", "Althea", "Joy", "Fernandez", "2009-10-10", "female", "Cauayan City Science High School", "Badminton", "Singles", "coachFour", "active", "healthy", 162, 52],
    ["ATH-100028", "Gabe", "Asher", "Naval", "2008-03-02", "male", "Cauayan City Science High School", "Badminton", "Singles", "coachFour", "active", "sick", 173, 66],
    ["ATH-100029", "Francine", "Dee", "Buenaventura", "2007-09-28", "female", "Cauayan City Science High School", "Baseball", "9-Inning Game", "coachFour", "active", "healthy", 167, 59],
    ["ATH-100030", "Lex", "Andrei", "Meneses", "2008-12-15", "male", "Cauayan City Science High School", "Baseball", "9-Inning Game", "coachFour", "active", "healthy", 180, 74],
    ["ATH-100031", "Yvette", "Marie", "Cruz", "2009-05-05", "female", "Burgos National High School", "Swimming", "200m Breaststroke", "coachFive", "active", "healthy", 163, 54],
    ["ATH-100032", "Nathan", "Lee", "Vicente", "2008-04-19", "male", "Burgos National High School", "Badminton", "Singles", "coachFive", "active", "healthy", 175, 68],
    ["ATH-100033", "Rica", "May", "Bautista", "2009-07-23", "prefer_not_to_say", "Burgos National High School", "Athletics", null, "coachFive", "active", "healthy", 165, 57],
    ["ATH-100034", "Andrei", "Carlo", "Tan", "2007-02-14", "other", "St. Michael Institute of Cauayan", "Badminton", "Singles", "coachFive", "active", "healthy", 172, 65],
    ["ATH-100035", "Lorraine", "Joy", "Villanueva", "2009-06-21", "female", "St. Michael Institute of Cauayan", "Volleyball", "Indoor Volleyball", null, "active", "healthy", 166, 58],
    ["ATH-100036", "Dominic", "Paul", "Sarmiento", "2008-11-08", "male", "St. Michael Institute of Cauayan", "Swimming", "100m Butterfly", null, "active", "healthy", 175, 67],
    // Coach Six test athletes
    ["ATH-900001", "Test", "Athlete", "One", "2008-03-15", "male", "Cauayan City National High School", "Athletics", "100m Sprint", "coachSix", "active", "healthy", 170, 65],
    ["ATH-900002", "Test", "Athlete", "Two", "2009-05-20", "female", "Cauayan City National High School", "Swimming", "50m Freestyle", "coachSix", "active", "healthy", 165, 55],
    ["ATH-900003", "Test", "Athlete", "Three", "2007-08-10", "male", "Cauayan City National High School", "Athletics", "Long Jump", "coachSix", "active", "healthy", 180, 72],
    ["ATH-900004", "Test", "Athlete", "Four", "2009-01-25", "female", "Cauayan City National High School", "Swimming", "100m Butterfly", "coachSix", "active", "healthy", 168, 58],
  ];

  const athletes = [];
  for (const row of athleteSeed) {
    const [code, first, mid, last, bday, gender, schoolName, sportName, eventName, coachKey, status, health, height, weight] = row;
    const athlete = await ensureAthlete({
      athleteCode: code, firstName: first, middleName: mid, lastName: last,
      birthdate: new Date(bday), gender,
      contactNumber: `0917 000 ${String(1000 + athletes.length).slice(1)}`,
      email: `${code.toLowerCase()}@cauayan.local`,
      address: `${schoolName.replace(" - Cauayan", "")}, Cauayan City, Isabela`,
      school: schools[schoolName], sportName, eventName,
      coach: coaches[coachKey], status, dateRegistered: new Date("2026-01-05"),
      height, weight, healthStatus: health,
      healthNotes: health === "healthy" ? null : `Initial ${health} flag recorded at intake.`,
    });
    athletes.push({ athlete, row });
  }

  // --- Transfer & claim requests (workflow demonstration) -------------------
  // Pending coach-to-coach transfer request: coachOne -> coachTwo for Juan Dela Cruz.
  await once(prisma, "athleteTransfer",
    { athleteId: athletes[0].athlete.id, status: "pending" },
    {
      athleteId: athletes[0].athlete.id,
      fromCoachId: coaches.coachOne.id,
      toCoachId: coaches.coachTwo.id,
      requestedBy: coachUsers.coachOne.id,
      reason: "Athlete requested a change of coach; better suited to the basketball program.",
      createdAt: new Date("2026-09-05"),
    });

  // Pending claim: coachTwo requests the uncoached athlete Lorraine Villanueva.
  await once(prisma, "athleteTransfer",
    { athleteId: athletes[34].athlete.id, status: "pending" },
    {
      athleteId: athletes[34].athlete.id,
      fromCoachId: null,
      toCoachId: coaches.coachTwo.id,
      requestedBy: coachUsers.coachTwo.id,
      reason: "Strong local volleyball prospect; wants to join my roster.",
      createdAt: new Date("2026-09-06"),
    });

  // --- Coach history (reassignment demonstrated) ---------------------------
  await once(prisma, "athleteCoachHistory",
    { athleteId: athletes[0].athlete.id, coachId: coaches.coachFour.id },
    { athleteId: athletes[0].athlete.id, coachId: coaches.coachFour.id, assignedBy: admin.id, reason: "Temporary assignment during district clinic", startedAt: new Date("2026-03-01"), endedAt: new Date("2026-03-15") });

  await once(prisma, "athleteCoachHistory",
    { athleteId: athletes[19].athlete.id, coachId: coaches.coachTwo.id },
    { athleteId: athletes[19].athlete.id, coachId: coaches.coachTwo.id, assignedBy: admin.id, reason: "Resigned from team; moved to inactive", startedAt: new Date("2026-01-10"), endedAt: new Date("2026-05-20") });

  // --- Status history ------------------------------------------------------
  const statusHistories = [
    [athletes[19].athlete, "active", "inactive", "Left the team; no longer participating"],
    [athletes[10].athlete, "active", "inactive", "Suspended pending clearance"],
    [athletes[10].athlete, "inactive", "active", "Cleared; resumed training"],
  ];
  for (const [athlete, oldStatus, newStatus, reason] of statusHistories) {
    await once(prisma, "athleteStatusHistory",
      { athleteId: athlete.id, oldStatus, newStatus, changedAt: new Date("2026-02-01") },
      { athleteId: athlete.id, oldStatus, newStatus, changedBy: admin.id, reason, changedAt: new Date("2026-02-01") });
  }

  // --- Coaching notes ------------------------------------------------------
  const noteTexts = [
    [athletes[0], "Strong acceleration out of the blocks; needs to maintain drive phase for the last 20m."],
    [athletes[1], "Excellent flip turn work this week. Body position much flatter in the water."],
    [athletes[4], "Consistent serve receive; follow-through on spikes needs more wrist snap."],
    [athletes[8], "Light load this week during recovery. Monitor progress before full sprint volume."],
    [athletes[12], "PR in the 200m trial today. Cadence at the top of the turn is improving."],
    [athletes[21], "Returning from ankle sprain; agility ladder sessions at 70% intensity only."],
  ];
  for (const [athlete, note] of noteTexts) {
    await once(
      prisma, "coachingNote",
      { athleteId: athlete.athlete.id, note, createdAt: { gte: new Date("2026-08-01") } },
      { athleteId: athlete.athlete.id, authorId: coachUsers.coachOne.id, note, createdAt: new Date("2026-08-15") }
    );
  }

  // --- Assessments & results -----------------------------------------------
  // Each athlete gets a progression of assessments across the year.
  const eventAssessPlan = {
    "100m Sprint": { metricKey: "100m Sprint", base: 13.6, improvement: 1.6, unit: "seconds" },
    "200m Sprint": { metricKey: "200m Sprint", base: 28.7, improvement: 1.7, unit: "seconds" },
    "Long Jump": { metricKey: "Long Jump", base: 4.2, improvement: 1.4, unit: "meters", inverse: true },
    "Shot Put": { metricKey: "Shot Put", base: 6.5, improvement: 2.2, unit: "meters", inverse: true },
    "50m Freestyle": { metricKey: "50m Freestyle", base: 33.0, improvement: 2.0, unit: "seconds" },
    "100m Butterfly": { metricKey: "100m Butterfly", base: 78.0, improvement: 4.0, unit: "seconds" },
    "200m Breaststroke": { metricKey: "200m Breaststroke", base: 178.0, improvement: 8.0, unit: "seconds" },
    "5x5 Basketball": { metricKey: "5x5 Basketball", base: 8.0, improvement: 14.0, unit: "points", inverse: true },
    "Indoor Volleyball": { metricKey: "Indoor Volleyball", base: 7.0, improvement: 12.0, unit: "points", inverse: true },
    "Singles": { metricKey: "Singles", base: 6.0, improvement: 10.0, unit: "points", inverse: true },
    "9-Inning Game": { metricKey: "9-Inning Game", base: 3.0, improvement: 8.0, unit: "points", inverse: true },
  };

  const assessmentDates = [
    new Date("2026-01-20"), new Date("2026-03-10"), new Date("2026-05-05"),
    new Date("2026-07-12"), new Date("2026-08-28"),
  ];
  const assessmentTypes = ["Regular Assessment", "Monthly Evaluation", "Pre-competition Test", "Post-competition Test", "Tryout Assessment"];

  let assessmentCount = 0;
  for (let ai = 0; ai < athletes.length; ai += 1) {
    const { athlete, row } = athletes[ai];
    const eventName = row[8];
    if (!eventName || !eventAssessPlan[eventName]) continue;
    const plan = eventAssessPlan[eventName];
    const athleteCoach = athlete.coachId;
    const recorder = coachUsers[`coach${Math.min(athleteCoach, coachUsers.coachOne ? 1 : 1)}`] || coachUsers.coachOne;
    // pick a recorder that matches the athlete's coach
    let recorderUser = null;
    for (const [key, coach] of Object.entries(coaches)) {
      if (coach.id === athleteCoach) { recorderUser = coachUsers[key]; break; }
    }
    if (!recorderUser) recorderUser = recorder;

    let value = plan.base + (ai % 3) * 0.2;
    for (let d = 0; d < assessmentDates.length; d += 1) {
      const existing = await prisma.assessment.findFirst({
        where: { athleteId: athlete.id, assessmentDate: assessmentDates[d], assessmentType: assessmentTypes[d] },
      });
      if (existing) continue;
      // Each athlete starts on a staggered date so every month has data.
      const startOffset = (ai % 5);
      const date = new Date(assessmentDates[d]);
      const created = await prisma.assessment.create({
        data: {
          athleteId: athlete.id,
          recordedBy: recorderUser.id,
          assessmentDate: date,
          assessmentType: assessmentTypes[d],
          remarks: plan.inverse
            ? `Improved volume in ${eventName} training block.`
            : `Faster split on attempt ${d + 1}; form is stable.`,
        },
      });
      assessmentCount += 1;
      const progress = (d / (assessmentDates.length - 1)) * plan.improvement;
      const finalValue = plan.inverse ? value + progress : value - progress;
      const recordValue = Number(finalValue.toFixed(1));
      await prisma.assessmentResult.create({
        data: {
          assessmentId: created.id,
          metricId: metrics[eventName].id,
          valueDecimal: recordValue,
          notes: d === assessmentDates.length - 1 ? "Record performance." : null,
        },
      });
    }
  }
  console.log(`[seed] Assessments recorded: ${assessmentCount}`);

  // --- Achievements --------------------------------------------------------
  const achievementsSeed = [
    [0, "City Meet Gold Medal", "Medal", "2026-02-20", "Cauayan City Sports Office", "Gold medal in the 100m sprint final.", "gold", "district", "Athletics", "100m Sprint"],
    [0, "Regional Qualifier", "Qualification", "2026-06-10", "PRISAA Regional", "Qualified for the regional qualifying meet.", "participation", "regional", "Athletics", "100m Sprint"],
    [1, "District Silver - 50m Free", "Medal", "2026-03-15", "DepEd Cauayan", "Silver medal in the 50m freestyle.", "silver", "district", "Swimming", "50m Freestyle"],
    [2, "Long Jump Bronze", "Medal", "2026-02-20", "Cauayan City Sports Office", "Bronze medal, long jump.", "bronze", "district", "Athletics", "Long Jump"],
    [3, "Most Valuable Player", "MVP", "2026-07-05", "City Basketball League", "Named MVP of the city youth basketball circuit.", "gold", "intramural", "Basketball", "5x5 Basketball"],
    [6, "100m National Qualifier", "Qualification", "2026-06-12", "Palarong Pambansa", "Qualified for national-level competition.", "participation", "national", "Athletics", "100m Sprint"],
    [7, "Championship Ring", "Champion", "2026-07-06", "City Basketball League", "Championship in the youth division.", "gold", "intramural", "Basketball", "5x5 Basketball"],
    [12, "200m Gold - District", "Medal", "2026-03-15", "DepEd Cauayan", "Gold medal in the 200m sprint.", "gold", "district", "Athletics", "200m Sprint"],
    [15, "50m Freestyle Gold", "Medal", "2026-03-16", "DepEd Cauayan", "Gold in the 50m freestyle, district meet.", "gold", "district", "Swimming", "50m Freestyle"],
    [26, "Badminton Singles Champion", "Champion", "2026-04-02", "City Badminton Association", "U-18 singles champion.", "gold", "intramural", "Badminton", "Singles"],
    [30, "Breaststroke Bronze", "Medal", "2026-03-17", "DepEd Cauayan", "Bronze medal in 200m breaststroke.", "bronze", "district", "Swimming", "200m Breaststroke"],
  ];
  for (const [athIdx, title, type, date, org, desc, medal, level, sportName, eventName] of achievementsSeed) {
    const athlete = athletes[athIdx].athlete;
    const sport = sports[sportName];
    const event = events[eventName];
    await once(
      prisma, "achievement",
      { athleteId: athlete.id, achievementTitle: title },
      {
        athleteId: athlete.id, achievementTitle: title, achievementType: type,
        achievementDate: new Date(date), organization: org, description: desc,
        medal, level, sportId: sport.id, eventId: event.id,
        certificateUrl: null,
      }
    );
  }

  // --- Health logs ---------------------------------------------------------
  const healthLogSeed = [
    [5, "sick", "Flu-like symptoms; rested 3 days.", "2026-08-20", null],
    [10, "injured", "Right hamstring strain during sprint work.", "2026-06-14", "2026-07-10"],
    [8, "recovering", "Recovering from shin splints; low-impact cardio only.", "2026-07-01", null],
    [21, "recovering", "Ankle sprain in volleyball; rehab program started.", "2026-08-05", null],
    [27, "sick", "Mild cold; cleared after 2 days.", "2026-07-22", "2026-07-24"],
  ];
  for (const [athIdx, status, description, reportedOn, resolvedOn] of healthLogSeed) {
    const athlete = athletes[athIdx].athlete;
    const reporter = coachUsers.coachOne;
    await once(
      prisma, "healthLog",
      { athleteId: athlete.id, status, reportedAt: new Date(reportedOn) },
      {
        athleteId: athlete.id, status, description,
        reportedBy: reporter.id, reportedAt: new Date(reportedOn),
        resolvedAt: resolvedOn ? new Date(resolvedOn) : null,
        resolvedBy: resolvedOn ? admin.id : null,
      }
    );
  }

  // Mirror the current healthStatus on athletes so badges match the logs.
  await prisma.athlete.update({ where: { id: athletes[5].athlete.id }, data: { healthStatus: "sick" } });
  await prisma.athlete.update({ where: { id: athletes[21].athlete.id }, data: { healthStatus: "recovering" } });

  // --- Event plans ---------------------------------------------------------
  const exactNow = new Date();
  const planSeed = [
    { key: "festival", eventName: "Cauayan City Sports Festival 2026", description: "Annual multi-sport festival for city schools.", purpose: "Select the city delegation for the provincial meet.", startDate: new Date("2026-10-10"), endDate: new Date("2026-10-12"), venue: "Cauayan City Sports Complex", status: "open", targetParticipants: 200, targetGender: "mixed", targetAgeMin: 12, targetAgeMax: 18, programFlow: "Opening ceremony\nTrack & field heats\nBasketball games\nClosing", sportNames: ["Athletics", "Basketball", "Volleyball"] },
    { key: "swim", eventName: "Inter-School Swimming Meet", description: "Friendly swimming competition between schools.", purpose: "Rank swimmers for the city aquatics team.", startDate: new Date("2026-11-06"), endDate: new Date("2026-11-07"), venue: "Cauayan City Aquatics Center", status: "open", targetParticipants: 60, targetGender: "mixed", targetAgeMin: 10, targetAgeMax: 17, programFlow: "Heats\nFinals\nAwards", sportNames: ["Swimming"] },
    { key: "prisaa", eventName: "PRISAA Qualifying Meet", description: "Regional qualifying competition.", purpose: "Build the regional delegation.", startDate: new Date("2026-12-02"), endDate: new Date("2026-12-04"), venue: "City Sports Complex - Main Field", status: "open", targetParticipants: 300, targetGender: "mixed", targetAgeMin: 14, targetAgeMax: 20, programFlow: "Registration\nEliminations\nFinals", sportNames: ["Athletics", "Swimming", "Badminton"] },
    { key: "intramural", eventName: "City Intramural League (Draft)", description: "Draft plan for the youth league.", purpose: "TBD", startDate: new Date("2027-01-15"), venue: "Gymnasium", status: "draft", targetParticipants: 150, targetAgeMin: 10, targetAgeMax: 19, programFlow: "Draft", sportNames: ["Basketball", "Volleyball"] },
    { key: "closing", eventName: "City Meet Closing Ceremonies", description: "Closing ceremonies of the city meet.", startDate: new Date("2026-04-10"), endDate: new Date("2026-04-10"), venue: "Cauayan City Sports Complex", status: "closed", targetParticipants: 100, sportNames: ["Athletics", "Swimming"] },
    { key: "pambansa", eventName: "Palarong Pambansa Representational", description: "Cancelled - no delegation sent.", startDate: new Date("2026-05-20"), endDate: new Date("2026-05-22"), venue: "National Stadium", status: "cancelled", programFlow: "Cancelled", sportNames: ["Athletics"] },
  ];

  const plans = {};
  for (const sp of planSeed) {
    const existing = await prisma.eventPlan.findFirst({ where: { eventName: sp.eventName } });
    if (existing) { plans[sp.key] = existing; continue; }
    const created = await prisma.eventPlan.create({
      data: {
        eventName: sp.eventName, description: sp.description || null, purpose: sp.purpose || null,
        startDate: sp.startDate, startTime: sp.startDate, endDate: sp.endDate || null, endTime: sp.endDate || null,
        venue: sp.venue, status: sp.status, programFlow: sp.programFlow || null,
        targetParticipants: sp.targetParticipants || null, targetAgeMin: sp.targetAgeMin || null, targetAgeMax: sp.targetAgeMax || null,
        targetGender: sp.targetGender || null, createdBy: admin.id,
      },
    });
    for (const sportName of sp.sportNames) {
      await prisma.eventPlanSport.create({
        data: { eventPlanId: created.id, sportId: sports[sportName].id },
      });
    }
    plans[sp.key] = created;
  }

  // --- Event applications --------------------------------------------------
  const appSeed = [
    ["festival", "coachOne", "approved", null, "2026-08-01"],
    ["festival", "coachTwo", "pending", "Requesting participation slot for basketball team.", "2026-09-01"],
    ["festival", "coachThree", "approved", null, "2026-08-02"],
    ["swim", "coachOne", "approved", null, "2026-09-05"],
    ["swim", "coachFive", "pending", "Would like to bring the breaststroke team.", "2026-09-06"],
    ["swim", "coachFour", "rejected", "Squad not yet formed.", "2026-08-20"],
    ["prisaa", "coachFour", "approved", null, "2026-09-07"],
    ["prisaa", "coachThree", "pending", null, "2026-09-08"],
    ["prisaa", "coachOne", "rejected", "Swim roster already full.", "2026-08-25"],
    ["closing", "coachTwo", "approved", null, "2026-03-01"],
  ];
  for (const [planKey, coachKey, status, reason, appliedDate] of appSeed) {
    const coach = coaches[coachKey];
    const existing = await prisma.eventApplication.findFirst({
      where: { eventPlanId: plans[planKey].id, coachId: coach.id },
    });
    if (existing) continue;
    await prisma.eventApplication.create({
      data: {
        eventPlanId: plans[planKey].id, coachId: coach.id, status, reason: reason || null,
        appliedAt: new Date(appliedDate),
        reviewedAt: status === "pending" ? null : new Date(appliedDate),
        reviewedBy: status === "pending" ? null : admin.id,
      },
    });
  }

  // --- Event participants --------------------------------------------------
  const participantSeed = [
    // [planKey, coachKey, athleteIdx|null, sportName, type, status]
    ["festival", "coachOne", 0, "Athletics", "athlete", "active"],
    ["festival", "coachOne", 9, "Athletics", "athlete", "active"],
    ["festival", "coachOne", 10, "Athletics", "athlete", "active"],
    ["festival", "coachOne", 12, "Athletics", "athlete", "active"],
    ["festival", "coachThree", 6, "Athletics", "athlete", "active"],
    ["festival", "coachThree", 7, "Basketball", "athlete", "active"],
    ["festival", "coachTwo", 3, "Basketball", "athlete", "active"],
    ["festival", "coachTwo", 5, "Basketball", "athlete", "removed"],
    ["festival", "coachTwo", 4, "Volleyball", "athlete", "active"],
    ["festival", "coachOne", null, "Athletics", "coach", "active"],
    ["festival", "coachThree", null, "Basketball", "coach", "active"],
    ["swim", "coachOne", 1, "Swimming", "athlete", "active"],
    ["swim", "coachOne", 15, "Swimming", "athlete", "active"],
    ["swim", "coachOne", 16, "Swimming", "athlete", "active"],
    ["swim", "coachOne", 17, "Swimming", "athlete", "active"],
    ["swim", "coachOne", null, "Swimming", "coach", "active"],
    ["prisaa", "coachFour", 26, "Badminton", "athlete", "active"],
    ["prisaa", "coachFour", 28, "Baseball", "athlete", "active"],
    ["prisaa", "coachFour", null, "Badminton", "coach", "active"],
    ["closing", "coachTwo", 3, "Basketball", "athlete", "active"],
    ["closing", "coachTwo", 4, "Volleyball", "athlete", "active"],
  ];
  for (const [planKey, coachKey, athIdx, sportName, type, status] of participantSeed) {
    const coach = coaches[coachKey];
    const athlete = athIdx === null ? null : athletes[athIdx].athlete;
    const sport = sports[sportName];
    const existing = await prisma.eventParticipant.findFirst({
      where: {
        eventPlanId: plans[planKey].id,
        coachId: coach.id,
        athleteId: athlete ? athlete.id : null,
        sportId: sport.id,
      },
    });
    if (existing) continue;
    await prisma.eventParticipant.create({
      data: {
        eventPlanId: plans[planKey].id,
        coachId: coach.id,
        athleteId: athlete ? athlete.id : null,
        sportId: sport.id,
        participantType: type,
        status,
        addedBy: admin.id,
        createdAt: new Date("2026-09-02"),
      },
    });
  }

  // --- Training plans ------------------------------------------------------
  const trainingPlansSeed = [
    { key: "sprint", planName: "Pre-Season Sprint Conditioning", description: "Base-speed and start development block.", sportName: "Athletics", coachKey: "coachOne", frequency: "day", durationWeeks: 4, startDate: new Date("2026-08-24"), endDate: new Date("2026-09-20"), status: "active", isTemplate: false, athleteIdx: [0, 9, 10, 11, 12] },
    { key: "mileage", planName: "Mileage Build-Up Base Week", description: "Aerobic base accumulation before speed work.", sportName: "Athletics", coachKey: "coachOne", frequency: "week", durationWeeks: 8, startDate: new Date("2026-07-01"), endDate: new Date("2026-08-25"), status: "active", isTemplate: false, athleteIdx: [0, 9, 12] },
    { key: "basket", planName: "Basketball Circuit Training", description: "Explosive legs and conditioning circuit.", sportName: "Basketball", coachKey: "coachTwo", frequency: "month", durationWeeks: 4, startDate: new Date("2026-09-01"), endDate: new Date("2026-09-28"), status: "active", isTemplate: false, athleteIdx: [3, 5, 18, 19] },
    { key: "volley", planName: "Completed 12-Week Foundation", description: "Completed foundational strength block for volleyball athletes.", sportName: "Volleyball", coachKey: "coachTwo", frequency: "week", durationWeeks: 12, startDate: new Date("2026-01-04"), endDate: new Date("2026-03-29"), status: "completed", isTemplate: false, athleteIdx: [4, 21] },
    { key: "swimTemplate", planName: "Swim Technique Template", description: "Reusable stroke technique sessions (template).", sportName: "Swimming", coachKey: "coachOne", frequency: "day", durationWeeks: 8, startDate: new Date("2026-09-01"), endDate: null, status: "active", isTemplate: true, athleteIdx: [] },
    { key: "sprint6", planName: "Pre-Season Sprint Conditioning - Test", description: "Base-speed and start development block for test coach.", sportName: "Athletics", coachKey: "coachSix", frequency: "day", durationWeeks: 4, startDate: new Date("2026-08-24"), endDate: new Date("2026-09-20"), status: "active", isTemplate: false, athleteIdx: [36, 37, 38, 39] },
    { key: "mileage6", planName: "Mileage Build-Up Base Week - Test", description: "Aerobic base accumulation before speed work for test coach.", sportName: "Athletics", coachKey: "coachSix", frequency: "week", durationWeeks: 8, startDate: new Date("2026-07-01"), endDate: new Date("2026-08-25"), status: "active", isTemplate: false, athleteIdx: [36, 38] },
    { key: "test101", planName: "test 101", description: "Weekly swimming training plan for test coach.", sportName: "Swimming", coachKey: "coachSix", frequency: "week", durationWeeks: 2, startDate: new Date("2026-09-08"), endDate: new Date("2026-09-19"), status: "active", isTemplate: false, athleteIdx: [36, 37] },
  ];

  const trainingPlans = {};
  for (const tp of trainingPlansSeed) {
    const existing = await prisma.trainingPlan.findFirst({ where: { planName: tp.planName } });
    if (existing) { trainingPlans[tp.key] = existing; continue; }
    const coach = coaches[tp.coachKey];
    const sport = sports[tp.sportName];
    const created = await prisma.trainingPlan.create({
      data: {
        planName: tp.planName, description: tp.description || null,
        sportId: sport.id, coachId: coach.id, frequency: tp.frequency,
        durationWeeks: tp.durationWeeks, startDate: tp.startDate, endDate: tp.endDate,
        status: tp.status, isTemplate: tp.isTemplate,
      },
    });
    for (const ai of tp.athleteIdx) {
      await prisma.trainingPlanAthlete.create({
        data: { planId: created.id, athleteId: athletes[ai].athlete.id },
      });
    }
    trainingPlans[tp.key] = created;
  }

  // --- Athlete plan comments ------------------------------------------------
  const planCommentSeed = [
    ["sprint", 0, "Focus on block starts this week; keep hips low through the first three steps."],
    ["sprint", 9, "Your tempo recovery is slow after the last 200m - shorten the walk-back interval."],
    ["mileage", 0, "Keep the long run at conversational pace; do not chase the group."],
    ["basket", 3, "Land softly on the box jumps - absorb with the knees, not the back."],
    ["volley", 4, "Great block form in review. Add a pause at the top of the jump."],
    ["sprint6", 36, "Focus on block starts this week; keep hips low through the first three steps."],
    ["sprint6", 37, "Your tempo recovery is slow after the last 200m - shorten the walk-back interval."],
    ["mileage6", 36, "Keep the long run at conversational pace; do not chase the group."],
  ];
  for (const [planKey, aidx, body] of planCommentSeed) {
    const plan = trainingPlans[planKey];
    const athlete = athletes[aidx].athlete;
    await once(
      prisma, "athletePlanComment",
      { planId: plan.id, athleteId: athlete.id, body },
      { planId: plan.id, athleteId: athlete.id, authorId: admin.id, body, createdAt: new Date("2026-09-06") }
    );
  }

  // --- Plan activities + logs ----------------------------------------------
  const activitySeed = [
    // [planKey, athleteIdx, name, fitness, qty, unit, sets, reps, dist, load, day, week]
    ["sprint", 0, "Flying 40m sprint", "speed_agility", 6, "reps", null, null, null, null, 1, 1],
    ["sprint", 0, "Block start drills", "skill_technique", 12, "attempts", null, null, null, null, 1, 1],
    ["sprint", 0, "Tempo run 10x200m", "endurance", 10, "reps", null, null, 200, null, 2, 1],
    ["sprint", 0, "Med ball throws", "power", 20, "reps", 3, null, null, 6, 3, 1],
    ["sprint", 0, "Plyo hurdle hops", "power", 16, "reps", 4, null, null, null, 4, 1],
    ["sprint", 0, "Hip mobility flow", "mobility", 10, "min", null, null, null, null, 5, 1],
    ["sprint", 9, "Flying 40m sprint", "speed_agility", 6, "reps", null, null, null, null, 1, 1],
    ["sprint", 9, "Sprint endurance 4x300m", "endurance", 4, "reps", null, null, 300, null, 2, 1],
    ["sprint", 9, "Sled push 40m", "strength", 8, "reps", 4, null, 40, 40, 3, 1],
    ["sprint", 10, "Starts and accelerations", "speed_agility", 10, "reps", 3, null, null, null, 1, 1],
    ["sprint", 10, "Eccentric hamstring curls", "strength", 18, "reps", 3, 6, null, null, 3, 1],
    ["mileage", 0, "Long run 5k easy", "endurance", 5, "km", null, null, null, null, null, 1],
    ["mileage", 9, "Fartlek 8k", "endurance", 8, "km", null, null, null, null, null, 1],
    ["mileage", 12, "Recovery run 4k", "endurance", 4, "km", null, null, null, null, null, 1],
    ["basket", 3, "Box jumps", "power", 20, "reps", 4, 5, null, null, 1, 1],
    ["basket", 3, "Full-court sprints", "speed_agility", 12, "reps", null, null, null, null, 2, 1],
    ["basket", 5, "Defensive slides", "speed_agility", 16, "reps", 4, 4, 12, null, 1, 1],
    ["basket", 18, "Upper-body med ball passes", "power", 30, "reps", 3, 10, null, 5, 2, 1],
    ["basket", 19, "Conditioning 5-on-0", "endurance", 8, "min", 3, null, null, null, 3, 1],
    ["volley", 4, "Dynamic warm-up circuit", "mobility", 10, "min", null, null, null, null, 1, 1],
    ["volley", 4, "Block jump series", "power", 24, "reps", 4, 6, null, null, 2, 1],
    ["volley", 21, "Approach spiking drills", "skill_technique", 30, "attempts", 5, 6, null, null, 3, 1],
    ["swimTemplate", null, "Kick set 8x50m", "endurance", 8, "reps", null, null, 50, null, 1, 1],
    // Coach Six test activities - sprint plan
    ["sprint6", 36, "Flying 40m sprint", "speed_agility", 6, "reps", null, null, null, null, 1, 1],
    ["sprint6", 36, "Block start drills", "skill_technique", 12, "attempts", null, null, null, null, 1, 1],
    ["sprint6", 36, "Tempo run 10x200m", "endurance", 10, "reps", null, null, 200, null, 2, 1],
    ["sprint6", 36, "Med ball throws", "power", 20, "reps", 3, null, null, 6, 3, 1],
    ["sprint6", 36, "Plyo hurdle hops", "power", 16, "reps", 4, null, null, null, null, 4, 1],
    ["sprint6", 36, "Hip mobility flow", "mobility", 10, "min", null, null, null, null, 5, 1],
    ["sprint6", 37, "Flying 40m sprint", "speed_agility", 6, "reps", null, null, null, null, 1, 1],
    ["sprint6", 37, "Sprint endurance 4x300m", "endurance", 4, "reps", null, null, 300, null, 2, 1],
    ["sprint6", 37, "Sled push 40m", "strength", 8, "reps", 4, null, 40, 40, 3, 1],
    ["sprint6", 38, "Starts and accelerations", "speed_agility", 10, "reps", 3, null, null, null, null, 1, 1],
    ["sprint6", 38, "Eccentric hamstring curls", "strength", 18, "reps", 3, 6, null, null, 3, 1],
    ["sprint6", 39, "Flying 40m sprint", "speed_agility", 6, "reps", null, null, null, null, 1, 1],
    ["sprint6", 39, "Sprint endurance 4x300m", "endurance", 4, "reps", null, null, 300, null, 2, 1],
    // Coach Six test activities - mileage plan
    ["mileage6", 36, "Long run 5k easy", "endurance", 5, "km", null, null, null, null, null, 1],
    ["mileage6", 37, "Fartlek 8k", "endurance", 8, "km", null, null, null, null, null, 1],
    ["mileage6", 38, "Recovery run 4k", "endurance", 4, "km", null, null, null, null, null, 1],
    ["mileage6", 39, "Long run 5k easy", "endurance", 5, "km", null, null, null, null, null, 1],
    // Test 101 plan - Swimming activities - Week 1
    ["test101", 36, "Freestyle drill set", "skill_technique", 20, "attempts", 5, null, null, null, 1, 1],
    ["test101", 36, "Endurance pull set 500m", "endurance", 500, "meters", null, null, 500, null, 1, 1],
    ["test101", 36, "Kick set 8x50m", "endurance", 8, "reps", null, null, 50, null, 2, 1],
    ["test101", 36, "Vertical jump test", "power", 10, "reps", 3, null, null, null, 8, 1],
    ["test101", 36, "Treading water sprints", "speed_agility", 6, "reps", null, null, null, null, 1, 1],
    ["test101", 36, "Mobility circuit", "mobility", 15, "min", null, null, null, null, 3, 1],
    ["test101", 37, "Freestyle drill set", "skill_technique", 20, "attempts", 5, null, null, null, null, 1, 1],
    ["test101", 37, "Endurance pull set 500m", "endurance", 500, "meters", null, null, 500, null, 1, 1],
    ["test101", 37, "Kick set 8x50m", "endurance", 8, "reps", null, null, 50, null, 2, 1],
    ["test101", 37, "Vertical jump test", "power", 10, "reps", 3, null, null, null, 8, 1],
    ["test101", 37, "Treading water sprints", "speed_agility", 6, "reps", null, null, null, null, 1, 1],
    ["test101", 37, "Mobility circuit", "mobility", 15, "min", null, null, null, null, 3, 1],
    // Test 101 plan - Swimming activities - Week 2
    ["test101", 36, "Freestyle drill set", "skill_technique", 25, "attempts", 5, null, null, null, 1, 2],
    ["test101", 36, "Endurance pull set 600m", "endurance", 600, "meters", null, null, 600, null, 1, 2],
    ["test101", 36, "Kick set 10x50m", "endurance", 10, "reps", null, null, 50, null, 2, 2],
    ["test101", 36, "Interval sprints 4x50m", "speed_agility", 4, "reps", null, null, null, null, 1, 2],
    ["test101", 36, "Core strength circuit", "power", 12, "reps", 3, null, null, null, 8, 2],
    ["test101", 36, "Flexibility stretch", "mobility", 20, "min", null, null, null, null, 3, 2],
    ["test101", 37, "Freestyle drill set", "skill_technique", 25, "attempts", 5, null, null, null, null, 1, 2],
    ["test101", 37, "Endurance pull set 600m", "endurance", 600, "meters", null, null, 600, null, 1, 2],
    ["test101", 37, "Kick set 10x50m", "endurance", 10, "reps", null, null, 50, null, 2, 2],
    ["test101", 37, "Interval sprints 4x50m", "speed_agility", 4, "reps", null, null, null, null, 1, 2],
    ["test101", 37, "Core strength circuit", "power", 12, "reps", 3, null, null, null, 8, 2],
    ["test101", 37, "Flexibility stretch", "mobility", 20, "min", null, null, null, null, 3, 2],
  ];
  for (const [planKey, aidx, name, fitness, qty, unit, sets, reps, dist, load, day, week] of activitySeed) {
    const plan = trainingPlans[planKey];
    if (aidx === null) continue; // skip template-only rows for now
    const athlete = athletes[aidx].athlete;
    const existing = await prisma.planActivity.findFirst({
      where: { planId: plan.id, athleteId: athlete.id, activityName: name },
    });
    if (existing) continue;
    await prisma.planActivity.create({
      data: {
        planId: plan.id, athleteId: athlete.id, activityName: name, fitnessType: fitness,
        targetQuantity: qty ? Number(qty) : null, targetUnit: unit || null,
        targetSets: sets ? Number(sets) : null, targetReps: reps ? Number(reps) : null,
        targetDistance: dist ? Number(dist) : null, targetLoad: load ? Number(load) : null,
        instructions: `Follow the ${name.toLowerCase()} protocol.`,
        orderIndex: week && day ? (week - 1) * 7 + day : 1,
        dayIndex: day || null, weekNumber: week || null,
      },
    });
  }

  // Logs: several done/partial/missed entries across days.
  const logSeed = [
    ["sprint", 0, "Flying 40m sprint", "done", 6, null, null],
    ["sprint", 0, "Block start drills", "partial", 8, null, null],
    ["sprint", 0, "Tempo run 10x200m", "done", 10, null, null],
    ["sprint", 0, "Plyo hurdle hops", "missed", null, null, null],
    ["sprint", 9, "Flying 40m sprint", "done", 6, null, null],
    ["sprint", 9, "Sled push 40m", "partial", 6, 3, null],
    ["sprint", 10, "Starts and accelerations", "done", 10, 3, null],
    ["basket", 3, "Box jumps", "done", 20, 4, 5],
    ["basket", 3, "Full-court sprints", "done", 12, null, null],
    ["basket", 5, "Defensive slides", "partial", 12, 3, 3],
    ["basket", 18, "Upper-body med ball passes", "done", 30, 3, 10],
    ["basket", 19, "Conditioning 5-on-0", "missed", null, null, null],
    ["volley", 4, "Dynamic warm-up circuit", "done", 10, null, null],
    ["volley", 4, "Block jump series", "done", 24, 4, 6],
    ["volley", 21, "Approach spiking drills", "partial", 20, 4, 5],
    // Coach Six test logs - sprint plan
    ["sprint6", 36, "Flying 40m sprint", "done", 6, null, null],
    ["sprint6", 36, "Block start drills", "partial", 8, null, null],
    ["sprint6", 36, "Tempo run 10x200m", "done", 10, null, null],
    ["sprint6", 37, "Flying 40m sprint", "done", 6, null, null],
    ["sprint6", 37, "Sprint endurance 4x300m", "partial", 4, null, null],
    ["sprint6", 38, "Starts and accelerations", "done", 10, 3, null],
    ["sprint6", 39, "Flying 40m sprint", "done", 6, null, null],
    // Coach Six test logs - mileage plan
    ["mileage6", 36, "Long run 5k easy", "done", 5, null, null],
    ["mileage6", 37, "Fartlek 8k", "done", 8, null, null],
    ["mileage6", 38, "Recovery run 4k", "done", 4, null, null],
    ["mileage6", 39, "Long run 5k easy", "done", 5, null, null],
    // Test 101 plan - Swimming logs - Week 1
    ["test101", 36, "Freestyle drill set", "done", 20, 5, null],
    ["test101", 36, "Endurance pull set 500m", "done", 500, null, null],
    ["test101", 36, "Kick set 8x50m", "partial", 8, null, null],
    ["test101", 36, "Vertical jump test", "done", 10, 3, null],
    ["test101", 36, "Treading water sprints", "missed", null, null, null],
    ["test101", 36, "Mobility circuit", "done", 15, null, null],
    ["test101", 37, "Freestyle drill set", "done", 20, 5, null],
    ["test101", 37, "Endurance pull set 500m", "done", 500, null, null],
    ["test101", 37, "Kick set 8x50m", "partial", 8, null, null],
    ["test101", 37, "Vertical jump test", "done", 10, 3, null],
    ["test101", 37, "Treading water sprints", "missed", null, null, null],
    ["test101", 37, "Mobility circuit", "done", 15, null, null],
    // Test 101 plan - Swimming logs - Week 2
    ["test101", 36, "Freestyle drill set", "done", 25, 5, null],
    ["test101", 36, "Endurance pull set 600m", "done", 600, null, null],
    ["test101", 36, "Kick set 10x50m", "done", 10, null, null],
    ["test101", 36, "Interval sprints 4x50m", "done", 4, null, null],
    ["test101", 36, "Core strength circuit", "done", 12, 3, null],
    ["test101", 36, "Flexibility stretch", "partial", 20, null, null],
    ["test101", 37, "Freestyle drill set", "done", 25, 5, null],
    ["test101", 37, "Endurance pull set 600m", "done", 600, null, null],
    ["test101", 37, "Kick set 10x50m", "done", 10, null, null],
    ["test101", 37, "Interval sprints 4x50m", "done", 4, null, null],
    ["test101", 37, "Core strength circuit", "done", 12, 3, null],
    ["test101", 37, "Flexibility stretch", "done", 20, null, null],
  ];
  const loggerUser = coachUsers.coachTwo;
  for (const [planKey, aidx, name, status, qty, sets, reps] of logSeed) {
    const plan = trainingPlans[planKey];
    const athlete = athletes[aidx].athlete;
    const activity = await prisma.planActivity.findFirst({
      where: { planId: plan.id, athleteId: athlete.id, activityName: name },
    });
    if (!activity) continue;
    const existing = await prisma.planActivityLog.findFirst({
      where: { activityId: activity.id, athleteId: athlete.id, status },
    });
    if (existing) continue;
    await prisma.planActivityLog.create({
      data: {
        activityId: activity.id, athleteId: athlete.id,
        performedAt: new Date("2026-09-03"), status,
        quantityDone: qty != null ? Number(qty) : null,
        setsDone: sets != null ? Number(sets) : null,
        repsDone: reps != null ? Number(reps) : null,
        notes: status === "missed" ? "Athlete reported fatigue; skipped." : null,
        loggedBy: loggerUser.id,
      },
    });
  }

  // --- Training notes (admin comments) -------------------------------------
  const noteSeed = [
    ["sprint", "Ensure the tempo session stays at 75% max effort — focus on rhythm over speed."],
    ["sprint", "Good progress on block starts. Keep the hip mobility work scheduled as planned."],
    ["basket", "Watch the defense-first sessions; conditioning volume can increase slightly."],
  ];
  for (const [planKey, body] of noteSeed) {
    const plan = trainingPlans[planKey];
    await once(
      prisma, "trainingNote",
      { planId: plan.id, body },
      { planId: plan.id, authorId: admin.id, body, createdAt: new Date("2026-09-04") }
    );
  }

  // --- Training sessions ---------------------------------------------------
  const sessionSeed = [
    { sportName: "Athletics", coachKey: "coachOne", type: "regular", date: "2026-09-02", venue: "City Track Oval", notes: "Block starts + 200m tempo", athletes: [0, 9, 10, 12] },
    { sportName: "Athletics", coachKey: "coachOne", type: "conditioning", date: "2026-09-04", venue: "City Track Oval", notes: "Endurance tempo day", athletes: [0, 9] },
    { sportName: "Basketball", coachKey: "coachTwo", type: "technical", date: "2026-09-03", venue: "City Gymnasium", notes: "Man-to-man defense drills", athletes: [3, 5, 18, 19] },
    { sportName: "Volleyball", coachKey: "coachTwo", type: "tryout", date: "2026-08-28", venue: "City Gymnasium", notes: "Tryout scrimmage for new players", athletes: [4, 21] },
    { sportName: "Swimming", coachKey: "coachOne", type: "competition_simulation", date: "2026-08-30", venue: "Aquatic Center", notes: "Simulated race day", athletes: [1, 15, 16, 17] },
    { sportName: "Badminton", coachKey: "coachFour", type: "recovery", date: "2026-09-01", venue: "Badminton Hall", notes: "Active recovery and footwork shadowing", athletes: [26, 27] },
  ];
  const sessionRecords = {};
  for (const ss of sessionSeed) {
    const sport = sports[ss.sportName];
    const coach = coaches[ss.coachKey];
    const existing = await prisma.trainingSession.findFirst({
      where: { sportId: sport.id, coachId: coach.id, sessionDate: new Date(ss.date) },
    });
    if (existing) { sessionRecords[ss.sportName] = existing; continue; }
    const created = await prisma.trainingSession.create({
      data: {
        sessionDate: new Date(ss.date),
        startTime: new Date(`${ss.date}T08:00:00`),
        endTime: new Date(`${ss.date}T10:00:00`),
        sessionType: ss.type, sportId: sport.id, coachId: coach.id,
        venue: ss.venue, notes: ss.notes,
        planId: null,
      },
    });
    sessionRecords[ss.sportName] = created;
    for (const ai of ss.athletes) {
      const athlete = athletes[ai].athlete;
      try {
        await prisma.trainingAttendance.create({
          data: {
            sessionId: created.id, athleteId: athlete.id, status: "present",
            checkInTime: new Date(`${ss.date}T07:55:00`),
            checkOutTime: new Date(`${ss.date}T10:00:00`),
          },
        });
      } catch {
        // already exists
      }
    }
  }

  // --- Exercises + Exercise performance ------------------------------------
  const exerciseSeed = [
    ["Athletics", "Block start 3-step", "skill_technique", 6, 1, 8, null, null, null, "Starting blocks"],
    ["Athletics", "200m repeat", "endurance", 4, 1, null, null, 200, null, null],
    ["Athletics", "Bounding", "power", 8, 3, 6, null, null, null, null],
    ["Basketball", "Defensive slide practice", "tactical", 5, 4, 4, null, 12, null, null],
    ["Basketball", "Free throw shootaround", "skill_technique", 20, 3, null, null, null, null, "Basketballs"],
    ["Volleyball", "Serve receive warm drill", "skill_technique", 15, 3, 5, null, null, null, null],
    ["Volleyball", "Block jump work", "power", 10, 3, 8, null, null, null, null],
    ["Swimming", "50m max effort set", "endurance", 4, null, null, 45, null, null, "Lane ropes"],
    ["Badminton", "Footwork shadow drills", "mobility", 12, 4, 10, null, null, null, null],
  ];
  for (const exSeed of exerciseSeed) {
    const session = sessionRecords[exSeed[0]];
    if (!session) continue;
    const existing = await prisma.trainingExercise.findFirst({
      where: { sessionId: session.id, exerciseName: exSeed[1] },
    });
    if (existing) continue;
    await prisma.trainingExercise.create({
      data: {
        sessionId: session.id, exerciseName: exSeed[1], category: exSeed[2],
        orderIndex: 1, targetSets: exSeed[3] || null, targetReps: exSeed[4] || null,
        targetDuration: exSeed[5] || null, targetDistance: exSeed[6] || null,
        targetLoad: exSeed[7] || null, equipment: exSeed[8] || null,
        description: `Session exercise: ${exSeed[1]}`,
      },
    });
  }

  // Exercise performance records for the athletics session (first athlete).
  const perfSeed = [
    ["Athletics", "Block start 3-step", 0, 6, 1, 8, null, null, 9, null],
    ["Athletics", "200m repeat", 9, 4, 1, null, 78, null, 9, null],
    ["Athletics", "Bounding", 10, 8, 3, 6, null, null, 8, null],
  ];
  for (const [sportName, exName, ai, sets, reps, duration, distance, load, rpe] of perfSeed) {
    const session = sessionRecords[sportName];
    const athlete = athletes[ai].athlete;
    const exercise = await prisma.trainingExercise.findFirst({
      where: { sessionId: session.id, exerciseName: exName },
    });
    if (!exercise) continue;
    const existing = await prisma.exercisePerformance.findFirst({
      where: { exerciseId: exercise.id, athleteId: athlete.id },
    });
    if (existing) continue;
    await prisma.exercisePerformance.create({
      data: {
        exerciseId: exercise.id, athleteId: athlete.id,
        attendanceId: null, setsCompleted: sets || null, repsCompleted: reps || null,
        durationSec: duration || null, loadUsed: load || null, distanceCovered: distance || null,
        heartRateAvg: null, heartRateMax: null, rpe: rpe || null,
        score: null, notes: "Solid effort; technique focused.", recordedBy: coachUsers.coachOne.id,
        recordedAt: new Date("2026-09-02"),
      },
    });
  }

  // --- Training assessments (rating scale) --------------------------------
  const trainingAssessSeed = [
    ["sprint", 0, 8, "speed_agility", "Block starts are noticeably faster."],
    ["sprint", 0, 9, "endurance", "Tempo control excellent."],
    ["sprint", 9, 7, "power", "Sled work still needs acceleration hold."],
    ["sprint", 10, 8, "skill_technique", "Start mechanics improved."],
    ["basket", 3, 8, "strength", "Leg strength building well."],
    ["basket", 5, 6, "speed_agility", "Defensive footwork improving slowly."],
    ["volley", 4, 9, "skill_technique", "Spike approach near flawless."],
  ];
  for (const [planKey, aidx, rating, fitness, comments] of trainingAssessSeed) {
    const plan = trainingPlans[planKey];
    const athlete = athletes[aidx].athlete;
    const existing = await prisma.trainingAssessment.findFirst({
      where: { planId: plan.id, athleteId: athlete.id, rating, comments },
    });
    if (existing) continue;
    await prisma.trainingAssessment.create({
      data: {
        planId: plan.id, sessionId: null, athleteId: athlete.id,
        assessmentDate: new Date("2026-09-05"), rating, fitnessDimension: fitness,
        comments, assessedBy: coachUsers.coachTwo.id,
      },
    });
  }

  // --- Coach performance evaluations --------------------------------------
  const evalSeed = [
    ["coachOne", "2026-01-01", "2026-03-31", 8, 8, 7, 8, 8, 9, 8, "Great early-season planning.", "More structured recovery blocks.", "Add weekly mobility sessions."],
    ["coachOne", "2026-04-01", "2026-06-30", 8, 9, 8, 9, 8, 9, 9, "Training intensity well matched to athletes.", null, null],
    ["coachOne", "2026-07-01", "2026-09-30", 9, 9, 9, 9, 9, 10, 9, "Outstanding sprint block execution.", null, null],
    ["coachTwo", "2026-01-01", "2026-03-31", 7, 7, 7, 7, 7, 8, 7, "Solid team management.", "Tactical drills can be sharper.", "Review film weekly."],
    ["coachTwo", "2026-04-01", "2026-06-30", 7, 8, 8, 8, 7, 8, 7, "Defensive improvement visible.", null, null],
    ["coachTwo", "2026-07-01", "2026-09-30", 8, 8, 8, 8, 8, 8, 8, "Consistent and reliable.", null, null],
    ["coachThree", "2026-01-01", "2026-03-31", 9, 8, 9, 9, 8, 9, 9, "Excellent athlete development focus.", null, null],
    ["coachThree", "2026-04-01", "2026-06-30", 9, 9, 9, 9, 9, 9, 9, "Top performer this period.", null, null],
    ["coachFour", "2026-01-01", "2026-03-31", 6, 6, 6, 7, 7, 7, 6, "New program direction.", "Needs more data-driven periodization.", "Run baseline fitness assessments."],
    ["coachFour", "2026-04-01", "2026-06-30", 7, 7, 7, 8, 8, 8, 7, "Improvement noted.", null, null],
  ];
  for (const [coachKey, pStart, pEnd, sp, ex, ti, ad, co, sa, tI, strengths, improve, action] of evalSeed) {
    const coach = coaches[coachKey];
    const existing = await prisma.coachPerformance.findFirst({
      where: { coachId: coach.id, periodStart: new Date(pStart), periodEnd: new Date(pEnd) },
    });
    if (existing) continue;
    const overall = Math.round(((sp + ex + ti + ad + co + sa + tI) / 7) * 10) / 10;
    await prisma.coachPerformance.create({
      data: {
        coachId: coach.id, evaluatorId: admin.id,
        periodStart: new Date(pStart), periodEnd: new Date(pEnd),
        sessionPlanning: sp, exerciseSelection: ex, technicalInstruction: ti,
        athleteDevelopment: ad, communication: co, safetyCompliance: sa,
        trainingImplementation: tI, overallScore: overall,
        strengths: strengths || null, areasForImprovement: improve || null, actionPlan: action || null,
      },
    });
  }

  // --- Audit logs ----------------------------------------------------------
  const auditSeed = [
    ["create", "school", null, "Seeded reference school records"],
    ["create", "sport", null, "Seeded sports catalog and events"],
    ["approve", "coach", coaches.coachFour.id, "Approved coach COA-100004"],
    ["create", "eventPlan", plans.festival.id, "Created event plan: Cauayan City Sports Festival 2026"],
    ["create", "trainingPlan", trainingPlans.sprint.id, "Created training plan: Pre-Season Sprint Conditioning"],
    ["create", "assessment", null, "Recorded bulk assessment session"],
  ];
  for (const [action, entityType, entityId, description] of auditSeed) {
    await once(
      prisma, "auditLog",
      { action, entityType, entityId: entityId || null, description },
      { userId: admin.id, action, entityType, entityId: entityId || null, description, createdAt: new Date("2026-09-05") }
    );
  }

  console.log("[seed] Test data complete.");
  console.log("");
  console.log("Administrator login:");
  console.log("  identifier: admin / admin@cauayan.local");
  console.log(`  password:   ${TEST_PASSWORD_ADMIN}`);
  console.log("");
  console.log("Coach logins (same password):");
  for (const [key, user] of Object.entries(coachUsers)) {
    console.log(`  ${key}: ${user.email} / ${TEST_PASSWORD_COACH}`);
  }
  console.log("");
  console.log("Also available: pending coach pedro.delvalle@cauayan.local, rejected liza.flores@cauayan.local");
  console.log("Uncoached demo athletes: ATH-100035 Lorraine Villanueva, ATH-100036 Dominic Sarmiento (claimable by coaches).");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const ref = await seedReferenceData();
  console.log("[seed] Reference data (schools, sports, events, metrics, points, settings) ready.");

  if (process.env.SEED_TEST_DATA !== "1") {
    console.log("[seed] SEED_TEST_DATA not set to 1 - skipping test accounts/data.");
    return;
  }
  await seedTestData(ref);
}

main().finally(() => prisma.$disconnect());