-- Idempotent: add the 2x2 ID picture column to coaches if it does not exist.
-- Uses ADD COLUMN IF NOT EXISTS so the migration is safe to re-run (e.g. when
-- prisma migrate deploy is skipped/disordered on the live database).
ALTER TABLE "coaches" ADD COLUMN IF NOT EXISTS "picture_url" TEXT;
