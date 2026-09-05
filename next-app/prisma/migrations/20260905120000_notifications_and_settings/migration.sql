-- Add notification preference flags to coaches.
ALTER TABLE "coaches" ADD COLUMN "notify_sms" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "coaches" ADD COLUMN "notify_email" BOOLEAN NOT NULL DEFAULT true;

-- Settings store for schedule/auto-backup configuration.
CREATE TABLE "system_settings" (
  "id" SERIAL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");