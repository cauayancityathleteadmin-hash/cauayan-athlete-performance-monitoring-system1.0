-- Add plan_type column to training_plans table
ALTER TABLE "training_plans" ADD COLUMN "plan_type" TEXT NOT NULL DEFAULT 'normal';