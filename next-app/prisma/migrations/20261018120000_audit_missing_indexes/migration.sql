-- Add missing indexes identified in the code-quality audit (M-04).
-- These match the actual query shapes used by the progress page, reports,
-- admin audit filters, coach lookups, and expiry reminders.

-- Athlete-first attendance lookups (progress page, reports groupBy)
CREATE INDEX IF NOT EXISTS "training_attendances_athlete_id_session_id_idx" ON "training_attendances"("athlete_id", "session_id");

-- Admin audit page filters by action and by entity
CREATE INDEX IF NOT EXISTS "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- Coach-scoped application lookups
CREATE INDEX IF NOT EXISTS "event_applications_coach_id_status_idx" ON "event_applications"("coach_id", "status");

-- Expiry reminder / cleanup scans
CREATE INDEX IF NOT EXISTS "athlete_documents_expires_at_idx" ON "athlete_documents"("expires_at");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");
