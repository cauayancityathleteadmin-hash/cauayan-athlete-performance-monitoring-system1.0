import { prisma } from "./prisma";

// The build-time `prisma migrate deploy` is not wired into Vercel (only
// `prisma generate` + `next build` run), so committed migrations are NOT applied
// to the live Neon database. Missing columns break queries (e.g. login). This
// module runs idempotent DDL at runtime so the schema self-heals on demand.
// All statements use IF NOT EXISTS, so re-runs and concurrent cold starts are safe.

const STMTS = [
  `ALTER TABLE "coaches" ADD COLUMN IF NOT EXISTS "picture_url" TEXT`,
  `ALTER TABLE "athletes" ADD COLUMN IF NOT EXISTS "picture_url" TEXT`,
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
