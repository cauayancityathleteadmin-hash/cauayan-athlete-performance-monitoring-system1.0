<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/functions.php';
require_coach_or_admin();

$coachId = is_coach() ? get_coach_id_for_user((int)current_user_id()) : null;
$sportId = (int)($_GET['sport_id'] ?? 0);
$athleteId = (int)($_GET['athlete_id'] ?? 0);
$dateFrom = trim($_GET['date_from'] ?? '');
$dateTo = trim($_GET['date_to'] ?? '');

$dateFromObject = $dateFrom === '' ? null : DateTime::createFromFormat('!Y-m-d', $dateFrom);
$dateToObject = $dateTo === '' ? null : DateTime::createFromFormat('!Y-m-d', $dateTo);
if ($dateFromObject === false || ($dateFromObject && $dateFromObject->format('Y-m-d') !== $dateFrom)) $dateFrom = '';
if ($dateToObject === false || ($dateToObject && $dateToObject->format('Y-m-d') !== $dateTo)) $dateTo = '';

$scopeWhere = [];
$scopeParams = [];
if ($coachId) {
    $scopeWhere[] = 'a.coach_id = ?';
    $scopeParams[] = $coachId;
}
if ($sportId) {
    $scopeWhere[] = 'a.sport_id = ?';
    $scopeParams[] = $sportId;
}
if ($athleteId) {
    $scopeWhere[] = 'a.id = ?';
    $scopeParams[] = $athleteId;
}
if ($dateFrom !== '') {
    $scopeWhere[] = 'ass.assessment_date >= ?';
    $scopeParams[] = $dateFrom;
}
if ($dateTo !== '') {
    $scopeWhere[] = 'ass.assessment_date <= ?';
    $scopeParams[] = $dateTo;
}
$whereSql = $scopeWhere ? 'WHERE ' . implode(' AND ', $scopeWhere) : '';

$athleteFilter = $coachId ? 'WHERE a.coach_id = ?' : '';
$athleteParams = $coachId ? [$coachId] : [];
$athletesStmt = db()->prepare(
    "SELECT a.id, a.athlete_code, CONCAT_WS(' ', a.first_name, a.middle_name, a.last_name) AS athlete_name
     FROM athletes a {$athleteFilter} ORDER BY a.last_name, a.first_name"
);
$athletesStmt->execute($athleteParams);
$athletes = $athletesStmt->fetchAll();
$sports = db()->query("SELECT id, sport_name FROM sports WHERE status='active' ORDER BY sport_name")->fetchAll();
$events = db()->query("SELECT id, event_name FROM events WHERE status='active' ORDER BY event_name")->fetchAll();

$summaryStmt = db()->prepare(
    "SELECT COUNT(DISTINCT ass.athlete_id) AS athletes,
            COUNT(DISTINCT ass.id) AS assessments,
            COUNT(ar.id) AS results,
            AVG(ar.value_decimal) AS average_value
     FROM assessments ass
     JOIN athletes a ON a.id = ass.athlete_id
     LEFT JOIN assessment_results ar ON ar.assessment_id = ass.id
     {$whereSql}"
);
$summaryStmt->execute($scopeParams);
$summary = $summaryStmt->fetch() ?: ['athletes' => 0, 'assessments' => 0, 'results' => 0, 'average_value' => null];

$metricStmt = db()->prepare(
    "SELECT pm.metric_name, pm.unit, pm.better_direction, COUNT(ar.id) AS result_count,
            AVG(ar.value_decimal) AS average_value, MIN(ar.value_decimal) AS best_low, MAX(ar.value_decimal) AS best_high
     FROM assessments ass
     JOIN athletes a ON a.id = ass.athlete_id
     JOIN assessment_results ar ON ar.assessment_id = ass.id
     JOIN performance_metrics pm ON pm.id = ar.metric_id
     {$whereSql}
     GROUP BY pm.id, pm.metric_name, pm.unit, pm.better_direction
     ORDER BY pm.metric_name"
);
$metricStmt->execute($scopeParams);
$metricRows = $metricStmt->fetchAll();

$recentStmt = db()->prepare(
        "SELECT ass.assessment_date, a.athlete_code,
            CONCAT_WS(' ', a.first_name, a.last_name) AS athlete_name,
            s.sport_name
     FROM assessments ass
     JOIN athletes a ON a.id = ass.athlete_id
     JOIN sports s ON s.id = a.sport_id
     {$whereSql}
     ORDER BY ass.assessment_date DESC, ass.id DESC LIMIT 10"
);
$recentStmt->execute($scopeParams);
$recent = $recentStmt->fetchAll();

$trendStmt = db()->prepare(
    "SELECT DATE_FORMAT(ass.assessment_date, '%Y-%m') AS period, COUNT(*) AS assessment_count
     FROM assessments ass
     JOIN athletes a ON a.id = ass.athlete_id
     {$whereSql}
     GROUP BY period ORDER BY period DESC LIMIT 12"
);
$trendStmt->execute($scopeParams);
$trendRows = array_reverse($trendStmt->fetchAll());
$maxTrend = max(array_map(static fn(array $row): int => (int)$row['assessment_count'], $trendRows) ?: [1]);

$sportSummaryStmt = db()->prepare(
    "SELECT s.sport_name, COUNT(DISTINCT ass.id) AS assessment_count
     FROM assessments ass
     JOIN athletes a ON a.id = ass.athlete_id
     JOIN sports s ON s.id = a.sport_id
     {$whereSql}
     GROUP BY s.id, s.sport_name ORDER BY assessment_count DESC, s.sport_name"
);
$sportSummaryStmt->execute($scopeParams);
$sportRows = $sportSummaryStmt->fetchAll();
$maxSport = max(array_map(static fn(array $row): int => (int)$row['assessment_count'], $sportRows) ?: [1]);

$eventSummaryStmt = db()->prepare(
    "SELECT e.event_name, COUNT(DISTINCT ass.id) AS assessment_count
     FROM assessments ass
     JOIN athletes a ON a.id = ass.athlete_id
     JOIN assessment_results ar ON ar.assessment_id = ass.id
     JOIN performance_metrics pm ON pm.id = ar.metric_id
     JOIN events e ON e.id = pm.event_id
     {$whereSql}
     GROUP BY e.id, e.event_name ORDER BY assessment_count DESC, e.event_name LIMIT 12"
);
$eventSummaryStmt->execute($scopeParams);
$eventRows = $eventSummaryStmt->fetchAll();
$maxEvent = max(array_map(static fn(array $row): int => (int)$row['assessment_count'], $eventRows) ?: [1]);

$statusWhere = [];
$statusParams = [];
if ($coachId) {
    $statusWhere[] = 'a.coach_id = ?';
    $statusParams[] = $coachId;
}
if ($sportId) {
    $statusWhere[] = 'a.sport_id = ?';
    $statusParams[] = $sportId;
}
if ($athleteId) {
    $statusWhere[] = 'a.id = ?';
    $statusParams[] = $athleteId;
}
$statusWhereSql = $statusWhere ? 'WHERE ' . implode(' AND ', $statusWhere) : '';
$statusStmt = db()->prepare(
    "SELECT a.status, COUNT(*) AS athlete_count
     FROM athletes a {$statusWhereSql}
     GROUP BY a.status ORDER BY a.status"
);
$statusStmt->execute($statusParams);
$statusRows = $statusStmt->fetchAll();
$maxStatus = max(array_map(static fn(array $row): int => (int)$row['athlete_count'], $statusRows) ?: [1]);

$metricAverageStmt = db()->prepare(
    "SELECT pm.metric_name, pm.unit, pm.better_direction, AVG(ar.value_decimal) AS average_value
     FROM assessments ass
     JOIN athletes a ON a.id = ass.athlete_id
     JOIN assessment_results ar ON ar.assessment_id = ass.id
     JOIN performance_metrics pm ON pm.id = ar.metric_id
    " . ($whereSql ? $whereSql . ' AND ' : 'WHERE ') . "ar.value_decimal IS NOT NULL
     GROUP BY pm.id, pm.metric_name, pm.unit, pm.better_direction
     ORDER BY pm.metric_name LIMIT 12"
);
$metricAverageStmt->execute($scopeParams);
$metricAverageRows = $metricAverageStmt->fetchAll();
$maxMetricAverage = max(array_map(static fn(array $row): float => abs((float)$row['average_value']), $metricAverageRows) ?: [1]);

$pageTitle = 'Analytics';
require __DIR__ . '/includes/header.php';
?>
<div class="page-title"><h1>Analytics</h1><div class="actions"><a class="btn secondary" href="javascript:window.print()">Print</a></div></div>
<div class="panel analytics-filters">
<h2>Performance Overview</h2>
<form class="search-bar" method="get">
<select name="athlete_id"><option value="">All <?= is_coach() ? 'my ' : '' ?>athletes</option><?php foreach ($athletes as $athlete): ?><option value="<?= (int)$athlete['id'] ?>" <?= $athleteId === (int)$athlete['id'] ? 'selected' : '' ?>><?= e($athlete['athlete_code'] . ' — ' . $athlete['athlete_name']) ?></option><?php endforeach; ?></select>
<select name="sport_id"><option value="">All sports</option><?php foreach ($sports as $sport): ?><option value="<?= (int)$sport['id'] ?>" <?= $sportId === (int)$sport['id'] ? 'selected' : '' ?>><?= e($sport['sport_name']) ?></option><?php endforeach; ?></select>
<input type="date" name="date_from" value="<?= e($dateFrom) ?>" aria-label="From date"><input type="date" name="date_to" value="<?= e($dateTo) ?>" aria-label="To date"><button class="btn" type="submit">Apply Filters</button><a class="btn secondary" href="<?= BASE_URL ?>/analytics.php">Clear</a>
</form>
<p class="small">Assessments record performance; Analytics summarizes the recorded results.</p>
</div>

<div class="card-grid">
<div class="card"><h3>Athletes Covered</h3><div class="metric-number"><?= (int)$summary['athletes'] ?></div></div>
<div class="card"><h3>Assessments</h3><div class="metric-number"><?= (int)$summary['assessments'] ?></div></div>
<div class="card"><h3>Metric Results</h3><div class="metric-number"><?= (int)$summary['results'] ?></div></div>
<div class="card"><h3>Numeric Average</h3><div class="metric-number"><?= $summary['average_value'] === null ? '—' : e(number_format((float)$summary['average_value'], 2)) ?></div></div>
</div>

<div class="analytics-chart-grid">
<div class="panel chart-panel"><h2>Assessment Activity</h2><div class="bar-chart" role="img" aria-label="Assessment count by month">
<?php foreach ($trendRows as $trend): ?><div class="bar-column"><span class="bar-value"><?= (int)$trend['assessment_count'] ?></span><div class="bar" style="height: <?= max(8, (int)round(((int)$trend['assessment_count'] / $maxTrend) * 100)) ?>%"></div><span class="bar-label"><?= e($trend['period']) ?></span></div><?php endforeach; ?>
<?php if (!$trendRows): ?><p class="empty">No assessment activity for this selection.</p><?php endif; ?>
</div></div>
<div class="panel chart-panel"><h2>Assessments by Sport</h2><div class="horizontal-chart">
<?php foreach ($sportRows as $sport): ?><div class="horizontal-bar-row"><div class="horizontal-bar-label"><span><?= e($sport['sport_name']) ?></span><strong><?= (int)$sport['assessment_count'] ?></strong></div><div class="horizontal-bar-track"><div class="horizontal-bar" style="width: <?= max(4, (int)round(((int)$sport['assessment_count'] / $maxSport) * 100)) ?>%"></div></div></div><?php endforeach; ?>
<?php if (!$sportRows): ?><p class="empty">No sport data for this selection.</p><?php endif; ?>
</div></div>
<div class="panel chart-panel"><h2>Assessments by Event</h2><div class="horizontal-chart">
<?php foreach ($eventRows as $event): ?><div class="horizontal-bar-item"><div class="horizontal-bar-label"><span><?= e($event['event_name']) ?></span><strong><?= (int)$event['assessment_count'] ?></strong></div><div class="horizontal-bar-track"><div class="horizontal-bar" style="width: <?= max(4, (int)round(((int)$event['assessment_count'] / $maxEvent) * 100)) ?>%;"></div></div></div><?php endforeach; ?>
<?php if (!$eventRows): ?><p class="empty">No event data for this selection.</p><?php endif; ?>
</div></div>
<div class="panel chart-panel"><h2>Athlete Status</h2><div class="horizontal-chart">
<?php foreach ($statusRows as $status): ?><div class="horizontal-bar-item"><div class="horizontal-bar-label"><span><?= e(ucfirst($status['status'])) ?></span><strong><?= (int)$status['athlete_count'] ?></strong></div><div class="horizontal-bar-track"><div class="horizontal-bar status-bar" style="width: <?= max(4, (int)round(((int)$status['athlete_count'] / $maxStatus) * 100)) ?>%;"></div></div></div><?php endforeach; ?>
<?php if (!$statusRows): ?><p class="empty">No athlete status data for this selection.</p><?php endif; ?>
</div></div>
<div class="panel chart-panel"><h2>Average Metric Values</h2><div class="horizontal-chart">
<?php foreach ($metricAverageRows as $metricAverage): ?><div class="horizontal-bar-item"><div class="horizontal-bar-label"><span><?= e($metricAverage['metric_name'] . ($metricAverage['unit'] ? ' (' . $metricAverage['unit'] . ')' : '')) ?></span><strong><?= e(number_format((float)$metricAverage['average_value'], 2)) ?></strong></div><div class="horizontal-bar-track"><div class="horizontal-bar metric-bar" style="width: <?= max(4, (int)round((abs((float)$metricAverage['average_value']) / $maxMetricAverage) * 100)) ?>%;"></div></div></div><?php endforeach; ?>
<?php if (!$metricAverageRows): ?><p class="empty">No numeric metric data for this selection.</p><?php endif; ?>
</div></div>
</div>

<div class="panel"><h2>Metric Summary</h2><div class="table-wrap"><table><thead><tr><th>Metric</th><th>Results</th><th>Average</th><th>Range</th><th>Direction</th></tr></thead><tbody>
<?php foreach ($metricRows as $metric): ?><tr><td><?= e($metric['metric_name']) ?><?= $metric['unit'] ? ' (' . e($metric['unit']) . ')' : '' ?></td><td><?= (int)$metric['result_count'] ?></td><td><?= $metric['average_value'] === null ? '—' : e(number_format((float)$metric['average_value'], 2)) ?></td><td><?= $metric['best_low'] === null ? '—' : e(number_format((float)$metric['best_low'], 2) . ' – ' . number_format((float)$metric['best_high'], 2)) ?></td><td><?= e(ucfirst($metric['better_direction'])) ?></td></tr><?php endforeach; ?>
<?php if (!$metricRows): ?><tr><td colspan="5" class="empty">No numeric or text results match these filters.</td></tr><?php endif; ?>
</tbody></table></div></div>

<div class="panel"><h2>Recent Assessment Activity</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Athlete</th><th>Sport</th></tr></thead><tbody>
<?php foreach ($recent as $row): ?><tr><td><?= e(format_date($row['assessment_date'])) ?></td><td><?= e($row['athlete_code'] . ' — ' . $row['athlete_name']) ?></td><td><?= e($row['sport_name']) ?></td></tr><?php endforeach; ?>
<?php if (!$recent): ?><tr><td colspan="4" class="empty">No assessments match these filters.</td></tr><?php endif; ?>
</tbody></table></div></div>
<?php require __DIR__ . '/includes/footer.php'; ?>
