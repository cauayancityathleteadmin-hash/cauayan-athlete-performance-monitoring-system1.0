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
    const cols = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'plan_activities' AND column_name = 'day_index'
    `;
    const hasDayIndex = Array.isArray(cols) && cols.length > 0;
    if (hasDayIndex) {
      return res.status(200).json({ message: "day_index already exists — migration already applied.", results });
    }

    await prisma.$executeRawUnsafe(`ALTER TABLE "plan_activities" ADD COLUMN "day_index" INTEGER;`);
    results.push({ step: "add day_index", ok: true });

    await prisma.$executeRawUnsafe(`ALTER TABLE "plan_activities" ADD COLUMN IF NOT EXISTS "week_number" INTEGER;`);
    results.push({ step: "add week_number", ok: true });

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "plan_activities_plan_id_athlete_id_day_index_week_number_idx"
      ON "plan_activities"("plan_id", "athlete_id", "day_index", "week_number");
    `);
    results.push({ step: "create composite index", ok: true });

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'plan_activities_day_index_check'
        ) THEN
          ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_day_index_check"
            CHECK ("day_index" IS NULL OR ("day_index" >= 1 AND "day_index" <= 7));
        END IF;
      END $$;
    `);
    results.push({ step: "add day_index check", ok: true });

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'plan_activities_week_number_check'
        ) THEN
          ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_week_number_check"
            CHECK ("week_number" IS NULL OR "week_number" > 0);
        END IF;
      END $$;
    `);
    results.push({ step: "add week_number check", ok: true });

    return res.status(200).json({ message: "Day/week migration applied.", results });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e), results });
  }
}