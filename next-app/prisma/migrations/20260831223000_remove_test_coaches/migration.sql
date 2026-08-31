-- One-time data cleanup: remove leftover security-scan test coach accounts.
-- Scoped strictly by coach_code; safe to re-run (no-op if already gone).
-- Runs inside a transaction, so any unexpected failure rolls back.

-- 1) Dependent records of any athletes owned by these coaches
DELETE FROM coaching_notes
 WHERE athlete_id IN (
   SELECT id FROM athletes
    WHERE coach_id IN (
      SELECT id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012')));

DELETE FROM event_participants
 WHERE coach_id IN (
       SELECT id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012'))
    OR athlete_id IN (
       SELECT id FROM athletes
        WHERE coach_id IN (
          SELECT id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012')));

DELETE FROM athlete_status_history
 WHERE athlete_id IN (
   SELECT id FROM athletes
    WHERE coach_id IN (
      SELECT id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012')));

DELETE FROM achievements
 WHERE athlete_id IN (
   SELECT id FROM athletes
    WHERE coach_id IN (
      SELECT id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012')));

DELETE FROM assessment_results
 WHERE assessment_id IN (
   SELECT id FROM assessments
    WHERE athlete_id IN (
      SELECT id FROM athletes
       WHERE coach_id IN (
         SELECT id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012')))
       OR recorded_by IN (
         SELECT user_id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012')));

DELETE FROM assessments
 WHERE athlete_id IN (
       SELECT id FROM athletes
        WHERE coach_id IN (
          SELECT id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012')))
    OR recorded_by IN (
       SELECT user_id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012'));

-- Athlete-coach history referencing these coaches or their athletes
DELETE FROM athlete_coach_history
 WHERE coach_id IN (
       SELECT id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012'))
    OR athlete_id IN (
       SELECT id FROM athletes
        WHERE coach_id IN (
          SELECT id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012')));

-- 2) Athletes owned by these coaches
DELETE FROM athletes
 WHERE coach_id IN (
   SELECT id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012'));

-- 3) Coach-level associations
DELETE FROM coach_sports
 WHERE coach_id IN (
   SELECT id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012'));

DELETE FROM event_applications
 WHERE coach_id IN (
   SELECT id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012'));

-- 4) The user rows (cascades to the coach row)
DELETE FROM users
 WHERE id IN (
   SELECT user_id FROM coaches WHERE coach_code IN ('COA-000011','COA-000012'));
