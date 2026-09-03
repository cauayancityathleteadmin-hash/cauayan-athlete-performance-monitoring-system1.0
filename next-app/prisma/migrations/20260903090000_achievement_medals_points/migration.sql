-- Add structured medal/level/fk/points fields to achievements
ALTER TABLE "achievements" ADD COLUMN "medal" TEXT;
ALTER TABLE "achievements" ADD COLUMN "level" TEXT;
ALTER TABLE "achievements" ADD COLUMN "sport_id" INTEGER;
ALTER TABLE "achievements" ADD COLUMN "event_id" INTEGER;
ALTER TABLE "achievements" ADD COLUMN "certificate_url" TEXT;

-- Foreign keys for achievement sport/event
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for lookup by sport/event
CREATE INDEX "achievements_athlete_id_achievement_date_idx" ON "achievements" ("athlete_id", "achievement_date");

-- Points configuration table (admin editable)
CREATE TABLE "points_config" (
    "id" SERIAL NOT NULL,
    "medal" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    CONSTRAINT "points_config_pkey" PRIMARY KEY ("id")
);

-- Unique per medal+level
CREATE UNIQUE INDEX "points_config_medal_level_key" ON "points_config" ("medal", "level");

-- Seed default points (nominal, admin tunable)
INSERT INTO "points_config" ("medal", "level", "points") VALUES
    ('gold', 'intramural', 2),
    ('silver', 'intramural', 1),
    ('bronze', 'intramural', 1),
    ('gold', 'district', 5),
    ('silver', 'district', 3),
    ('bronze', 'district', 1),
    ('gold', 'regional', 10),
    ('silver', 'regional', 6),
    ('bronze', 'regional', 3),
    ('gold', 'national', 20),
    ('silver', 'national', 12),
    ('bronze', 'national', 6),
    ('gold', 'international', 40),
    ('silver', 'international', 24),
    ('bronze', 'international', 12);
