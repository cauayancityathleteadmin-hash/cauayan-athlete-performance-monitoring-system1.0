-- CreateEnum
CREATE TYPE "FitnessDimension" AS ENUM ('endurance', 'strength', 'power', 'speed_agility', 'skill_technique', 'mobility', 'recovery');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('planned', 'done', 'partial', 'missed');

-- CreateTable
CREATE TABLE "plan_activities" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "activity_name" TEXT NOT NULL,
    "fitness_type" "FitnessDimension" NOT NULL,
    "target_quantity" DECIMAL(65,30),
    "target_unit" TEXT,
    "target_sets" INTEGER,
    "target_reps" INTEGER,
    "target_distance" DECIMAL(65,30),
    "target_load" DECIMAL(65,30),
    "instructions" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_activity_targets" (
    "id" SERIAL NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "target_quantity" DECIMAL(65,30),
    "target_unit" TEXT,
    "target_sets" INTEGER,
    "target_reps" INTEGER,
    "target_distance" DECIMAL(65,30),
    "target_load" DECIMAL(65,30),
    "note" TEXT,

    CONSTRAINT "plan_activity_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_activity_logs" (
    "id" SERIAL NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'planned',
    "quantity_done" DECIMAL(65,30),
    "sets_done" INTEGER,
    "reps_done" INTEGER,
    "notes" TEXT,
    "logged_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_notes" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_notes_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "training_assessments" ADD COLUMN     "fitness_dimension" "FitnessDimension";

-- CreateIndex
CREATE INDEX "plan_activities_plan_id_order_index_idx" ON "plan_activities"("plan_id", "order_index");

-- CreateIndex
CREATE INDEX "plan_activity_targets_athlete_id_idx" ON "plan_activity_targets"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_activity_targets_activity_id_athlete_id_key" ON "plan_activity_targets"("activity_id", "athlete_id");

-- CreateIndex
CREATE INDEX "plan_activity_logs_athlete_id_performed_at_idx" ON "plan_activity_logs"("athlete_id", "performed_at");

-- CreateIndex
CREATE INDEX "plan_activity_logs_activity_id_athlete_id_idx" ON "plan_activity_logs"("activity_id", "athlete_id");

-- CreateIndex
CREATE INDEX "training_notes_plan_id_created_at_idx" ON "training_notes"("plan_id", "created_at");

-- AddForeignKey
ALTER TABLE "plan_activities" ADD CONSTRAINT "plan_activities_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activity_targets" ADD CONSTRAINT "plan_activity_targets_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "plan_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activity_targets" ADD CONSTRAINT "plan_activity_targets_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activity_logs" ADD CONSTRAINT "plan_activity_logs_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "plan_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activity_logs" ADD CONSTRAINT "plan_activity_logs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_activity_logs" ADD CONSTRAINT "plan_activity_logs_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_notes" ADD CONSTRAINT "training_notes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_notes" ADD CONSTRAINT "training_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;