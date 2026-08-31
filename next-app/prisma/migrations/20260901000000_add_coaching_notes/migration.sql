-- CreateTable
CREATE TABLE "coaching_notes" (
    "id" SERIAL NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "author_id" INTEGER,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coaching_notes_athlete_id_created_at_idx" ON "coaching_notes"("athlete_id", "created_at");

-- AddForeignKey
ALTER TABLE "coaching_notes" ADD CONSTRAINT "coaching_notes_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_notes" ADD CONSTRAINT "coaching_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
