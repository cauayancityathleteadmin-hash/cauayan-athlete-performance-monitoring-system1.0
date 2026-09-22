-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('individual', 'smallTeam', 'largeTeam');

-- AlterTable
ALTER TABLE "achievements" ADD COLUMN     "is_record" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "event_category" "EventCategory" NOT NULL DEFAULT 'individual';

-- Data migration: map existing 'district' achievements onto the locked 'city' tier
UPDATE "achievements" SET "level" = 'city' WHERE "level" = 'district';

-- Data migration: classify existing team events as large-team (planned 4+ player sports)
UPDATE "events" SET "event_category" = 'largeTeam' WHERE "event_name" IN ('5x5 Basketball', 'Indoor Volleyball', '9-Inning Game');