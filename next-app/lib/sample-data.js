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

const FIRST = ["Juan", "Ana", "Miguel", "Carlo", "Sofia", "Mark", "Leah", "Paolo", "Ivy", "Rafael", "Diana", "Enzo", "Bianca", "Luis", "Nina", "Marco", "Tessa", "Aldo", "Gia", "Ramon", "Lara", "Diego", "Mia", "Karlo", "Jade", "Nico", "Ella", "Vince", "Rosa", "Sam"];
const LAST = ["Dela Cruz", "Santos", "Reyes", "Mendoza", "Garcia", "Navarro", "Torres", "Ramos", "Flores", "Aquino", "Villanueva", "Cruz", "Bautista", "Ocampo", "Padilla", "Domingo", "Salazar", "Ramoso", "Gonzales", "Silva", "Fernandez", "Castillo", "Lopez", "Perez", "Marquez", "Uy", "Tan", "Go", "Chua", "Lim"];

const SCHOOLS = [
  "Cauayan City National High School",
  "Isabela National High School",
  "University of Cagayan Valley - Cauayan",
  "Cauayan City Stand Alone Senior High School",
  "Central Cauayan Elementary",
  "Dadalat Integrated School",
];

const ADMIN_ACCOUNTS = [
  { username: "admin.101", email: "admin.101@cauayan.local", password: "admin.101" },
];

const COACHES = [
  ["coach.a", "coach.a@cauayan.local", "UpgradeCoachA1!", "Maria", "Santos", ["Athletics", "Swimming"]],
  ["coach.b", "coach.b@cauayan.local", "UpgradeCoachB2!", "Roberto", "Cruz", ["Basketball", "Volleyball"]],
  ["coach.c", "coach.c@cauayan.local", "UpgradeCoachC3!", "Elena", "Reyes", ["Arnis", "Table Tennis"]],
  ["coach.d", "coach.d@cauayan.local", "UpgradeCoachD4!", "Danilo", "Garcia", ["Chess", "Badminton"]],
  ["coach.e", "coach.e@cauayan.local", "UpgradeCoachE5!", "Fely", "Aquino", ["Athletics", "Chess"]],
  ["coach.f", "coach.f@cauayan.local", "UpgradeCoachF6!", "Ramon", "Domingo", ["Swimming", "Volleyball"]],
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

export async function provisionSampleData() {
  const report = { admins: 0, coaches: 0, schools: 0, sports: 0, events: 0, metrics: 0, athletes: 0, assessments: 0, results: 0, achievements: 0, eventPlans: 0, applications: 0, participants: 0 };

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
  const createdAthletes = await prisma.athlete.findMany({ take: 16, orderBy: { id: "asc" }, select: { id: true, eventId: true } });
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
    if (rng() > 0.4) {
      await prisma.achievement.create({
        data: {
          athleteId: athlete.id, achievementTitle: "Champion - " + (athlete.eventId ? "" : "Cauayan City"),
          achievementType: ["Champion", "Finalist", "MVP", "Gold Medal"][aIndex % 4],
          achievementDate: new Date(2026, aIndex % 12, 1), organization: "Cauayan City Division",
          description: "Sample achievement for testing",
        },
      });
      report.achievements += 1;
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
