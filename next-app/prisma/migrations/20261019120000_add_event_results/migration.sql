-- §7 Events results: competition level per event plan, and per-participant
-- result medal so outcomes can auto-generate achievements (which feed Standing).
-- Additive/nullable columns only — safe on existing rows.

-- AlterTable
ALTER TABLE "event_plans" ADD COLUMN     "event_level" TEXT;

-- AlterTable
ALTER TABLE "event_participants" ADD COLUMN     "result_medal" TEXT,
ADD COLUMN     "result_recorded_at" TIMESTAMP(3);
