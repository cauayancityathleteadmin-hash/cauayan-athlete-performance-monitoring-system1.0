-- Per-athlete training activities (idempotent, self-guarding)
-- Each PlanActivity now belongs to ONE athlete within the plan (athlete_id).
-- The shared-activity + per-athlete-target-override model (plan_activity_targets) is removed.

-- 1. Add athlete_id column if not exists
ALTER TABLE "plan_activities" ADD COLUMN IF NOT EXISTS "athlete_id" INTEGER;

-- 2. Backfill: assign each activity to the first athlete on its plan.
--    (Defensive: table is effectively empty in production; this handles any stray rows.)
--    Does NOT reference plan_activity_targets (which may not exist in all environments).
UPDATE "plan_activities" pa
SET "athlete_id" = (
  SELECT tpa."athlete_id"
  FROM "training_plan_athletes" tpa
  WHERE tpa."plan_id" = pa."plan_id"
  ORDER BY tpa."id"
  LIMIT 1
)
WHERE pa."athlete_id" IS NULL;

-- 3. Enforce NOT NULL (only after backfill)
ALTER TABLE "plan_activities" ALTER COLUMN "athlete_id" SET NOT NULL;

-- 4. Replace old (plan_id, order_index) index with per-athlete indexing
DROP INDEX IF EXISTS "plan_activities_plan_id_order_index_idx";
CREATE INDEX IF NOT EXISTS "plan_activities_plan_id_athlete_id_order_index_idx"
  ON "plan_activities"("plan_id", "athlete_id", "order_index");

-- 5. Add FK from activity to athlete (idempotent via DO block)
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

-- 6. Drop the obsolete per-athlete target override table if it exists
DROP TABLE IF EXISTS "plan_activity_targets";