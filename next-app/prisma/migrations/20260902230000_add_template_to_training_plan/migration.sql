-- Add is_template column to training_plans table
ALTER TABLE "training_plans" ADD COLUMN "is_template" BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for template queries
CREATE INDEX "training_plans_is_template_idx" ON "training_plans" ("is_template");