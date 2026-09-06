-- Add separate daily start/end times for upcoming event plans.
ALTER TABLE event_plans
    ADD COLUMN IF NOT EXISTS start_time TIME NULL AFTER start_date,
    ADD COLUMN IF NOT EXISTS end_time TIME NULL AFTER end_date;