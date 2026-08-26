-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'coach');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'active', 'inactive', 'rejected');

-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "AthleteGender" AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "MetricDataType" AS ENUM ('decimal', 'integer', 'text');

-- CreateEnum
CREATE TYPE "BetterDirection" AS ENUM ('higher', 'lower', 'neutral');

-- CreateEnum
CREATE TYPE "EventPlanStatus" AS ENUM ('draft', 'open', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ParticipantType" AS ENUM ('coach', 'athlete');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('active', 'removed');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'pending',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" SERIAL NOT NULL,
    "school_name" TEXT NOT NULL,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaches" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "coach_code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "suffix" TEXT,
    "birthdate" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "school_id" INTEGER,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "date_registered" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports" (
    "id" SERIAL NOT NULL,
    "sport_name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "sport_id" INTEGER NOT NULL,
    "event_name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_sports" (
    "coach_id" INTEGER NOT NULL,
    "sport_id" INTEGER NOT NULL,

    CONSTRAINT "coach_sports_pkey" PRIMARY KEY ("coach_id","sport_id")
);

-- CreateTable
CREATE TABLE "athletes" (
    "id" SERIAL NOT NULL,
    "athlete_code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "suffix" TEXT,
    "birthdate" TIMESTAMP(3) NOT NULL,
    "gender" "AthleteGender" NOT NULL,
    "contact_number" TEXT,
    "email" TEXT,
    "address" TEXT,
    "school_id" INTEGER,
    "sport_id" INTEGER NOT NULL,
    "event_id" INTEGER,
    "coach_id" INTEGER NOT NULL,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "date_registered" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athletes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_coach_history" (
    "id" SERIAL NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "coach_id" INTEGER NOT NULL,
    "assigned_by" INTEGER,
    "reason" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "athlete_coach_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_status_history" (
    "id" SERIAL NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "old_status" TEXT,
    "new_status" TEXT NOT NULL,
    "changed_by" INTEGER,
    "reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "athlete_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_metrics" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "metric_name" TEXT NOT NULL,
    "unit" TEXT,
    "data_type" "MetricDataType" NOT NULL DEFAULT 'decimal',
    "better_direction" "BetterDirection" NOT NULL DEFAULT 'neutral',
    "decimal_places" INTEGER NOT NULL DEFAULT 2,
    "minimum_value" DECIMAL(65,30),
    "maximum_value" DECIMAL(65,30),
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" SERIAL NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "recorded_by" INTEGER NOT NULL,
    "assessment_date" TIMESTAMP(3) NOT NULL,
    "assessment_type" TEXT NOT NULL DEFAULT 'Regular Assessment',
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" SERIAL NOT NULL,
    "assessment_id" INTEGER NOT NULL,
    "metric_id" INTEGER NOT NULL,
    "value_decimal" DECIMAL(65,30),
    "value_text" TEXT,
    "notes" TEXT,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" SERIAL NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "achievement_title" TEXT NOT NULL,
    "achievement_type" TEXT,
    "achievement_date" TIMESTAMP(3),
    "organization" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" INTEGER,
    "description" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_plans" (
    "id" SERIAL NOT NULL,
    "event_name" TEXT NOT NULL,
    "description" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "start_time" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "venue" TEXT NOT NULL,
    "status" "EventPlanStatus" NOT NULL DEFAULT 'draft',
    "program_flow" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_plan_sports" (
    "event_plan_id" INTEGER NOT NULL,
    "sport_id" INTEGER NOT NULL,

    CONSTRAINT "event_plan_sports_pkey" PRIMARY KEY ("event_plan_id","sport_id")
);

-- CreateTable
CREATE TABLE "event_applications" (
    "id" SERIAL NOT NULL,
    "event_plan_id" INTEGER NOT NULL,
    "coach_id" INTEGER NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" INTEGER,

    CONSTRAINT "event_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "id" SERIAL NOT NULL,
    "event_plan_id" INTEGER NOT NULL,
    "coach_id" INTEGER NOT NULL,
    "athlete_id" INTEGER,
    "sport_id" INTEGER NOT NULL,
    "participant_type" "ParticipantType" NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'active',
    "added_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "schools_school_name_key" ON "schools"("school_name");

-- CreateIndex
CREATE UNIQUE INDEX "coaches_user_id_key" ON "coaches"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "coaches_coach_code_key" ON "coaches"("coach_code");

-- CreateIndex
CREATE INDEX "coaches_school_id_status_idx" ON "coaches"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sports_sport_name_key" ON "sports"("sport_name");

-- CreateIndex
CREATE INDEX "events_sport_id_status_idx" ON "events"("sport_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "events_sport_id_event_name_key" ON "events"("sport_id", "event_name");

-- CreateIndex
CREATE UNIQUE INDEX "athletes_athlete_code_key" ON "athletes"("athlete_code");

-- CreateIndex
CREATE INDEX "athletes_coach_id_status_idx" ON "athletes"("coach_id", "status");

-- CreateIndex
CREATE INDEX "athletes_sport_id_event_id_idx" ON "athletes"("sport_id", "event_id");

-- CreateIndex
CREATE INDEX "athlete_coach_history_athlete_id_started_at_idx" ON "athlete_coach_history"("athlete_id", "started_at");

-- CreateIndex
CREATE INDEX "athlete_status_history_athlete_id_changed_at_idx" ON "athlete_status_history"("athlete_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "performance_metrics_event_id_metric_name_key" ON "performance_metrics"("event_id", "metric_name");

-- CreateIndex
CREATE INDEX "assessments_athlete_id_assessment_date_idx" ON "assessments"("athlete_id", "assessment_date");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_results_assessment_id_metric_id_key" ON "assessment_results"("assessment_id", "metric_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "event_plans_status_start_date_idx" ON "event_plans"("status", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "event_applications_event_plan_id_coach_id_key" ON "event_applications"("event_plan_id", "coach_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_participants_event_plan_id_coach_id_athlete_id_sport__key" ON "event_participants"("event_plan_id", "coach_id", "athlete_id", "sport_id");

-- AddForeignKey
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_sports" ADD CONSTRAINT "coach_sports_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_sports" ADD CONSTRAINT "coach_sports_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_coach_history" ADD CONSTRAINT "athlete_coach_history_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_coach_history" ADD CONSTRAINT "athlete_coach_history_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_coach_history" ADD CONSTRAINT "athlete_coach_history_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_status_history" ADD CONSTRAINT "athlete_status_history_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_status_history" ADD CONSTRAINT "athlete_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "performance_metrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_plans" ADD CONSTRAINT "event_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_plan_sports" ADD CONSTRAINT "event_plan_sports_event_plan_id_fkey" FOREIGN KEY ("event_plan_id") REFERENCES "event_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_plan_sports" ADD CONSTRAINT "event_plan_sports_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_applications" ADD CONSTRAINT "event_applications_event_plan_id_fkey" FOREIGN KEY ("event_plan_id") REFERENCES "event_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_applications" ADD CONSTRAINT "event_applications_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_applications" ADD CONSTRAINT "event_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_plan_id_fkey" FOREIGN KEY ("event_plan_id") REFERENCES "event_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
