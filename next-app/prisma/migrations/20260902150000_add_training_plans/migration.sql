-- AlterTable
ALTER TABLE "training_sessions" ADD COLUMN     "plan_id" INTEGER;

-- CreateTable
CREATE TABLE "training_plans" (
    "id" SERIAL NOT NULL,
    "plan_name" TEXT NOT NULL,
    "description" TEXT,
    "sport_id" INTEGER NOT NULL,
    "coach_id" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'day',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_plan_athletes" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "athlete_id" INTEGER NOT NULL,

    CONSTRAINT "training_plan_athletes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_assessments" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER,
    "session_id" INTEGER,
    "athlete_id" INTEGER NOT NULL,
    "assessment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" INTEGER NOT NULL,
    "comments" TEXT,
    "assessed_by" INTEGER NOT NULL,

    CONSTRAINT "training_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_plans_coach_id_start_date_idx" ON "training_plans"("coach_id", "start_date");

-- CreateIndex
CREATE INDEX "training_plans_sport_id_start_date_idx" ON "training_plans"("sport_id", "start_date");

-- CreateIndex
CREATE INDEX "training_plan_athletes_athlete_id_idx" ON "training_plan_athletes"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_plan_athletes_plan_id_athlete_id_key" ON "training_plan_athletes"("plan_id", "athlete_id");

-- CreateIndex
CREATE INDEX "training_assessments_athlete_id_assessment_date_idx" ON "training_assessments"("athlete_id", "assessment_date");

-- CreateIndex
CREATE INDEX "training_assessments_plan_id_idx" ON "training_assessments"("plan_id");

-- CreateIndex
CREATE INDEX "training_sessions_plan_id_idx" ON "training_sessions"("plan_id");

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plan_athletes" ADD CONSTRAINT "training_plan_athletes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plan_athletes" ADD CONSTRAINT "training_plan_athletes_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assessments" ADD CONSTRAINT "training_assessments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assessments" ADD CONSTRAINT "training_assessments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assessments" ADD CONSTRAINT "training_assessments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assessments" ADD CONSTRAINT "training_assessments_assessed_by_fkey" FOREIGN KEY ("assessed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;