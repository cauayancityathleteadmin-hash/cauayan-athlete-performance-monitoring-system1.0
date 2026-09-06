-- LOCAL TEST DATA ONLY. Do not run this migration on a production database.
-- Passwords are documented in docs/test-accounts.md.

INSERT IGNORE INTO schools (school_name) VALUES
('Cauayan City National High School'),
('Isabela National High School'),
('University of Cagayan Valley - Cauayan');

INSERT IGNORE INTO sports (sport_name, description) VALUES
('Athletics', 'Track and field events'),
('Swimming', 'Aquatic sports'),
('Basketball', 'Team basketball'),
('Volleyball', 'Indoor and beach volleyball');

INSERT IGNORE INTO users (username, email, password_hash, role, status) VALUES
('admin-test', 'admin.test@cauayan.local', '$2y$10$5nzjD44CFvY4EBa69xgsW.t8VlolkA6oADZsfvZkWqtJfKFEiHiqW', 'admin', 'active'),
('coach-001', 'coach.one@cauayan.local', '$2y$10$orzuvyM/0fGA1mdKPVmdSOcSwtuEM9ih342sdRUliV275JRdDBBsy', 'coach', 'active'),
('coach-002', 'coach.two@cauayan.local', '$2y$10$UltEy0QAEyketZzvDy.T7OQfcyIo/vaXdkM.SPQz.ub2xEDPILLei', 'coach', 'active'),
('coach-003', 'coach.three@cauayan.local', '$2y$10$fq.wy08NDHSMfYEuiMhXLOAIltqEDiO9ATzorCHsKht5gtJoa4gYm', 'coach', 'active');

INSERT IGNORE INTO coaches
    (user_id, coach_code, first_name, middle_name, last_name, birthdate, email, school_id, status, date_registered)
SELECT u.id, 'COA-TEST01', 'Maria', 'Santos', 'Reyes', '1985-04-12', u.email,
       (SELECT id FROM schools WHERE school_name='Cauayan City National High School'), 'active', CURDATE()
FROM users u WHERE u.username='coach-001';
INSERT IGNORE INTO coaches
    (user_id, coach_code, first_name, middle_name, last_name, birthdate, email, school_id, status, date_registered)
SELECT u.id, 'COA-TEST02', 'Roberto', 'Dela', 'Cruz', '1982-09-23', u.email,
       (SELECT id FROM schools WHERE school_name='Isabela National High School'), 'active', CURDATE()
FROM users u WHERE u.username='coach-002';
INSERT IGNORE INTO coaches
    (user_id, coach_code, first_name, middle_name, last_name, birthdate, email, school_id, status, date_registered)
SELECT u.id, 'COA-TEST03', 'Elena', 'Mendoza', 'Garcia', '1990-01-30', u.email,
       (SELECT id FROM schools WHERE school_name='University of Cagayan Valley - Cauayan'), 'active', CURDATE()
FROM users u WHERE u.username='coach-003';

INSERT IGNORE INTO coach_sports (coach_id, sport_id)
SELECT c.id, s.id FROM coaches c JOIN users u ON u.id=c.user_id JOIN sports s
WHERE u.username='coach-001' AND s.sport_name IN ('Athletics','Swimming');
INSERT IGNORE INTO coach_sports (coach_id, sport_id)
SELECT c.id, s.id FROM coaches c JOIN users u ON u.id=c.user_id JOIN sports s
WHERE u.username='coach-002' AND s.sport_name IN ('Basketball','Volleyball');
INSERT IGNORE INTO coach_sports (coach_id, sport_id)
SELECT c.id, s.id FROM coaches c JOIN users u ON u.id=c.user_id JOIN sports s
WHERE u.username='coach-003' AND s.sport_name IN ('Athletics','Basketball');

INSERT IGNORE INTO athletes
    (athlete_code, first_name, middle_name, last_name, birthdate, gender, contact_number, email, address, school_id, sport_id, coach_id, status, date_registered)
SELECT x.athlete_code, x.first_name, x.middle_name, x.last_name, x.birthdate, x.gender, x.contact_number, x.email, x.address,
       (SELECT id FROM schools WHERE school_name=x.school_name), (SELECT id FROM sports WHERE sport_name=x.sport_name),
       (SELECT c.id FROM coaches c WHERE c.coach_code=x.coach_code), 'active', CURDATE()
FROM (
    SELECT 'ATH-TEST001' athlete_code, 'Juan' first_name, 'Pedro' middle_name, 'Dela Cruz' last_name, '2008-04-15' birthdate, 'male' gender, '09170000001' contact_number, 'juan.test@cauayan.local' email, 'Cauayan City' address, 'Cauayan City National High School' school_name, 'Athletics' sport_name, 'COA-TEST01' coach_code
    UNION ALL SELECT 'ATH-TEST002','Ana','Marie','Santos','2009-07-22','female','09170000002','ana.test@cauayan.local','Cauayan City','Cauayan City National High School','Swimming','COA-TEST01'
    UNION ALL SELECT 'ATH-TEST003','Miguel','Luis','Reyes','2007-11-03','male','09170000003','miguel.test@cauayan.local','Cauayan City','Cauayan City National High School','Athletics','COA-TEST01'
    UNION ALL SELECT 'ATH-TEST004','Carlo','Ben','Mendoza','2008-02-18','male','09170000004','carlo.test@cauayan.local','Cauayan City','Isabela National High School','Basketball','COA-TEST02'
    UNION ALL SELECT 'ATH-TEST005','Sofia','Luna','Garcia','2009-06-09','female','09170000005','sofia.test@cauayan.local','Cauayan City','Isabela National High School','Volleyball','COA-TEST02'
    UNION ALL SELECT 'ATH-TEST006','Mark','Jose','Navarro','2007-12-25','male','09170000006','mark.test@cauayan.local','Cauayan City','Isabela National High School','Basketball','COA-TEST02'
    UNION ALL SELECT 'ATH-TEST007','Leah','Grace','Torres','2008-08-11','female','09170000007','leah.test@cauayan.local','Cauayan City','University of Cagayan Valley - Cauayan','Athletics','COA-TEST03'
    UNION ALL SELECT 'ATH-TEST008','Paolo','Nico','Ramos','2009-03-14','male','09170000008','paolo.test@cauayan.local','Cauayan City','University of Cagayan Valley - Cauayan','Basketball','COA-TEST03'
    UNION ALL SELECT 'ATH-TEST009','Ivy','Mae','Flores','2008-10-28','female','09170000009','ivy.test@cauayan.local','Cauayan City','University of Cagayan Valley - Cauayan','Athletics','COA-TEST03'
) x;

INSERT IGNORE INTO event_plans (event_name, description, start_date, end_date, venue, status, program_flow, created_by)
SELECT 'TEST - Cauayan City Sports Festival', 'Sample plan for testing applications and participants.', '2026-10-10', '2026-10-12', 'Cauayan City Sports Complex', 'open',
       '2026-10-10 08:00 | Opening ceremony | Main court\n2026-10-10 09:00 | Athletics heats | Track\n2026-10-11 09:00 | Basketball games | Main court', u.id
FROM users u WHERE u.username='admin-test'
    AND NOT EXISTS (SELECT 1 FROM event_plans WHERE event_name='TEST - Cauayan City Sports Festival');

INSERT IGNORE INTO event_plan_sports (event_plan_id, sport_id)
SELECT ep.id, s.id FROM event_plans ep JOIN sports s
WHERE ep.event_name='TEST - Cauayan City Sports Festival' AND s.sport_name IN ('Athletics','Basketball');

INSERT IGNORE INTO event_applications (event_plan_id, coach_id, status, reason, reviewed_at, reviewed_by)
SELECT ep.id, c.id, 'approved', 'Sample approved application.', NOW(), u.id FROM event_plans ep JOIN coaches c ON c.coach_code='COA-TEST01' JOIN users u ON u.username='admin-test' WHERE ep.event_name='TEST - Cauayan City Sports Festival';
INSERT IGNORE INTO event_applications (event_plan_id, coach_id, status, reason, reviewed_at, reviewed_by)
SELECT ep.id, c.id, 'rejected', 'Sample rejected application for testing.', NOW(), u.id FROM event_plans ep JOIN coaches c ON c.coach_code='COA-TEST02' JOIN users u ON u.username='admin-test' WHERE ep.event_name='TEST - Cauayan City Sports Festival';
INSERT IGNORE INTO event_applications (event_plan_id, coach_id, status)
SELECT ep.id, c.id, 'pending' FROM event_plans ep JOIN coaches c ON c.coach_code='COA-TEST03' WHERE ep.event_name='TEST - Cauayan City Sports Festival';

-- Keep one pending application available for repeating the approval test locally.
UPDATE event_applications ea JOIN event_plans ep ON ep.id=ea.event_plan_id JOIN coaches c ON c.id=ea.coach_id
SET ea.status='pending', ea.reason=NULL, ea.reviewed_at=NULL, ea.reviewed_by=NULL
WHERE ep.event_name='TEST - Cauayan City Sports Festival' AND c.coach_code='COA-TEST03';
DELETE p FROM event_participants p JOIN event_plans ep ON ep.id=p.event_plan_id JOIN coaches c ON c.id=p.coach_id
WHERE ep.event_name='TEST - Cauayan City Sports Festival' AND c.coach_code='COA-TEST03' AND p.participant_type='coach';