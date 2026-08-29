-- Add optional contact number to coaches (matches athletes.contact_number).
-- Idempotent so it is safe no matter how the schema is synced.
ALTER TABLE "coaches" ADD COLUMN IF NOT EXISTS "contact_number" TEXT;