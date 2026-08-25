<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';
require_coach_or_admin();

$athleteId = (int)($_GET['id'] ?? 0);
if (!$athleteId) exit('Invalid athlete.');

$stmt = db()->prepare(
    "SELECT a.*, s.school_name, sp.sport_name, e.event_name, c.coach_code,
            CONCAT_WS(' ', a.first_name, a.middle_name, a.last_name, a.suffix) AS athlete_name,
            CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name, c.suffix) AS coach_name
     FROM athletes a
     LEFT JOIN schools s ON s.id=a.school_id
     JOIN sports sp ON sp.id=a.sport_id
     JOIN coaches c ON c.id=a.coach_id
     WHERE a.id=?"
);
$stmt->execute([$athleteId]);
$athlete = $stmt->fetch();

if (!$athlete) {
    http_response_code(404);
    exit('Athlete not found.');
}

$assessStmt = db()->prepare(
    "SELECT ass.id, ass.assessment_date, ass.assessment_type, ass.remarks,
            COUNT(ar.id) AS result_count
     FROM assessments ass
     LEFT JOIN assessment_results ar ON ar.assessment_id=ass.id
     WHERE ass.athlete_id=?
     GROUP BY ass.id
     ORDER BY ass.assessment_date DESC, ass.id DESC"
);
$assessStmt->execute([$athleteId]);
$assessments = $assessStmt->fetchAll();

$achStmt = db()->prepare(
    "SELECT achievement_title, achievement_type, achievement_date, organization, description
     FROM achievements WHERE athlete_id=? ORDER BY achievement_date DESC"
);
$achStmt->execute([$athleteId]);
$achievements = $achStmt->fetchAll();

$pageTitle = 'Athlete Profile';
require __DIR__ . '/../includes/header.php';
?>
<div class="page-title">
<h1>Athlete Profile</h1>
<div class="actions">
<a class="btn secondary" href="<?= BASE_URL ?>/<?= is_admin()?'admin/athletes.php':'coach/athletes.php' ?>">Back</a>
<?php if (is_admin() || coach_can_manage_athlete($athleteId, current_user_id())): ?>
<a class="btn" href="<?= BASE_URL ?>/coach/assessments.php?athlete_id=<?= $athleteId ?>">Record Assessment</a>
<?php if (is_coach()): ?><a class="btn secondary" href="<?= BASE_URL ?>/coach/reports.php?athlete_ids[]=<?= $athleteId ?>">Create Report</a><?php endif; ?>
<?php endif; ?>
</div>
</div>

<div class="panel">
<div class="profile-header">
<div class="avatar"><?= e(strtoupper(substr($athlete['first_name'],0,1).substr($athlete['last_name'],0,1))) ?></div>
<div><h2><?= e($athlete['athlete_name']) ?></h2><p class="small"><?= e($athlete['athlete_code']) ?> · Age <?= calculate_age($athlete['birthdate']) ?> · <?= e(ucfirst($athlete['gender'])) ?></p></div>
</div>
</div>

<div class="card-grid">
<div class="card"><h3>Sport</h3><div><?= e($athlete['sport_name']) ?></div></div>
<div class="card"><h3>Coach</h3><div><?= e($athlete['coach_code']) ?> — <?= e($athlete['coach_name']) ?></div></div>
<div class="card"><h3>Status</h3><div><span class="badge <?= e($athlete['status']) ?>"><?= e(ucfirst($athlete['status'])) ?></span></div></div>
</div>

<div class="panel">
<h2>Personal Information</h2>
<table>
<tr><th>Birthdate</th><td><?= e(format_date($athlete['birthdate'])) ?></td></tr>
<tr><th>Gender</th><td><?= e(ucfirst(str_replace('_',' ',$athlete['gender']))) ?></td></tr>
<tr><th>School</th><td><?= e($athlete['school_name'] ?? '—') ?></td></tr>
<tr><th>Contact</th><td><?= e($athlete['contact_number'] ?? '—') ?></td></tr>
<tr><th>Email</th><td><?= e($athlete['email'] ?? '—') ?></td></tr>
<tr><th>Address</th><td><?= e($athlete['address'] ?? '—') ?></td></tr>
<tr><th>Registered</th><td><?= e(format_date($athlete['date_registered'])) ?></td></tr>
</table>
</div>

<div class="panel">
<h2>Performance Assessments</h2>
<table>
<thead><tr><th>Date</th><th>Type</th><th>Results</th><th>Remarks</th></tr></thead>
<tbody>
<?php foreach($assessments as $a): ?>
<tr><td><?= e(format_date($a['assessment_date'])) ?></td><td><?= e($a['assessment_type']) ?></td><td><?= (int)$a['result_count'] ?></td><td><?= e($a['remarks'] ?? '—') ?></td></tr>
<?php endforeach; ?>
<?php if(!$assessments): ?><tr><td colspan="4">No assessments yet.</td></tr><?php endif; ?>
</tbody>
</table>
</div>

<div class="panel">
<h2>Achievements</h2>
<table>
<thead><tr><th>Date</th><th>Achievement</th><th>Type</th><th>Organization</th></tr></thead>
<tbody>
<?php foreach($achievements as $a): ?>
<tr><td><?= e(format_date($a['achievement_date'])) ?></td><td><?= e($a['achievement_title']) ?></td><td><?= e($a['achievement_type'] ?? '—') ?></td><td><?= e($a['organization'] ?? '—') ?></td></tr>
<?php endforeach; ?>
<?php if(!$achievements): ?><tr><td colspan="4">No achievements recorded yet.</td></tr><?php endif; ?>
</tbody>
</table>
</div>
<?php require __DIR__ . '/../includes/footer.php'; ?>
