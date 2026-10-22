-- CreateTable
CREATE TABLE "event_photos" (
    "id" SERIAL NOT NULL,
    "event_plan_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'event',
    "sport_id" INTEGER,
    "athlete_id" INTEGER,
    "caption" TEXT,
    "url" TEXT NOT NULL,
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_photos_event_plan_id_category_idx" ON "event_photos"("event_plan_id", "category");

-- AddForeignKey
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_event_plan_id_fkey" FOREIGN KEY ("event_plan_id") REFERENCES "event_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
