-- 5 Training: session RPE (Rate of Perceived Exertion, 1-10) per logged
-- activity, so weekly perceived training load and overtraining spikes can be
-- tracked. Additive/nullable column — safe on existing rows.
ALTER TABLE "plan_activity_logs" ADD COLUMN "rpe" INTEGER;
