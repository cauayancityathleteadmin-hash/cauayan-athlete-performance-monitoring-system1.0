import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const SPORTS = ["Athletics", "Swimming", "Basketball", "Volleyball", "Arnis", "Table Tennis", "Chess", "Badminton"];

const EVENTS = {
  "Athletics": ["100m Sprint", "200m Sprint", "400m Run", "800m Run", "Long Jump", "Triple Jump", "Shot Put"],
  "Swimming": ["50m Freestyle", "100m Freestyle", "50m Backstroke", "100m Backstroke", "100m Breaststroke"],
  "Basketball": ["5x5 Basketball", "3x3 Basketball"],
  "Volleyball": ["Indoor Volleyball", "Beach Volleyball"],
  "Arnis": ["Anyo (Forms)", "Full Contact Sparring"],
  "Table Tennis": ["Singles", "Doubles"],
  "Chess": ["Standard 60+60", "Blitz"],
  "Badminton": ["Singles", "Doubles"],
};

// (event, metricName, unit, dataType, betterDirection, min, max, required)
const METRICS = {
  "100m Sprint": [["Finish Time", "seconds", "decimal", "lower", 10, 15, true]],
  "200m Sprint": [["Finish Time", "seconds", "decimal", "lower", 20, 30, true]],
  "400m Run": [["Finish Time", "seconds", "decimal", "lower", 45, 80, true]],
  "800m Run": [["Finish Time", "seconds", "decimal", "lower", 120, 240, true]],
  "Long Jump": [["Distance", "meters", "decimal", "higher", 3, 8, true]],
  "Triple Jump": [["Distance", "meters", "decimal", "higher", 8, 16, true]],
  "Shot Put": [["Distance", "meters", "decimal", "higher", 6, 18, true]],
  "50m Freestyle": [["Finish Time", "seconds", "decimal", "lower", 25, 40, true]],
  "100m Freestyle": [["Finish Time", "seconds", "decimal", "lower", 55, 90, true]],
  "50m Backstroke": [["Finish Time", "seconds", "decimal", "lower", 30, 45, true]],
  "100m Backstroke": [["Finish Time", "seconds", "decimal", "lower", 65, 100, true]],
  "100m Breaststroke": [["Finish Time", "seconds", "decimal", "lower", 70, 110, true]],
  "5x5 Basketball": [["Points Scored", "points", "integer", "higher", 0, 60, false], ["Rebounds", "count", "integer", "higher", 0, 30, false]],
  "3x3 Basketball": [["Points Scored", "points", "integer", "higher", 0, 30, false]],
  "Indoor Volleyball": [["Aces", "count", "integer", "higher", 0, 20, false], ["Spikes", "count", "integer", "higher", 0, 40, false]],
  "Beach Volleyball": [["Aces", "count", "integer", "higher", 0, 20, false]],
  "Anyo (Forms)": [["Score", "points", "decimal", "higher", 0, 100, true]],
  "Full Contact Sparring": [["Wins", "count", "integer", "higher", 0, 10, false]],
  "Singles": [["Matches Won", "count", "integer", "higher", 0, 20, false]],
  "Doubles": [["Matches Won", "count", "integer", "higher", 0, 20, false]],
  "Standard 60+60": [["ELO Rating", "points", "integer", "higher", 800, 2400, false]],
  "Blitz": [["ELO Rating", "points", "integer", "higher", 800, 2400, false]],
};

const FIRST = ["Andres", "Maria", "Jose", "Rosario", "Ana", "Miguel", "Sofia", "Carlo", "Lea", "Paolo", "Ivy", "Rafael", "Bianca", "Luis", "Nina", "Marco", "Tessa", "Ramon", "Lara", "Diego", "Mia", "Karlo", "Ella", "Vince", "Rosa", "Patrick", "Janella", "Enrique", "Kriselle", "Aldrin", "Fatima", "Gerardo", "Hazel", "Ian", "Jasmine", "Kevin", "Lovely", "Noralyn", "Oscar", "Precious", "Rey", "Sheryl", "Tristan", "Vanessa", "Wenefredo", "Xyza", "Ysabel", "Zachary", "Dominic", "Pauline"];
const LAST = ["Agcaoili", "Bumanlag", "Corpuz", "Dumlao", "Dela Cruz", "Santos", "Reyes", "Mendoza", "Garcia", "Navarro", "Torres", "Ramos", "Flores", "Aquino", "Villanueva", "Bautista", "Ocampo", "Padilla", "Domingo", "Salazar", "Gonzales", "Uy", "Tan", "Go", "Chua", "Lim", "Ganaban", "Mabanta", "Mallillin", "Paguyo", "Pacio", "Salviejo", "Turingan", "Visaya", "Calimag", "Carino", "Castro", "Ilagan", "Lazo", "Mabini", "Obedoza", "Palattao", "Queto", "Siazon", "Tabang", "Verzosa", "Zuniega", "Manuel", "Bautista", "Castillo", "Marquez"];

const SCHOOLS = [
  "Cauayan City National High School",
  "Isabela State University",
  "Cauayan University",
  "University of La Salette - Santiago",
  "Cagayan State University",
  "San Ildefonso National High School",
  "Quirino General High School",
  "Mallig Plains National High School",
  "Centro Agro-Industrial School",
  "PLT College - Cauayan",
];

const ADMIN_ACCOUNTS = [
  { username: "admin", email: "admin@cauayan.local", password: "Admin123!" },
];

const COACHES = [
  ["msantos", "maria.santos@cauayan.local", "CoachSantos1!", "Maria", "Santos", ["Athletics", "Swimming"]],
  ["rdelacruz", "roberto.delacruz@cauayan.local", "CoachDelaCruz2!", "Roberto", "Dela Cruz", ["Basketball", "Volleyball"]],
  ["ereyes", "elena.reyes@cauayan.local", "CoachReyes3!", "Elena", "Reyes", ["Arnis", "Table Tennis"]],
  ["rgarcia", "roderick.garcia@cauayan.local", "CoachGarcia4!", "Roderick", "Garcia", ["Chess", "Badminton"]],
  ["faquino", "fely.aquino@cauayan.local", "CoachAquino5!", "Fely", "Aquino", ["Athletics", "Chess"]],
  ["rdomingo", "ramon.domingo@cauayan.local", "CoachDomingo6!", "Ramon", "Domingo", ["Swimming", "Volleyball"]],
];

async function upsertSchool(name) {
  let s = await prisma.school.findFirst({ where: { schoolName: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (!s) s = await prisma.school.create({ data: { schoolName: name, status: "active" }, select: { id: true } });
  return s.id;
}

async function upsertSport(name) {
  let s = await prisma.sport.findFirst({ where: { sportName: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (!s) s = await prisma.sport.create({ data: { sportName: name, status: "active" }, select: { id: true } });
  return s.id;
}

async function upsertEvent(sportId, eventName) {
  let e = await prisma.event.findFirst({ where: { sportId, eventName }, select: { id: true } });
  if (!e) e = await prisma.event.create({ data: { sportId, eventName, status: "active" }, select: { id: true } });
  return e;
}

async function upsertMetric(eventId, def) {
  const [metricName, unit, dataType, betterDirection, min, max, required] = def;
  let m = await prisma.performanceMetric.findFirst({ where: { eventId, metricName }, select: { id: true } });
  if (!m) {
    m = await prisma.performanceMetric.create({
      data: {
        eventId, metricName, unit, dataType, betterDirection,
        minimumValue: min, maximumValue: max, isRequired: required, status: "active",
      },
      select: { id: true },
    });
  }
  return m;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Default points per medal x level (idempotent). Keeps the standings formula non-empty.
const DEFAULT_POINTS = [
  ["gold", "intramural", 3], ["gold", "district", 5], ["gold", "regional", 10], ["gold", "national", 20], ["gold", "international", 40],
  ["silver", "intramural", 2], ["silver", "district", 3], ["silver", "regional", 6], ["silver", "national", 12], ["silver", "international", 24],
  ["bronze", "intramural", 1], ["bronze", "district", 1], ["bronze", "regional", 3], ["bronze", "national", 6], ["bronze", "international", 12],
  ["participation", "intramural", 0], ["participation", "district", 1], ["participation", "regional", 1], ["participation", "national", 2], ["participation", "international", 3],
];

async function seedPointsConfig() {
  for (const [medal, level, points] of DEFAULT_POINTS) {
    await prisma.pointsConfig.upsert({
      where: { medal_level: { medal, level } },
      update: { points },
      create: { medal, level, points },
    }).catch(() => {});
  }
}

// Remove legacy/unrealistic records left by earlier test seeds (test-form users,
// coaches, athletes, and test event plans) while leaving realistic data intact.
// Each step is isolated so a failure never aborts provisioning.
async function cleanupLegacyTestData() {
  let state = { users: 0, athletes: 0, coaches: 0, plans: 0 };
  try {
    // Known legacy test users (old seed usernames/emails). Deleting a user cascades
    // its coach + coach dependents per the schema. The realistic admin (ADMIN_ACCOUNTS)
    // is not in this list, so it is preserved.
    const legacyEmails = [
      "admin.test@cauayan.local", "admin.101@cauayan.local",
      "coach.one@cauayan.local", "coach.two@cauayan.local", "coach.three@cauayan.local",
      "coach.a@cauayan.local", "coach.b@cauayan.local", "coach.c@cauayan.local",
      "coach.d@cauayan.local", "coach.e@cauayan.local", "coach.f@cauayan.local",
    ];
    for (const email of legacyEmails) {
      await prisma.coachSport.deleteMany({ where: { coach: { user: { email } } } }).catch(() => {});
    }
    state.users = (await prisma.user.deleteMany({ where: { email: { in: legacyEmails } } }).catch(() => ({ count: 0 }))).count || 0;

    // Legacy test athletes (ATH-TEST*) - cascades achievements/assessments/notes/etc.
    state.athletes = (await prisma.athlete.deleteMany({ where: { athleteCode: { startsWith: "ATH-TEST" } } }).catch(() => ({ count: 0 }))).count || 0;

    // Legacy test coaches by code (COA-TEST*): clear row-level dependents first.
    const testCoachIds = await prisma.coach.findMany({ where: { coachCode: { startsWith: "COA-TEST" } }, select: { id: true } });
    const ids = testCoachIds.map((c) => c.id);
    if (ids.length) {
      await prisma.eventParticipant.deleteMany({ where: { coachId: { in: ids } } }).catch(() => {});
      await prisma.eventApplication.deleteMany({ where: { coachId: { in: ids } } }).catch(() => {});
      await prisma.athlete.updateMany({ where: { coachId: { in: ids } }, data: { coachId: null } }).catch(() => {});
      await prisma.coachSport.deleteMany({ where: { coachId: { in: ids } } }).catch(() => {});
    }
    state.coaches = (await prisma.coach.deleteMany({ where: { coachCode: { startsWith: "COA-TEST" } } }).catch(() => ({ count: 0 }))).count || 0;

    // Legacy test event plans (names containing TEST marker).
    state.plans = (await prisma.eventPlan.deleteMany({ where: { eventName: { contains: "TEST" } } }).catch(() => ({ count: 0 }))).count || 0;
  } catch (e) {
    console.warn("[sample-data] legacy cleanup skipped (non-fatal):", e && e.message);
  }
  return state;
}

// Fast, single-call admin creation (cannot time out) - used to guarantee an admin
// exists even before the full sample data load is run. Returns the created admin.
export async function provisionAdminOnly() {
  const a = ADMIN_ACCOUNTS[0];
  const passwordHash = await bcrypt.hash(a.password, 12);
  const admin = await prisma.user.upsert({
    where: { email: a.email },
    update: { username: a.username, role: "admin", status: "active", mustChangePassword: false, passwordHash },
    create: { username: a.username, email: a.email, role: "admin", status: "active", mustChangePassword: false, passwordHash },
  });
  return { username: admin.username, email: admin.email, role: admin.role, status: admin.status };
}

export async function provisionSampleData() {
  const report = { admins: 0, coaches: 0, schools: 0, sports: 0, events: 0, metrics: 0, athletes: 0, assessments: 0, results: 0, achievements: 0, eventPlans: 0, applications: 0, participants: 0, removedLegacy: 0 };

  // Drop any legacy/unrealistic test records before (re)seeding so only the
  // realistic demo dataset remains. Each cleanup is isolated so a failure never
  // aborts provisioning.
  const removed = await cleanupLegacyTestData();
  report.removedLegacy = (removed.users || 0) + (removed.athletes || 0) + (removed.coaches || 0) + (removed.plans || 0);

  const rng = () => Math.random();

  // Sports + Events + Metrics
  const sportIds = {};
  for (const sportName of SPORTS) sportIds[sportName] = await upsertSport(sportName);
  report.sports = SPORTS.length;

  const eventIds = {};
  for (const [sportName, events] of Object.entries(EVENTS)) {
    for (const evt of events) {
      const e = await upsertEvent(sportIds[sportName], evt);
      eventIds[evt] = e.id;
      const defs = METRICS[evt] || [];
      for (const def of defs) { await upsertMetric(e.id, def); report.metrics += 1; }
      report.events += 1;
    }
  }

  // Schools
  const schoolIds = {};
  for (const name of SCHOOLS) { schoolIds[name] = await upsertSchool(name); report.schools += 1; }

  // Admins
  for (const a of ADMIN_ACCOUNTS) {
    await prisma.user.upsert({
      where: { email: a.email },
      update: { username: a.username, role: "admin", status: "active", mustChangePassword: false, passwordHash: await bcrypt.hash(a.password, 12) },
      create: { username: a.username, email: a.email, role: "admin", status: "active", mustChangePassword: false, passwordHash: await bcrypt.hash(a.password, 12) },
    });
    report.admins += 1;
  }

  // Coaches
  const coachList = [];
  for (let i = 0; i < COACHES.length; i += 1) {
    const [username, email, password, first, last, sports] = COACHES[i];
    const coachCode = `COA-${String(100000 + i + 1)}`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { username, role: "coach", status: "active", mustChangePassword: false, passwordHash: await bcrypt.hash(password, 12) },
      create: { username, email, role: "coach", status: "active", mustChangePassword: false, passwordHash: await bcrypt.hash(password, 12) },
      select: { id: true },
    });
    const schoolName = SCHOOLS[i % SCHOOLS.length];
    const schoolId = schoolIds[schoolName];
    const coach = await prisma.coach.upsert({
      where: { userId: user.id },
      update: { coachCode, firstName: first, lastName: last, schoolId, status: "active", email },
      create: {
        userId: user.id, coachCode, firstName: first, lastName: last, birthdate: new Date("1990-01-01"),
        email, contactNumber: `0917 000 00${i + 1}`, schoolId, status: "active", dateRegistered: new Date(),
      },
      select: { id: true },
    });
    for (const sp of sports) {
      await prisma.coachSport.upsert({
        where: { coachId_sportId: { coachId: coach.id, sportId: sportIds[sp] } },
        update: {}, create: { coachId: coach.id, sportId: sportIds[sp] },
      });
    }
    coachList.push({ coach, code: coachCode, sports });
    report.coaches += 1;
  }

  // Athletes (enough to exercise every sport/event)
  let athleteNum = 1;
  for (const [sportName, eventNames] of Object.entries(EVENTS)) {
    const sportId = sportIds[sportName];
    const coachEntry = coachList.find((c) => c.sports.includes(sportName)) || coachList[0];
    const eventName = eventNames[0];
    for (let k = 0; k < 2; k += 1) {
      const athleteCode = `ATH-${String(athleteNum).padStart(5, "0")}`;
      const firstName = pick(FIRST);
      const lastName = pick(LAST);
      const gender = rng() > 0.5 ? "male" : "female";
      const schoolId = schoolIds[SCHOOLS[athleteNum % SCHOOLS.length]];
      const athleteRow = await prisma.athlete.upsert({
        where: { athleteCode },
        update: { status: "active" },
        create: {
          athleteCode, firstName, lastName, birthdate: new Date(2005 + (athleteNum % 4), (athleteNum % 12), (athleteNum % 28) + 1),
          gender, contactNumber: `0917 11${String(athleteNum).padStart(7, "0")}`,
          email: `${athleteCode.toLowerCase()}@cauayan.local`, address: "Cauayan City",
          schoolId, sportId, eventId: eventIds[eventName], coachId: coachEntry.coach.id,
          status: "active", dateRegistered: new Date(2025, (athleteNum % 12), 1),
        },
        select: { id: true },
      });
      const existingHistory = await prisma.athleteCoachHistory.findFirst({ where: { athleteId: athleteRow.id, coachId: coachEntry.coach.id }, select: { id: true } });
      if (!existingHistory) {
        await prisma.athleteCoachHistory.create({ data: { athleteId: athleteRow.id, coachId: coachEntry.coach.id, startedAt: new Date(2025, (athleteNum % 12), 1) } });
      }
      report.athletes += 1;
      athleteNum += 1;
    }
  }

  // Assessments + Results + Achievements
  const createdAthletes = await prisma.athlete.findMany({ take: 16, orderBy: { id: "asc" }, select: { id: true, sportId: true, eventId: true } });
  const coachUsers = await prisma.user.findMany({ where: { role: "coach" }, select: { id: true } });

  let aIndex = 0;
  for (const athlete of createdAthletes) {
    const recorder = coachUsers[aIndex % coachUsers.length];
    for (const type of ["Regular Assessment", "Competition Assessment"]) {
      const assessment = await prisma.assessment.create({
        data: {
          athleteId: athlete.id, recordedBy: recorder.id,
          assessmentDate: new Date(2026, aIndex % 12, (aIndex % 20) + 1),
          assessmentType: type, remarks: "Sample performance assessment",
        },
        select: { id: true },
      });
      report.assessments += 1;
      const metrics = athlete.eventId
        ? await prisma.performanceMetric.findMany({ where: { eventId: athlete.eventId }, select: { id: true, dataType: true, minimumValue: true, maximumValue: true } })
        : [];
      for (const m of metrics) {
        const lo = Number(m.minimumValue ?? 0);
        const hi = Number(m.maximumValue ?? 100);
        const val = lo + rng() * (hi - lo);
        await prisma.assessmentResult.create({
          data: {
            assessmentId: assessment.id, metricId: m.id,
            valueDecimal: m.dataType === "text" ? null : val,
            valueText: m.dataType === "text" ? "Sample" : null,
            notes: "Sample result",
          },
        }).catch(() => {});
        report.results += 1;
      }
    }
    // Seed default points config (idempotent) so standings/points compute correctly.
    await seedPointsConfig();

    if (rng() > 0.25) {
      const medals = ["gold", "silver", "bronze", "participation"];
      const levels = ["intramural", "district", "regional", "national", "international"];
      const medal = medals[aIndex % medals.length];
      const level = levels[(aIndex * 2) % levels.length];
      const achievement = await prisma.achievement.create({
        data: {
          athleteId: athlete.id,
          achievementTitle: `${medal.charAt(0).toUpperCase() + medal.slice(1)} - Cauayan City ${level.charAt(0).toUpperCase() + level.slice(1)} Meet`,
          achievementType: medal === "gold" ? "Gold Medal" : medal.charAt(0).toUpperCase() + medal.slice(1),
          achievementDate: new Date(2026, aIndex % 12, 1),
          organization: "Cauayan City Division",
          description: "Sample achievement demonstrating medal and level tracking",
          medal, level,
          sportId: athlete.sportId ?? undefined,
          eventId: athlete.eventId ?? undefined,
          certificateUrl: null,
        },
      });
      report.achievements += 1;
      // Give a few top athletes a second, higher achievement so the leaderboard varies.
      if (aIndex % 4 === 0) {
        await prisma.achievement.create({
          data: {
            athleteId: athlete.id,
            achievementTitle: `National Qualifier - ${(athlete.eventId ? "Open" : "Cauayan City")}`,
            achievementType: "National Qualifier",
            achievementDate: new Date(2026, (aIndex + 2) % 12, 10),
            organization: "DepEd Cauayan City",
            description: "Second sample achievement for points demonstration",
            medal: "silver", level: "regional",
            sportId: athlete.sportId ?? undefined,
            eventId: athlete.eventId ?? undefined,
            certificateUrl: null,
          },
        }).catch(() => {});
        report.achievements += 1;
      }
    }
    aIndex += 1;
  }

  // Event plans (draft/open/closed) + applications + participants
  const planStatuses = ["draft", "open"];
  const sportNameKeys = Object.keys(sportIds);
  for (let i = 0; i < 2; i += 1) {
    const start = new Date(2026, 9 + (i % 3), 10 + i);
    const planSportId = sportIds[sportNameKeys[i % sportNameKeys.length]];
    const plan = await prisma.eventPlan.create({
      data: {
        eventName: `Cauayan City Meet ${i + 1}`,
        description: "Sample event program for testing",
        startDate: start, endDate: new Date(start.getTime() + 86400000 * 2),
        venue: "Cauayan City Sports Complex", status: planStatuses[i],
        programFlow: "Opening ceremony\nQualifying heats\nFinals",
        sports: { create: [{ sportId: planSportId }] },
      },
      select: { id: true },
    });
    report.eventPlans += 1;
    if (planStatuses[i] === "open") {
      for (const c of coachList) {
        await prisma.eventApplication.create({
          data: { eventPlanId: plan.id, coachId: c.coach.id, status: "approved", reason: "Sample application", reviewedAt: new Date() },
        }).catch(() => {});
        report.applications += 1;
      }
      const someAthletes = createdAthletes.slice(i * 3, i * 3 + 5);
      for (let j = 0; j < someAthletes.length; j += 1) {
        const ath = someAthletes[j];
        const coachEntry = coachList[j % coachList.length];
        await prisma.eventParticipant.create({
          data: {
            eventPlanId: plan.id, coachId: coachEntry.coach.id, athleteId: ath.id,
            sportId: planSportId,
            participantType: "athlete", status: "active",
          },
        }).catch(() => {});
        report.participants += 1;
      }
    }
  }

  return report;
}
