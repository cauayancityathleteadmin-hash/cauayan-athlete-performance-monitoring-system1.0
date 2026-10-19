-- AlterTable
ALTER TABLE "achievements" ADD COLUMN     "event_plan_id" INTEGER;

-- CreateIndex
CREATE INDEX "achievements_event_plan_id_idx" ON "achievements"("event_plan_id");

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_event_plan_id_fkey" FOREIGN KEY ("event_plan_id") REFERENCES "event_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
