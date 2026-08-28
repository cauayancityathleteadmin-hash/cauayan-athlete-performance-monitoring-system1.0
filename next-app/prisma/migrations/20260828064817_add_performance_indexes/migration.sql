-- CreateIndex
CREATE INDEX "achievements_athlete_id_achievement_date_idx" ON "achievements"("athlete_id", "achievement_date");

-- CreateIndex
CREATE INDEX "assessment_results_metric_id_idx" ON "assessment_results"("metric_id");

-- CreateIndex
CREATE INDEX "assessments_recorded_by_assessment_date_idx" ON "assessments"("recorded_by", "assessment_date");

-- CreateIndex
CREATE INDEX "event_applications_event_plan_id_status_idx" ON "event_applications"("event_plan_id", "status");

-- CreateIndex
CREATE INDEX "event_participants_event_plan_id_athlete_id_idx" ON "event_participants"("event_plan_id", "athlete_id");
