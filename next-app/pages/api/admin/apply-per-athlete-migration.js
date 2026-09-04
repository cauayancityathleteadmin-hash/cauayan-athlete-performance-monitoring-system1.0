import { prisma } from "../../../lib/prisma";
import { requireSession, setSecurityHeaders } from "../../../lib/api-security";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;
  if (session.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only." });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const results = [];
  try {
    // 1. Check if athlete_id column exists
    const cols = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'plan_activities' AND column_name = 'athlete_id'
    `;
    const hasAthleteId = Array.isArray(cols) && cols.length > 0;

    if (hasAthleteId) {
      return res.status(200).json({ message: "Column athlete_id already exists.", results });
    }

    // 2. Add column
    await prisma.$executeRawUnsafe(`ALTER TABLE "plan_activities" ADD COLUMN "athlete_id" INTEGER;`);
    results.push({ step: "add column", ok: true });

    // 3. Backfill from first athlete on plan
    await prisma.$executeRawUnsafe(`
      UPDATE "plan_activities" pa
      SET "athlete_id" = (
        SELECT tpa."athlete_id"
        FROM "training_plan_athletes" tpa
        WHERE tpa."plan_id" = pa."plan_id"
        ORDER BY tpa."id"
        LIMIT 1
      )
      WHERE pa."athlete_id" IS NULL;
    `);
    results.push({ step: "backfill", ok: true });

    // 4. Set NOT NULL
    await prisma.$executeRawUnsafe(`ALTER TABLE "plan_activities" ALTER COLUMN "athlete_id" SET NOT NULL;`);
    results.push({ step: "set not null", ok: true });

    // 5. Drop old index
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "plan_activities_plan_id_order_index_idx";`);
    results.push({ step: "drop old index", ok: true });

    // 6. Create new index
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "plan_activities_plan_id_athlete_id_order_index_idx" ON "plan_activities"("plan_id", "athlete_id", "order_index");`);
    results.push({ step: "create new index", ok: true });

    // 7. Add FK (idempotent)
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'plan_activities_athlete_id_fkey'
            AND table_name = 'plan_activities'
        ) THEN
          ALTER TABLE "plan_activities"
            ADD CONSTRAINT "plan_activities_athlete_id_fkey"
            FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
    results.push({ step: "add fk", ok: true });

    // 8. Drop obsolete table
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "plan_activity_targets";`);
    results.push({ step: "drop plan_activity_targets", ok: true });

    return res.status(200).json({ message: "Migration applied successfully.", results });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e), results });
  }
}