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

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Default points per medal x level (idempotent). Keeps the standings formula populated.
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
    // Purge ALL demo-origin records so every provision is idempotent and leaves only
    // the current realistic dataset. Boundary is safe: demo data is the only data that
    // uses @cauayan.local emails / ATH- / COA- codes / demo plans. Real production
    // accounts and records never match these and are preserved.

    // 0) Reference lists.
    const demoEmail = { endsWith: "@cauayan.local" };

    // 1) Demo athletes (by email domain) - cascades achievements/assessments/notes/
    //    health/training + deanonymizes coach history (athlete-side cascade).
    state.athletes = (await prisma.athlete.deleteMany({ where: { email: demoEmail } }).catch(() => ({ count: 0 }))).count || 0;

    // 2) Demo event plans.
    state.plans = (await prisma.eventPlan.deleteMany({
      where: { OR: [{ eventName: { contains: "TEST" } }, { description: "Sample event program for testing" }, { eventName: { startsWith: "Cauayan City Meet" } }] },
    }).catch(() => ({ count: 0 }))).count || 0;

    // 3) Demo users (any @cauayan.local account) and the coaches under them.
    const demoUserIds = (await prisma.user.findMany({ where: { email: demoEmail }, select: { id: true } })).map((u) => u.id);
    const reservedCodes = ["COA-100001", "COA-100002", "COA-100003", "COA-100004", "COA-100005", "COA-100006", "COA-TEST01", "COA-TEST02", "COA-TEST03"];
    const demoCoachIds = (await prisma.coach.findMany({
      where: { OR: [{ userId: { in: demoUserIds } }, { coachCode: { in: reservedCodes } }] },
      select: { id: true },
    })).map((c) => c.id);

    if (demoCoachIds.length) {
      // 4) Clear EVERY coach dependency (many are Restrict -> must remove explicitly).
      await prisma.athleteCoachHistory.deleteMany({ where: { coachId: { in: demoCoachIds } } }).catch(() => {});
      await prisma.trainingSession.deleteMany({ where: { coachId: { in: demoCoachIds } } }).catch(() => {});
      await prisma.trainingPlan.deleteMany({ where: { coachId: { in: demoCoachIds } } }).catch(() => {});
      await prisma.coachPerformance.deleteMany({ where: { coachId: { in: demoCoachIds } } }).catch(() => {});
      await prisma.coachSport.deleteMany({ where: { coachId: { in: demoCoachIds } } }).catch(() => {});
      await prisma.eventParticipant.deleteMany({ where: { coachId: { in: demoCoachIds } } }).catch(() => {});
      await prisma.eventApplication.deleteMany({ where: { coachId: { in: demoCoachIds } } }).catch(() => {});
      await prisma.athlete.deleteMany({ where: { coachId: { in: demoCoachIds } } }).catch(() => {});
      state.coaches = (await prisma.coach.deleteMany({ where: { id: { in: demoCoachIds } } }).catch(() => ({ count: 0 }))).count || 0;
    }

    // 5) Demo users (cascades anything still attached).
    if (demoUserIds.length) {
      state.users = (await prisma.user.deleteMany({ where: { id: { in: demoUserIds } } }).catch(() => ({ count: 0 }))).count || 0;
    }
  } catch (e) {
    console.warn("[sample-data] legacy cleanup skipped (non-fatal):", e && e.message);
  }
  return state;
}

// Fast, single-call admin creation (cannot time out) - used to guarantee an admin
// exists even before the full sample data load is run. Returns the created admin.
export async function provisionAdminOnly() {
  const a = ADMIN_ACCOUNTS[0];
  const passwordHash = await bcrypt.hash(a.password, 10);
  const admin = await prisma.user.upsert({
    where: { email: a.email },
    update: { username: a.username, role: "admin", status: "active", mustChangePassword: false, passwordHash },
    create: { username: a.username, email: a.email, role: "admin", status: "active", mustChangePassword: false, passwordHash },
  });
  return { username: admin.username, email: admin.email, role: admin.role, status: admin.status };
}

export const PROVISION_STEPS = [
  "schema",
  "cleanup",
  "catalog",
  "accounts",
  "athletes",
  "assessments",
  "plans",
  "points",
];

// Demo password helper (cost kept low so steps stay fast).
const memoizedHash = (() => {
  const cache = new Map();
  return async (password) => {
    if (!cache.has(password)) cache.set(password, await bcrypt.hash(password, 10));
    return cache.get(password);
  };
})();

// Step-based provisioning. Each step is small, idempotent, and self-sufficient
// (it derives every ID it needs from the DB) so it fits comfortably within a single
// serverless function invocation. Callers loop through PROVISION_STEPS until done.
export async function runProvisionStep(step) {
  const report = { step, admins: 0, coaches: 0, schools: 0, sports: 0, events: 0, metrics: 0, athletes: 0, assessments: 0, results: 0, achievements: 0, eventPlans: 0, applications: 0, participants: 0 };
  const rng = () => Math.random();

  if (step === "schema") {
    // Phase 3 self-healing DDL. The build-time `prisma migrate deploy` can silently
    // fail (and is swallowed by `|| echo "[migrate] skipped"`) when only the pooled
    // DATABASE_URL is set, so the points_config table / achievement columns may be
    // missing on the live DB. Run idempotent DDL here so the standings feature works
    // regardless of migration state.
    const stmts = [
      `CREATE TABLE IF NOT EXISTS "points_config" ("id" SERIAL NOT NULL, "medal" TEXT NOT NULL, "level" TEXT NOT NULL, "points" INTEGER NOT NULL, CONSTRAINT "points_config_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "points_config_medal_level_key" ON "points_config" ("medal", "level")`,
      `ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "medal" TEXT`,
      `ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "level" TEXT`,
      `ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "sport_id" INTEGER`,
      `ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "event_id" INTEGER`,
      `ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "certificate_url" TEXT`,
      `CREATE INDEX IF NOT EXISTS "achievements_athlete_id_achievement_date_idx" ON "achievements" ("athlete_id", "achievement_date")`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'achievements_sport_id_fkey') THEN ALTER TABLE "achievements" ADD CONSTRAINT "achievements_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports" ("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'achievements_event_id_fkey') THEN ALTER TABLE "achievements" ADD CONSTRAINT "achievements_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;`,
    ];
    let applied = 0;
    for (const sql of stmts) {
      try { await prisma.$executeRawUnsafe(sql); applied += 1; } catch (e) { console.warn("[sample-data] schema stmt skipped:", e && e.message); }
    }
    report.schemaStatements = applied;
    return report;
  }

  if (step === "cleanup") {
    const removed = await cleanupLegacyTestData();
    report.removedLegacy = (removed.users || 0) + (removed.athletes || 0) + (removed.coaches || 0) + (removed.plans || 0);
    return report;
  }

  if (step === "catalog") {
    // Sports (upsert = single call each)
    for (const sportName of SPORTS) {
      await prisma.sport.upsert({
        where: { sportName },
        update: { status: "active" },
        create: { sportName, status: "active" },
      });
      report.sports += 1;
    }
    // Schools
    for (const name of SCHOOLS) {
      await prisma.school.upsert({
        where: { schoolName: name },
        update: { status: "active" },
        create: { schoolName: name, status: "active" },
      });
      report.schools += 1;
    }
    // Events + metrics (idempotent)
    const sports = await prisma.sport.findMany({ where: { sportName: { in: SPORTS } }, select: { id: true, sportName: true } });
    const sportIdByName = Object.fromEntries(sports.map((s) => [s.sportName, s.id]));
    for (const [sportName, eventNames] of Object.entries(EVENTS)) {
      const sid = sportIdByName[sportName];
      for (const evt of eventNames) {
        const row = await prisma.event.upsert({
          where: { sportId_eventName: { sportId: sid, eventName: evt } },
          update: { status: "active" },
          create: { sportId: sid, eventName: evt, status: "active" },
          select: { id: true },
        });
        report.events += 1;
        for (const def of METRICS[evt] || []) {
          const [metricName, unit, dataType, betterDirection, min, max, required] = def;
          await prisma.performanceMetric.upsert({
            where: { eventId_metricName: { eventId: row.id, metricName } },
            update: { status: "active" },
            create: { eventId: row.id, metricName, unit, dataType, betterDirection, minimumValue: min, maximumValue: max, isRequired: required, status: "active" },
          });
          report.metrics += 1;
        }
      }
    }
    return report;
  }

  if (step === "accounts") {
    const schoolIds = {};
    const schoolRows = await prisma.school.findMany({ where: { schoolName: { in: SCHOOLS } }, select: { id: true, schoolName: true } });
    for (const s of schoolRows) schoolIds[s.schoolName] = s.id;

    // Admin(s)
    for (const a of ADMIN_ACCOUNTS) {
      const passwordHash = await memoizedHash(a.password);
      await prisma.user.upsert({
        where: { email: a.email },
        update: { username: a.username, role: "admin", status: "active", mustChangePassword: false, passwordHash },
        create: { username: a.username, email: a.email, role: "admin", status: "active", mustChangePassword: false, passwordHash },
      });
      report.admins += 1;
    }

    // Coaches (create fresh after removing leftovers for this user/code)
    for (let i = 0; i < COACHES.length; i += 1) {
      const [username, email, password, first, last, sports] = COACHES[i];
      const coachCode = `COA-${String(100000 + i + 1)}`;
      const passwordHash = await memoizedHash(password);
      const user = await prisma.user.upsert({
        where: { email },
        update: { username, role: "coach", status: "active", mustChangePassword: false, passwordHash },
        create: { username, email, role: "coach", status: "active", mustChangePassword: false, passwordHash },
        select: { id: true },
      });
      const targets = await prisma.coach.findMany({ where: { OR: [{ userId: user.id }, { coachCode }] }, select: { id: true } });
      const targetIds = targets.map((t) => t.id);
      if (targetIds.length) {
        await prisma.athleteCoachHistory.deleteMany({ where: { coachId: { in: targetIds } } }).catch(() => {});
        await prisma.trainingSession.deleteMany({ where: { coachId: { in: targetIds } } }).catch(() => {});
        await prisma.trainingPlan.deleteMany({ where: { coachId: { in: targetIds } } }).catch(() => {});
        await prisma.coachPerformance.deleteMany({ where: { coachId: { in: targetIds } } }).catch(() => {});
        await prisma.eventParticipant.deleteMany({ where: { coachId: { in: targetIds } } }).catch(() => {});
        await prisma.eventApplication.deleteMany({ where: { coachId: { in: targetIds } } }).catch(() => {});
        await prisma.coachSport.deleteMany({ where: { coachId: { in: targetIds } } }).catch(() => {});
        await prisma.athlete.deleteMany({ where: { coachId: { in: targetIds } } }).catch(() => {});
        await prisma.coach.deleteMany({ where: { id: { in: targetIds } } }).catch(() => {});
      }
      const coach = await prisma.coach.create({
        data: {
          userId: user.id, coachCode, firstName: first, lastName: last, birthdate: new Date("1990-01-01"),
          email, contactNumber: `0917 000 00${i + 1}`, schoolId: schoolIds[SCHOOLS[i % SCHOOLS.length]], status: "active", dateRegistered: new Date(),
        },
        select: { id: true },
      });
      const sportRows = await prisma.sport.findMany({ where: { sportName: { in: sports } }, select: { id: true } });
      await prisma.coachSport.createMany({
        data: sportRows.map((s) => ({ coachId: coach.id, sportId: s.id })),
        skipDuplicates: true,
      });
      report.coaches += 1;
    }
    return report;
  }

  if (step === "athletes") {
    const sports = await prisma.sport.findMany({ select: { id: true, sportName: true } });
    const events = await prisma.event.findMany({ select: { id: true, eventName: true, sportId: true } });
    const sportIdByName = Object.fromEntries(sports.map((s) => [s.sportName, s.id]));
    const eventIdBySportName = {};
    for (const e of events) eventIdBySportName[e.sportId] = e.id;
    const schoolRows = await prisma.school.findMany({ select: { id: true, schoolName: true } });
    const schoolIdByName = Object.fromEntries(schoolRows.map((s) => [s.schoolName, s.id]));
    const coaches = await prisma.coach.findMany({ select: { id: true, coachCode: true, sports: { select: { sportId: true } } } });
    const coachBySport = {};
    for (const c of coaches) {
      for (const cs of c.sports || []) coachBySport[cs.sportId] = c.id;
    }
    const firstCoachId = coaches[0]?.id;

    const rows = [];
    let athleteNum = 1;
    for (const [sportName, eventNames] of Object.entries(EVENTS)) {
      const sportId = sportIdByName[sportName];
      const eventId = eventIdBySportName[sportId] || null;
      const coachId = coachBySport[sportId] || firstCoachId;
      for (let k = 0; k < 2; k += 1) {
        const athleteCode = `ATH-${String(athleteNum).padStart(5, "0")}`;
        rows.push({
          athleteCode,
          firstName: pick(FIRST),
          lastName: pick(LAST),
          birthdate: new Date(2005 + (athleteNum % 4), athleteNum % 12, (athleteNum % 28) + 1),
          gender: rng() > 0.5 ? "male" : "female",
          contactNumber: `0917 11${String(athleteNum).padStart(7, "0")}`,
          email: `${athleteCode.toLowerCase()}@cauayan.local`,
          address: "Cauayan City",
          schoolId: schoolIdByName[SCHOOLS[athleteNum % SCHOOLS.length]] || null,
          sportId,
          eventId,
          coachId,
          status: "active",
          dateRegistered: new Date(2025, athleteNum % 12, 1),
        });
        athleteNum += 1;
      }
    }
    const created = await prisma.athlete.createManyAndReturn({ data: rows, skipDuplicates: true });
    report.athletes = created.length;

    // Coach history (batched)
    const histRows = created.map((a) => ({
      athleteId: a.id, coachId: a.coachId, startedAt: new Date(2025, 0, 1),
    }));
    await prisma.athleteCoachHistory.createMany({ data: histRows, skipDuplicates: true });
    return report;
  }

  if (step === "assessments") {
    const athletes = await prisma.athlete.findMany({ take: 16, orderBy: { id: "asc" }, select: { id: true, sportId: true, eventId: true, coachId: true } });
    const coachUsers = await prisma.user.findMany({ where: { role: "coach" }, select: { id: true } });
    if (!coachUsers.length) coachUsers.push({ id: (await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } }))?.id ?? 0 });

    let aIndex = 0;
    for (const athlete of athletes) {
      const recorder = coachUsers[aIndex % coachUsers.length];
      const metrics = athlete.eventId
        ? await prisma.performanceMetric.findMany({ where: { eventId: athlete.eventId }, select: { id: true, dataType: true, minimumValue: true, maximumValue: true } })
        : [];
      for (const type of ["Regular Assessment", "Competition Assessment"]) {
        let assessment;
        try {
          assessment = await prisma.assessment.create({
            data: {
              athleteId: athlete.id, recordedBy: recorder.id,
              assessmentDate: new Date(2026, aIndex % 12, (aIndex % 20) + 1),
              assessmentType: type, remarks: "Sample performance assessment",
            },
            select: { id: true },
          });
          report.assessments += 1;
        } catch { continue; }
        const resultRows = metrics.map((m) => {
          const lo = Number(m.minimumValue ?? 0);
          const hi = Number(m.maximumValue ?? 100);
          const val = lo + rng() * (hi - lo);
          return {
            assessmentId: assessment.id, metricId: m.id,
            valueDecimal: m.dataType === "text" ? null : val,
            valueText: m.dataType === "text" ? "Sample" : null,
            notes: "Sample result",
          };
        });
        if (resultRows.length) {
          await prisma.assessmentResult.createMany({ data: resultRows, skipDuplicates: true });
          report.results += resultRows.length;
        }
      }
      // Achievement for ~3/4 of athletes (single create), plus an extra for some.
      if (rng() > 0.25) {
        const medals = ["gold", "silver", "bronze", "participation"];
        const levels = ["intramural", "district", "regional", "national", "international"];
        const medal = medals[aIndex % medals.length];
        const level = levels[(aIndex * 2) % levels.length];
        await prisma.achievement.create({
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
        }).catch(() => {});
        report.achievements += 1;
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
    return report;
  }

  if (step === "plans") {
    const sportRows = await prisma.sport.findMany({ select: { id: true, sportName: true } });
    const coaches = await prisma.coach.findMany({ select: { id: true } });
    const athletes = await prisma.athlete.findMany({ take: 10, orderBy: { id: "asc" }, select: { id: true } });
    const planStatuses = ["draft", "open"];
    for (let i = 0; i < 2; i += 1) {
      const start = new Date(2026, 9 + (i % 3), 10 + i);
      const planSportId = sportRows[i % sportRows.length]?.id;
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
        await prisma.eventApplication.createMany({
          data: coaches.map((c) => ({ eventPlanId: plan.id, coachId: c.id, status: "approved", reason: "Sample application", reviewedAt: new Date() })),
          skipDuplicates: true,
        });
        report.applications += coaches.length;
        const partRows = athletes.slice(i * 3, i * 3 + 5).map((ath, j) => ({
          eventPlanId: plan.id, coachId: coaches[j % coaches.length]?.id, athleteId: ath.id,
          sportId: planSportId, participantType: "athlete", status: "active",
        }));
        await prisma.eventParticipant.createMany({ data: partRows, skipDuplicates: true });
        report.participants += partRows.length;
      }
    }
    return report;
  }

  if (step === "points") {
    await seedPointsConfig();
    return report;
  }

  throw new Error(`Unknown provision step: ${step}`);
}

export async function provisionSampleData() {
  let aggregate = { step: "done", removedLegacy: 0, admins: 0, coaches: 0, schools: 0, sports: 0, events: 0, metrics: 0, athletes: 0, assessments: 0, results: 0, achievements: 0, eventPlans: 0, applications: 0, participants: 0 };
  for (const step of PROVISION_STEPS) {
    const r = await runProvisionStep(step);
    aggregate = { ...aggregate, ...r };
  }
  aggregate.step = "done";
  return aggregate;
}
