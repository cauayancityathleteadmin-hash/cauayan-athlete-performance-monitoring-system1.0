-- Per-athlete training activities
-- Each PlanActivity now belongs to ONE athlete within the plan (athlete_id).
-- The shared-activity + per-athlete-target-override model (plan_activity_targets)
-- is removed.

-- 1. Add athlete_id (nullable first so any pre-existing rows can be backfilled)
ALTER TABLE "plan_activities" ADD COLUMN "athlete_id" INTEGER;

-- 2. Backfill: assign each activity to its single target athlete if one exists,
--    otherwise to the first athlete on the plan. (Table is effectively empty
--    in production; this is defensive so the DDL cannot fail on stray rows.)
UPDATE "plan_activities" pa
SET "athlete_id" = COALESCE(
  (
    SELECT t."athlete_id"
    FROM "plan_activity_targets" t
    WHERE t."activity_id" = pa."id"
    GROUP BY t."athlete_id"
    ORDER BY t."athlete_id"
    LIMIT 1
  ),
  (
    SELECT tpa."athlete_id"
    FROM "training_plan_athletes" tpa
    WHERE tpa."plan_id" = pa."plan_id"
    ORDER BY tpa."id"
    LIMIT 1
  )
)
WHERE pa."athlete_id" IS NULL;

-- 3. Enforce NOT NULL
ALTER TABLE "plan_activities" ALTER COLUMN "athlete_id" SET NOT NULL;

-- 4. Replace the old (plan_id, order_index) index with per-athlete indexing
DROP INDEX "plan_activities_plan_id_order_index_idx";
CREATE INDEX "plan_activities_plan_id_athlete_id_order_index_idx" ON "plan_activities"("plan_id", "athlete_id", "order_index");

-- 5. Foreign key from activity to athlete
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Drop the obsolete per-athlete target override table
DROP TABLE "plan_activity_targets";
