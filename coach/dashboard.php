<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';
require_coach_or_admin();

if (is_admin()) redirect('admin/dashboard.php');

$coachId = get_coach_id_for_user(current_user_id());

$stmt = db()->prepare("SELECT COUNT(*) FROM athletes WHERE coach_id=?");
$stmt->execute([$coachId]); $athleteCount=(int)$stmt->fetchColumn();

$stmt = db()->prepare("SELECT COUNT(*) FROM athletes WHERE coach_id=? AND status='active'");
$stmt->execute([$coachId]); $activeCount=(int)$stmt->fetchColumn();

$stmt = db()->prepare(
    "SELECT COUNT(*) FROM assessments ass
     JOIN athletes a ON a.id=ass.athlete_id
     WHERE a.coach_id=?"
);
$stmt->execute([$coachId]); $assessmentCount=(int)$stmt->fetchColumn();

$stmt = db()->prepare("SELECT COUNT(DISTINCT a.sport_id) FROM athletes a WHERE a.coach_id=?");
$stmt->execute([$coachId]); $sportCount=(int)$stmt->fetchColumn();

$stmt = db()->prepare("SELECT COUNT(DISTINCT event_plan_id) FROM event_participants WHERE coach_id=? AND status='active'");
$stmt->execute([$coachId]); $eventCount=(int)$stmt->fetchColumn();

$stmt = db()->prepare("SELECT COUNT(*) FROM event_applications WHERE coach_id=? AND status='pending'");
$stmt->execute([$coachId]); $pendingEventApplications=(int)$stmt->fetchColumn();

$stmt = db()->prepare("SELECT COUNT(*) FROM athletes a WHERE a.coach_id=? AND NOT EXISTS (SELECT 1 FROM assessments ass WHERE ass.athlete_id=a.id)");
$stmt->execute([$coachId]); $unassessedCount=(int)$stmt->fetchColumn();

$stmt = db()->prepare(
    "SELECT a.id AS athlete_id, a.athlete_code, CONCAT_WS(' ',a.first_name,a.last_name) AS athlete_name,
            ass.assessment_date, s.sport_name
     FROM assessments ass
     JOIN athletes a ON a.id=ass.athlete_id
     JOIN sports s ON s.id=a.sport_id
     WHERE a.coach_id=?
     ORDER BY ass.assessment_date DESC, ass.id DESC LIMIT 10"
);
$stmt->execute([$coachId]); $recent=$stmt->fetchAll();

$pageTitle='Coach Dashboard';
require __DIR__.'/../includes/header.php';
?>
<div class="page-title"><h1>Coach Dashboard</h1><div class="actions"><a class="btn" href="<?= BASE_URL ?>/analytics.php">View Analytics</a></div></div>
<div class="card-grid">
<div class="card"><h3>My Athletes</h3><div class="metric-number"><?= $athleteCount ?></div></div>
<div class="card"><h3>Active Athletes</h3><div class="metric-number"><?= $activeCount ?></div></div>
<div class="card"><h3>Assessments Recorded</h3><div class="metric-number"><?= $assessmentCount ?></div></div>
<div class="card"><h3>Sports Covered</h3><div class="metric-number"><?= $sportCount ?></div></div>
<div class="card"><h3>Events Covered</h3><div class="metric-number"><?= $eventCount ?></div></div>
<div class="card"><h3>Need Assessment</h3><div class="metric-number"><?= $unassessedCount ?></div></div>
<div class="card"><h3>Pending Event Applications</h3><div class="metric-number"><?= $pendingEventApplications ?></div></div>
</div>
<div class="panel">
<h2>Recent Assessments</h2>
<table><thead><tr><th>Date</th><th>Athlete</th><th>Sport</th></tr></thead><tbody>
<?php foreach($recent as $r): ?><tr><td><?= e(format_date($r['assessment_date'])) ?></td><td><a href="<?= BASE_URL ?>/athletes/view.php?id=<?= (int)$r['athlete_id'] ?>"><?= e($r['athlete_code']) ?> — <?= e($r['athlete_name']) ?></a></td><td><?= e($r['sport_name']) ?></td></tr><?php endforeach; ?>
<?php if(!$recent): ?><tr><td colspan="3">No assessments recorded yet.</td></tr><?php endif; ?>
</tbody></table>
</div>
<?php require __DIR__.'/../includes/footer.php'; ?>
