<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';
require_coach();

$coachId = get_coach_id_for_user((int)current_user_id());

// Card Metrics
$stmt = db()->prepare("SELECT COUNT(*) FROM athletes WHERE coach_id = ? AND status = 'active'");
$stmt->execute([$coachId]);
$totalAthletes = (int)$stmt->fetchColumn();

$stmt = db()->prepare("SELECT COUNT(*) FROM assessments WHERE recorded_by = ? AND assessment_date >= DATE_FORMAT(NOW(), '%Y-%m-01')");
$stmt->execute([current_user_id()]);
$assessmentsThisMonth = (int)$stmt->fetchColumn();

// Chart: Athletes by Sport
$athletesBySport = db()->prepare(
    "SELECT sp.sport_name, COUNT(a.id) as count
     FROM athletes a
     JOIN sports sp ON a.sport_id = sp.id
     WHERE a.coach_id = ?
     GROUP BY sp.sport_name
     ORDER BY count DESC, sp.sport_name"
);
$athletesBySport->execute([$coachId]);
$athletesBySportData = $athletesBySport->fetchAll();
$maxSportCount = 0;
if (!empty($athletesBySportData)) {
    $maxSportCount = max(array_column($athletesBySportData, 'count'));
}

// Chart: Athletes by Gender
$athletesByGender = db()->prepare(
    "SELECT gender, COUNT(*) as count
     FROM athletes
     WHERE coach_id = ?
     GROUP BY gender"
);
$athletesByGender->execute([$coachId]);
$athletesByGenderData = $athletesByGender->fetchAll();
$maxGenderCount = 0;
if (!empty($athletesByGenderData)) {
    $maxGenderCount = max(array_column($athletesByGenderData, 'count'));
}

$pageTitle = 'Coach Analytics';
require __DIR__ . '/../includes/header.php';
?>
<div class="page-title">
    <h1>Coach Analytics Dashboard</h1>
</div>

<div class="card-grid">
    <div class="card">
        <h3>Total Active Athletes</h3>
        <div class="metric-number"><?= $totalAthletes ?></div>
    </div>
    <div class="card">
        <h3>Assessments This Month</h3>
        <div class="metric-number"><?= $assessmentsThisMonth ?></div>
    </div>
</div>

<div class="analytics-chart-grid">
    <div class="panel chart-panel">
        <h2>Athletes by Sport</h2>
        <div class="horizontal-chart">
            <?php if (empty($athletesBySportData)): ?><p class="empty">No athletes assigned.</p><?php else: ?>
                <?php foreach ($athletesBySportData as $row): ?>
                    <div class="horizontal-bar-item">
                        <div class="horizontal-bar-label"><span><?= e($row['sport_name']) ?></span><strong><?= (int)$row['count'] ?></strong></div>
                        <div class="horizontal-bar-track"><div class="horizontal-bar" style="width: <?= $maxSportCount > 0 ? ((int)$row['count'] / $maxSportCount) * 100 : 0 ?>%;"></div></div>
                    </div>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </div>

    <div class="panel chart-panel">
        <h2>Athletes by Gender</h2>
        <div class="horizontal-chart">
            <?php if (empty($athletesByGenderData)): ?><p class="empty">No athletes assigned.</p><?php else: ?>
                <?php foreach ($athletesByGenderData as $row): ?>
                    <div class="horizontal-bar-item">
                        <div class="horizontal-bar-label"><span><?= e(ucfirst(str_replace('_', ' ', $row['gender']))) ?></span><strong><?= (int)$row['count'] ?></strong></div>
                        <div class="horizontal-bar-track"><div class="horizontal-bar" style="width: <?= $maxGenderCount > 0 ? ((int)$row['count'] / $maxGenderCount) * 100 : 0 ?>%;"></div></div>
                    </div>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </div>
</div>

<?php require __DIR__ . '/../includes/footer.php'; ?>