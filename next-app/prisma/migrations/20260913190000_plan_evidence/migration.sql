-- CreateTable
CREATE TABLE "plan_evidence" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "evidence_date" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL,
    "notes" TEXT,
    "uploaded_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_evidence_plan_id_athlete_id_evidence_date_key" ON "plan_evidence"("plan_id", "athlete_id", "evidence_date");

-- CreateIndex
CREATE INDEX "plan_evidence_athlete_id_evidence_date_idx" ON "plan_evidence"("athlete_id", "evidence_date");

-- AddForeignKey
ALTER TABLE "plan_evidence" ADD CONSTRAINT "plan_evidence_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_evidence" ADD CONSTRAINT "plan_evidence_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_evidence" ADD CONSTRAINT "plan_evidence_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;