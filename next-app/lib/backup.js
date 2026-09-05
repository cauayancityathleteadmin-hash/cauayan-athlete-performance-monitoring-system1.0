const APP_NAME = "cauayan-athlete-performance";
const SNAPSHOT_VERSION = 1;

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export const SYSTEM_ORDER = [
  "rate_limit_buckets",
  "points_config",
  "system_settings",
  "schools",
  "sports",
  "events",
  "performance_metrics",
  "users",
  "coaches",
  "coach_sports",
  "athletes",
  "athlete_coach_history",
  "athlete_status_history",
  "coaching_notes",
  "assessments",
  "assessment_results",
  "achievements",
  "event_plans",
  "event_plan_sports",
  "event_applications",
  "event_participants",
  "health_logs",
  "password_reset_tokens",
  "training_plans",
  "training_plan_athletes",
  "plan_activities",
  "plan_activity_logs",
  "training_notes",
  "training_sessions",
  "training_exercises",
  "training_attendances",
  "exercise_performances",
  "training_assessments",
  "coach_performances",
  "audit_logs",
];

export const COACH_ORDER = [
  "coaches",
  "coach_sports",
  "athletes",
  "athlete_coach_history",
  "athlete_status_history",
  "coaching_notes",
  "assessments",
  "assessment_results",
  "achievements",
  "health_logs",
  "training_plans",
  "training_plan_athletes",
  "plan_activities",
  "plan_activity_logs",
  "training_notes",
  "training_sessions",
  "training_exercises",
  "training_attendances",
  "exercise_performances",
  "training_assessments",
  "coach_performances",
];

const COACH_SELECT = {
  coaches: "id = $1",
  coach_sports: "coach_id = $1",
  athletes: "coach_id = $1",
  athlete_coach_history: "athlete_id IN (SELECT id FROM athletes WHERE coach_id = $1)",
  athlete_status_history: "athlete_id IN (SELECT id FROM athletes WHERE coach_id = $1)",
  coaching_notes: "athlete_id IN (SELECT id FROM athletes WHERE coach_id = $1)",
  assessments: "athlete_id IN (SELECT id FROM athletes WHERE coach_id = $1)",
  assessment_results: "assessment_id IN (SELECT id FROM assessments WHERE athlete_id IN (SELECT id FROM athletes WHERE coach_id = $1))",
  achievements: "athlete_id IN (SELECT id FROM athletes WHERE coach_id = $1)",
  health_logs: "athlete_id IN (SELECT id FROM athletes WHERE coach_id = $1)",
  training_plans: "coach_id = $1",
  training_plan_athletes: "plan_id IN (SELECT id FROM training_plans WHERE coach_id = $1)",
  plan_activities: "plan_id IN (SELECT id FROM training_plans WHERE coach_id = $1)",
  plan_activity_logs: "activity_id IN (SELECT id FROM plan_activities WHERE plan_id IN (SELECT id FROM training_plans WHERE coach_id = $1))",
  training_notes: "plan_id IN (SELECT id FROM training_plans WHERE coach_id = $1)",
  training_sessions: "coach_id = $1",
  training_exercises: "session_id IN (SELECT id FROM training_sessions WHERE coach_id = $1)",
  training_attendances: "session_id IN (SELECT id FROM training_sessions WHERE coach_id = $1)",
  exercise_performances: "exercise_id IN (SELECT e.id FROM training_exercises e JOIN training_sessions s ON s.id = e.session_id WHERE s.coach_id = $1) AND athlete_id IN (SELECT id FROM athletes WHERE coach_id = $1)",
  training_assessments: "plan_id IN (SELECT id FROM training_plans WHERE coach_id = $1) OR athlete_id IN (SELECT id FROM athletes WHERE coach_id = $1)",
  coach_performances: "coach_id = $1",
};

const CAST_BY_TYPE = {
  numeric: { name: "numeric" },
  real: { name: "real" },
  "double precision": { name: "double precision" },
  bigint: { name: "bigint" },
  integer: { name: "integer" },
  smallint: { name: "smallint" },
  boolean: { name: "boolean" },
  "timestamp without time zone": { name: "timestamp" },
  "timestamp with time zone": { name: "timestamptz" },
  date: { name: "date" },
  jsonb: { name: "jsonb" },
  json: { name: "jsonb" },
};

async function getTables(prisma) {
  const result = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`
  );
  return result.map((row) => row.tablename);
}

async function getColumnTypes(prisma) {
  const result = await prisma.$queryRawUnsafe(
    `SELECT table_name AS t, column_name AS c, data_type AS dt FROM information_schema.columns WHERE table_schema = 'public'`
  );
  const map = {};
  for (const row of result) {
    if (row.t === "_prisma_migrations") continue;
    if (!map[row.t]) map[row.t] = {};
    map[row.t][row.c] = row.dt;
  }
  return map;
}

function castSql(paramIndex, dataType) {
  const cast = CAST_BY_TYPE[dataType];
  if (!cast) return `$${paramIndex}`;
  return `CAST($${paramIndex} AS ${cast.name})`;
}

function toParam(value, dataType) {
  if (value === null || value === undefined) return null;
  if (dataType === "jsonb" || dataType === "json") return JSON.stringify(value);
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function snapshotTables(prisma, tables, selectByTable, param) {
  const out = {};
  for (const table of tables) {
    const sql = selectByTable && selectByTable[table]
      ? `SELECT row_to_json(t)::text AS "_row" FROM (SELECT * FROM ${quoteIdent(table)} WHERE ${selectByTable[table]}) t`
      : `SELECT row_to_json(t)::text AS "_row" FROM (SELECT * FROM ${quoteIdent(table)}) t`;
    const rows = selectByTable && selectByTable[table]
      ? await prisma.$queryRawUnsafe(sql, param)
      : await prisma.$queryRawUnsafe(sql);
    out[table] = rows.map((r) => r._row);
  }
  return out;
}

function decodeRows(rows) {
  if (!Array.isArray(rows)) return [];
  try {
    return rows.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
  } catch {
    throw new Error("Invalid backup file: row data is corrupted.");
  }
}

function makeSnapshot(scope, order, tables, counts) {
  return {
    app: APP_NAME,
    version: SNAPSHOT_VERSION,
    scope,
    createdAt: new Date().toISOString(),
    order,
    counts,
    tables,
  };
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("Invalid backup file: not an object.");
  if (snapshot.app !== APP_NAME) throw new Error("Invalid backup file: made by a different application.");
  if (snapshot.version !== SNAPSHOT_VERSION) throw new Error("Invalid backup file: unsupported format version.");
  if (!snapshot.scope || !["system", "coach"].includes(snapshot.scope)) throw new Error("Invalid backup file: unknown scope.");
  if (!snapshot.order || !Array.isArray(snapshot.order) || !snapshot.tables || typeof snapshot.tables !== "object") {
    throw new Error("Invalid backup file: missing tables data.");
  }
  return snapshot;
}

export async function buildSystemSnapshot(prisma) {
  const tables = await getTables(prisma);
  const present = SYSTEM_ORDER.filter((t) => tables.includes(t));
  const data = await snapshotTables(prisma, present, null, null);
  const counts = {};
  for (const table of present) counts[table] = data[table].length;
  return makeSnapshot("system", present, data, counts);
}

export async function buildCoachSnapshot(prisma, coachId) {
  const tables = await getTables(prisma);
  const present = COACH_ORDER.filter((t) => tables.includes(t));
  const data = await snapshotTables(prisma, present, COACH_SELECT, coachId);
  const counts = {};
  for (const table of present) counts[table] = data[table].length;
  const snap = makeSnapshot("coach", present, data, counts);
  snap.coachId = coachId;
  return snap;
}

async function insertRows(tx, typeMap, table, rows) {
  const cols = typeMap[table] || {};
  for (const row of rows) {
    const used = Object.keys(row).filter((k) => row[k] !== undefined);
    if (used.length === 0) continue;
    const colList = used.map(quoteIdent).join(", ");
    const sql = `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${used.map((k, i) => castSql(i + 1, cols[k])).join(", ")})`;
    const values = used.map((k) => toParam(row[k], cols[k]));
    await tx.$executeRawUnsafe(sql, ...values);
  }
}

async function syncSequences(tx, tables, typeMap) {
  for (const table of tables) {
    if (!typeMap[table] || !typeMap[table].id) continue;
    await tx.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('public.' || $1, 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${quoteIdent(table)}`,
      table
    );
  }
}

export async function restoreSystem(prisma, rawSnapshot) {
  const snapshot = validateSnapshot(rawSnapshot);
  if (snapshot.scope !== "system") throw new Error("Use an admin full-system backup to restore the whole database.");
  const tables = await getTables(prisma);
  const typeMap = await getColumnTypes(prisma);
  for (const table of Object.keys(snapshot.tables)) {
    if (!tables.includes(table)) throw new Error(`Backup contains table "${table}" which does not exist in this database.`);
  }
  for (const table of tables) {
    if (!snapshot.tables[table]) {
      throw new Error(`Restore blocked: the backup was created before table "${table}" was added or does not include it. Nothing was changed.`);
    }
  }
  const order = snapshot.order.filter((t) => tables.includes(t) && snapshot.tables[t]);
  const decoded = {};
  for (const table of Object.keys(snapshot.tables)) decoded[table] = decodeRows(snapshot.tables[table]);
  await prisma.$transaction(async (tx) => {
    const truncateList = tables.map(quoteIdent).join(", ");
    await tx.$executeRawUnsafe(`TRUNCATE ${truncateList} RESTART IDENTITY CASCADE`);
    for (const table of order) {
      if (!decoded[table]) continue;
      await insertRows(tx, typeMap, table, decoded[table]);
    }
    await syncSequences(tx, order, typeMap);
  });
  return summarize(snapshot);
}

function ids(rows) {
  return new Set(rows.map((r) => Number(r.id)).filter(Number.isFinite));
}

export async function restoreCoach(prisma, rawSnapshot, coachId) {
  const snapshot = validateSnapshot(rawSnapshot);
  if (snapshot.scope !== "coach") throw new Error("Only a coach backup file can be used to restore a coach's own data.");
  if (Number(snapshot.coachId) !== Number(coachId)) {
    throw new Error("This backup file belongs to a different coach. You can only restore your own data backup.");
  }

  const coachRows = decodeRows(snapshot.tables.coaches || []);
  if (coachRows.length !== 1 || Number(coachRows[0].id) !== Number(coachId)) {
    throw new Error("This backup file does not match your coach record.");
  }

  const myAthletes = ids(decodeRows(snapshot.tables.athletes || []));
  const myAssessments = ids(decodeRows(snapshot.tables.assessments || []));
  const myPlans = ids(decodeRows(snapshot.tables.training_plans || []));
  const myActivities = ids(decodeRows(snapshot.tables.plan_activities || []));
  const mySessions = ids(decodeRows(snapshot.tables.training_sessions || []));
  const myExercises = ids(decodeRows(snapshot.tables.training_exercises || []));

  const validators = {
    coaches: (r) => Number(r.id) === Number(coachId),
    coach_sports: (r) => Number(r.coach_id) === Number(coachId),
    athletes: (r) => Number(r.coach_id) === Number(coachId),
    athlete_coach_history: (r) => myAthletes.has(Number(r.athlete_id)),
    athlete_status_history: (r) => myAthletes.has(Number(r.athlete_id)),
    coaching_notes: (r) => myAthletes.has(Number(r.athlete_id)),
    assessments: (r) => myAthletes.has(Number(r.athlete_id)),
    assessment_results: (r) => myAssessments.has(Number(r.assessment_id)),
    achievements: (r) => myAthletes.has(Number(r.athlete_id)),
    health_logs: (r) => myAthletes.has(Number(r.athlete_id)),
    training_plans: (r) => Number(r.coach_id) === Number(coachId),
    training_plan_athletes: (r) => myPlans.has(Number(r.plan_id)),
    plan_activities: (r) => myPlans.has(Number(r.plan_id)),
    plan_activity_logs: (r) => myActivities.has(Number(r.activity_id)) && myAthletes.has(Number(r.athlete_id)),
    training_notes: (r) => myPlans.has(Number(r.plan_id)),
    training_sessions: (r) => Number(r.coach_id) === Number(coachId) || myPlans.has(Number(r.plan_id)),
    training_exercises: (r) => mySessions.has(Number(r.session_id)),
    training_attendances: (r) => mySessions.has(Number(r.session_id)) && myAthletes.has(Number(r.athlete_id)),
    exercise_performances: (r) => myExercises.has(Number(r.exercise_id)) && myAthletes.has(Number(r.athlete_id)),
    training_assessments: (r) => myPlans.has(Number(r.plan_id)) || myAthletes.has(Number(r.athlete_id)),
    coach_performances: (r) => Number(r.coach_id) === Number(coachId),
  };

  const tables = await getTables(prisma);
  const typeMap = await getColumnTypes(prisma);
  const order = snapshot.order.filter((t) => tables.includes(t) && snapshot.tables[t]);

  await prisma.$transaction(async (tx) => {
    for (const table of order.slice().reverse()) {
      const predicate = COACH_SELECT[table];
      if (!predicate) continue;
      await tx.$executeRawUnsafe(`DELETE FROM ${quoteIdent(table)} WHERE ${predicate}`, coachId);
    }
    for (const table of order) {
      const raw = snapshot.tables[table] || [];
      const rows = decodeRows(raw).filter((r) => validators[table] ? validators[table](r) : true);
      if (!validators[table]) throw new Error(`Restore blocked: table "${table}" is not part of a coach's own data.`);
      if (raw.length !== rows.length) {
        throw new Error(`Restore blocked: the backup contains data that is not yours in "${table}". Nothing was changed.`);
      }
      await insertRows(tx, typeMap, table, rows);
    }
    await syncSequences(tx, order, typeMap);
  });

  return summarize(snapshot);
}

function summarize(snapshot) {
  const total = Object.values(snapshot.counts || {}).reduce((a, b) => a + b, 0);
  return { scope: snapshot.scope, tables: snapshot.counts || {}, total, createdAt: snapshot.createdAt };
}

export async function getSetting(prisma, key) {
  const row = await prisma.systemSetting.findUnique({ where: { key }, select: { value: true } }).catch(() => null);
  return row?.value ?? null;
}

export async function setSetting(prisma, key, value) {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}