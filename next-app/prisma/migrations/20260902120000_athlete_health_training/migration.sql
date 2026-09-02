-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('healthy', 'sick', 'injured', 'recovering', 'inactive');

-- CreateEnum
CREATE TYPE "TrainingSessionType" AS ENUM ('regular', 'conditioning', 'technical', 'tactical', 'recovery', 'competition_simulation', 'tryout');

-- CreateEnum
CREATE TYPE "ExerciseCategory" AS ENUM ('warmup', 'mobility', 'strength', 'power', 'speed_agility', 'endurance', 'skill_technique', 'tactical', 'cooldown', 'recovery');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'late', 'excused', 'absent');

-- AlterTable
ALTER TABLE "coaches" ADD COLUMN     "can_approve_coaches" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "athletes" ADD COLUMN     "health_notes" TEXT,
ADD COLUMN     "health_status" "HealthStatus" NOT NULL DEFAULT 'healthy',
ADD COLUMN     "height" DECIMAL(65,30),
ADD COLUMN     "picture_url" TEXT,
ADD COLUMN     "weight" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "event_plans" ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "target_age_max" INTEGER,
ADD COLUMN     "target_age_min" INTEGER,
ADD COLUMN     "target_gender" TEXT,
ADD COLUMN     "target_participants" INTEGER;

-- CreateTable
CREATE TABLE "health_logs" (
    "id" SERIAL NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "status" "HealthStatus" NOT NULL,
    "description" TEXT,
    "reported_by" INTEGER,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" INTEGER,

    CONSTRAINT "health_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" SERIAL NOT NULL,
    "session_date" TIMESTAMP(3) NOT NULL,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "session_type" "TrainingSessionType" NOT NULL DEFAULT 'regular',
    "sport_id" INTEGER NOT NULL,
    "coach_id" INTEGER NOT NULL,
    "venue" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_exercises" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "exercise_name" TEXT NOT NULL,
    "category" "ExerciseCategory" NOT NULL,
    "description" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "target_sets" INTEGER,
    "target_reps" INTEGER,
    "target_duration" INTEGER,
    "target_load" DECIMAL(65,30),
    "target_distance" DECIMAL(65,30),
    "target_heart_rate" INTEGER,
    "equipment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_performances" (
    "id" SERIAL NOT NULL,
    "exercise_id" INTEGER NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "attendance_id" INTEGER,
    "sets_completed" INTEGER,
    "reps_completed" INTEGER,
    "duration_sec" INTEGER,
    "load_used" DECIMAL(65,30),
    "distance_covered" DECIMAL(65,30),
    "heart_rate_avg" INTEGER,
    "heart_rate_max" INTEGER,
    "rpe" INTEGER,
    "score" DECIMAL(65,30),
    "score_breakdown" JSONB,
    "notes" TEXT,
    "recorded_by" INTEGER NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_performances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_attendances" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'present',
    "check_in_time" TIMESTAMP(3),
    "check_out_time" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "training_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_performances" (
    "id" SERIAL NOT NULL,
    "coach_id" INTEGER NOT NULL,
    "evaluator_id" INTEGER NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "session_planning" INTEGER NOT NULL,
    "exercise_selection" INTEGER NOT NULL,
    "technical_instruction" INTEGER NOT NULL,
    "athlete_development" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "safety_compliance" INTEGER NOT NULL,
    "overall_score" DECIMAL(65,30) NOT NULL,
    "strengths" TEXT,
    "areas_for_improvement" TEXT,
    "action_plan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_performances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_logs_athlete_id_reported_at_idx" ON "health_logs"("athlete_id", "reported_at");

-- CreateIndex
CREATE INDEX "training_sessions_coach_id_session_date_idx" ON "training_sessions"("coach_id", "session_date");

-- CreateIndex
CREATE INDEX "training_sessions_sport_id_session_date_idx" ON "training_sessions"("sport_id", "session_date");

-- CreateIndex
CREATE INDEX "training_exercises_session_id_order_index_idx" ON "training_exercises"("session_id", "order_index");

-- CreateIndex
CREATE INDEX "exercise_performances_athlete_id_recorded_at_idx" ON "exercise_performances"("athlete_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_performances_exercise_id_athlete_id_key" ON "exercise_performances"("exercise_id", "athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_attendances_session_id_athlete_id_key" ON "training_attendances"("session_id", "athlete_id");

-- CreateIndex
CREATE INDEX "coach_performances_coach_id_period_start_idx" ON "coach_performances"("coach_id", "period_start");

-- AddForeignKey
ALTER TABLE "health_logs" ADD CONSTRAINT "health_logs_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_logs" ADD CONSTRAINT "health_logs_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_logs" ADD CONSTRAINT "health_logs_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_exercises" ADD CONSTRAINT "training_exercises_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_performances" ADD CONSTRAINT "exercise_performances_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "training_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_performances" ADD CONSTRAINT "exercise_performances_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_performances" ADD CONSTRAINT "exercise_performances_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "training_attendances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_performances" ADD CONSTRAINT "exercise_performances_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendances" ADD CONSTRAINT "training_attendances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendances" ADD CONSTRAINT "training_attendances_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_performances" ADD CONSTRAINT "coach_performances_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_performances" ADD CONSTRAINT "coach_performances_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
