<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';
require_admin();

$stats = [];
$stats['athletes'] = (int)db()->query("SELECT COUNT(*) FROM athletes")->fetchColumn();
$stats['active_athletes'] = (int)db()->query("SELECT COUNT(*) FROM athletes WHERE status='active'")->fetchColumn();
$stats['coaches'] = (int)db()->query("SELECT COUNT(*) FROM coaches")->fetchColumn();
$stats['active_coaches'] = (int)db()->query("SELECT COUNT(*) FROM coaches WHERE status='active'")->fetchColumn();
$stats['sports'] = (int)db()->query("SELECT COUNT(*) FROM sports WHERE status='active'")->fetchColumn();
$stats['events'] = (int)db()->query("SELECT COUNT(*) FROM events WHERE status='active'")->fetchColumn();
$stats['metrics'] = (int)db()->query("SELECT COUNT(*) FROM performance_metrics WHERE status='active'")->fetchColumn();
$stats['schools'] = (int)db()->query("SELECT COUNT(*) FROM schools WHERE status='active'")->fetchColumn();
$stats['pending_coaches'] = (int)db()->query("SELECT COUNT(*) FROM users WHERE role='coach' AND status='pending'")->fetchColumn();
$stats['assessments'] = (int)db()->query("SELECT COUNT(*) FROM assessments")->fetchColumn();
$stats['achievements'] = (int)db()->query("SELECT COUNT(*) FROM achievements")->fetchColumn();
$stats['event_plans'] = (int)db()->query("SELECT COUNT(*) FROM event_plans")->fetchColumn();
$stats['event_applications'] = (int)db()->query("SELECT COUNT(*) FROM event_applications WHERE status='pending'")->fetchColumn();

$recent = db()->query(
    "SELECT a.athlete_code,
            CONCAT_WS(' ', a.first_name, a.middle_name, a.last_name) AS athlete_name,
            s.sport_name, ass.assessment_date
     FROM assessments ass
     JOIN athletes a ON a.id = ass.athlete_id
     JOIN sports s ON s.id = a.sport_id
     ORDER BY ass.assessment_date DESC, ass.id DESC
     LIMIT 10"
)->fetchAll();

$pageTitle = 'Admin Dashboard';
require __DIR__ . '/../includes/header.php';
?>
<div class="page-title"><h1>Admin Dashboard</h1><div class="actions"><a class="btn" href="<?= BASE_URL ?>/analytics.php">View Analytics</a></div></div>

<div class="card-grid">
<?php foreach ([
    'athletes' => 'Total Athletes',
    'active_athletes' => 'Active Athletes',
    'coaches' => 'Total Coaches',
    'active_coaches' => 'Active Coaches',
    'sports' => 'Active Sports',
    'events' => 'Active Events',
    'metrics' => 'Active Metrics',
    'schools' => 'Schools',
    'pending_coaches' => 'Pending Coaches',
    'assessments' => 'Assessments',
    'achievements' => 'Achievements',
    'event_plans' => 'Sports Event Plans',
    'event_applications' => 'Pending Event Applications'
] as $key => $label): ?>
<div class="card"><h3><?= e($label) ?></h3><div class="metric-number"><?= $stats[$key] ?></div></div>
<?php endforeach; ?>
</div>

<div class="panel">
<h2>Recent Assessments</h2>
<table>
<thead><tr><th>Date</th><th>Athlete</th><th>Sport</th></tr></thead>
<tbody>
<?php foreach ($recent as $row): ?>
<tr>
<td><?= e(format_date($row['assessment_date'])) ?></td>
<td><?= e($row['athlete_code']) ?> — <?= e($row['athlete_name']) ?></td>
<td><?= e($row['sport_name']) ?></td>
</tr>
<?php endforeach; ?>
<?php if (!$recent): ?><tr><td colspan="3">No assessments recorded yet.</td></tr><?php endif; ?>
</tbody>
</table>
</div>
<?php require __DIR__ . '/../includes/footer.php'; ?>
