-- AlterTable: training_plans add duration_days
ALTER TABLE "training_plans" ADD COLUMN "duration_days" INTEGER;

-- Backfill duration_days from duration_weeks where the new column is empty
UPDATE "training_plans" SET "duration_days" = "duration_weeks" * 7 WHERE "duration_days" IS NULL AND "duration_weeks" IS NOT NULL;

-- CreateTable
CREATE TABLE "athlete_plan_comments" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "athlete_plan_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "athlete_plan_comments_plan_id_athlete_id_idx" ON "athlete_plan_comments"("plan_id", "athlete_id");

-- AddForeignKey
ALTER TABLE "athlete_plan_comments" ADD CONSTRAINT "athlete_plan_comments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_plan_comments" ADD CONSTRAINT "athlete_plan_comments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_plan_comments" ADD CONSTRAINT "athlete_plan_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;