import { prisma } from "./prisma";

// The build-time `prisma migrate deploy` is not wired into Vercel (only
// `prisma generate` + `next build` run), so committed migrations are NOT applied
// to the live Neon database. Missing columns break queries (e.g. login). This
// module runs idempotent DDL at runtime so the schema self-heals on demand.
// All statements use IF NOT EXISTS, so re-runs and concurrent cold starts are safe.

const STMTS = [
  `ALTER TABLE "coaches" ADD COLUMN IF NOT EXISTS "picture_url" TEXT`,
  `ALTER TABLE "athletes" ADD COLUMN IF NOT EXISTS "picture_url" TEXT`,
  `ALTER TABLE "training_plans" ADD COLUMN IF NOT EXISTS "duration_weeks" INTEGER`,
  `ALTER TABLE "training_plans" ADD COLUMN IF NOT EXISTS "duration_days" INTEGER`,
  `ALTER TABLE "coaches" ADD COLUMN IF NOT EXISTS "notify_sms" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "coaches" ADD COLUMN IF NOT EXISTS "notify_email" BOOLEAN NOT NULL DEFAULT true`,
  `CREATE TABLE IF NOT EXISTS "system_settings" ("id" SERIAL PRIMARY KEY, "key" TEXT NOT NULL, "value" TEXT NOT NULL, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_key_key" ON "system_settings"("key")`,
  `CREATE TABLE IF NOT EXISTS "athlete_plan_comments" ("id" SERIAL PRIMARY KEY, "plan_id" INTEGER NOT NULL, "athlete_id" INTEGER NOT NULL, "author_id" INTEGER NOT NULL, "body" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS "athlete_plan_comments_plan_id_athlete_id_idx" ON "athlete_plan_comments"("plan_id", "athlete_id")`,
];

let checked = false;
let inflight = null;

export async function ensureSchema() {
  if (checked) return;
  if (inflight) return inflight;
  inflight = (async () => {
    for (const sql of STMTS) {
      try {
        await prisma.$executeRawUnsafe(sql);
      } catch (e) {
        console.warn("[db-schema] stmt skipped:", e && e.message);
      }
    }
    checked = true;
    inflight = null;
  })();
  return inflight;
}
