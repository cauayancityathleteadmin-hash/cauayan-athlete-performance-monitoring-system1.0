<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';
require_coach();

$coachId = get_coach_id_for_user((int)current_user_id());

$athletesStmt = db()->prepare(
    "SELECT a.id, a.athlete_code,
            CONCAT_WS(' ', a.first_name, a.middle_name, a.last_name, a.suffix) AS athlete_name
     FROM athletes a
     WHERE a.coach_id = ?
     ORDER BY a.last_name, a.first_name"
);
$athletesStmt->execute([$coachId]);
$athletes = $athletesStmt->fetchAll();

$athleteIds = array_map('intval', (array)($_GET['athlete_ids'] ?? []));
$athleteIds = array_values(array_unique(array_filter($athleteIds)));
$defaultDateFrom = date('Y-01-01');
$defaultDateTo = date('Y-m-d');
$dateFrom = trim($_GET['date_from'] ?? $defaultDateFrom);
$dateTo = trim($_GET['date_to'] ?? $defaultDateTo);
$reports = [];

$dateFromObject = $dateFrom === '' ? null : DateTime::createFromFormat('!Y-m-d', $dateFrom);
$dateToObject = $dateTo === '' ? null : DateTime::createFromFormat('!Y-m-d', $dateTo);
$validDateFrom = $dateFromObject === null || ($dateFromObject !== false && $dateFromObject->format('Y-m-d') === $dateFrom);
$validDateTo = $dateToObject === null || ($dateToObject !== false && $dateToObject->format('Y-m-d') === $dateTo);
if (!$validDateFrom || !$validDateTo || ($dateFrom !== '' && $dateTo !== '' && $dateFrom > $dateTo)) {
    $dateFrom = $defaultDateFrom;
    $dateTo = $defaultDateTo;
}

if (!empty($athleteIds)) {
    // Efficiency: Fix N+1 query. Fetch all athlete and assessment data in bulk.
    $placeholders = implode(',', array_fill(0, count($athleteIds), '?'));
    $athleteParams = array_merge($athleteIds, [$coachId]);
    $athleteStmt = db()->prepare(
        "SELECT a.id, a.athlete_code, a.birthdate, a.gender, a.status,
                a.first_name, a.middle_name, a.last_name, a.suffix,
                s.sport_name, sc.school_name,
                c.first_name AS coach_first_name, c.middle_name AS coach_middle_name, c.last_name AS coach_last_name, c.suffix AS coach_suffix
         FROM athletes a
         JOIN sports s ON s.id = a.sport_id
         LEFT JOIN schools sc ON sc.id = a.school_id
         JOIN coaches c ON c.id = a.coach_id
         WHERE a.id IN ({$placeholders}) AND a.coach_id = ?"
    );
    $athleteStmt->execute($athleteParams);
    $athletesData = $athleteStmt->fetchAll(PDO::FETCH_UNIQUE);

    $assessmentParams = $athleteIds;
    $dateWhere = '';
    if ($dateFrom !== '') {
        $dateWhere .= ' AND ass.assessment_date >= ?';
        $assessmentParams[] = $dateFrom;
    }
    if ($dateTo !== '') {
        $dateWhere .= ' AND ass.assessment_date <= ?';
        $assessmentParams[] = $dateTo;
    }
    $assessmentStmt = db()->prepare(
        "SELECT ass.athlete_id, ass.id, ass.assessment_date, ass.assessment_type, ass.remarks,
                pm.metric_name, pm.unit, pm.data_type, pm.decimal_places,
                ar.value_decimal, ar.value_text, ar.notes
         FROM assessments ass
         LEFT JOIN assessment_results ar ON ar.assessment_id = ass.id
         LEFT JOIN performance_metrics pm ON pm.id = ar.metric_id
         WHERE ass.athlete_id IN ({$placeholders}){$dateWhere}
         ORDER BY ass.athlete_id, ass.assessment_date DESC, ass.id DESC, pm.metric_name"
    );
    $assessmentStmt->execute($assessmentParams);
    $allAssessments = $assessmentStmt->fetchAll(PDO::FETCH_GROUP);

    foreach ($athleteIds as $athleteId) {
        if (!isset($athletesData[$athleteId])) continue;

        $athleteAssessments = [];
        foreach ($allAssessments[$athleteId] ?? [] as $row) {
            $athleteAssessments[$row['id']]['date'] = format_date($row['assessment_date']);
            $athleteAssessments[$row['id']]['type'] = $row['assessment_type'];
            $athleteAssessments[$row['id']]['remarks'] = $row['remarks'];
            if ($row['metric_name'] !== null) {
                $value = $row['data_type'] === 'text'
                    ? $row['value_text']
                    : number_format((float)$row['value_decimal'], (int)$row['decimal_places']);
                $athleteAssessments[$row['id']]['results'][] = ['metric' => $row['metric_name'], 'unit' => $row['unit'], 'value' => $value, 'notes' => $row['notes']];
            }
        }
        $athletesData[$athleteId]['athlete_name'] = format_person_name($athletesData[$athleteId]['first_name'], $athletesData[$athleteId]['middle_name'], $athletesData[$athleteId]['last_name'], $athletesData[$athleteId]['suffix']);
        $athletesData[$athleteId]['coach_name'] = format_person_name($athletesData[$athleteId]['coach_first_name'], $athletesData[$athleteId]['coach_middle_name'], $athletesData[$athleteId]['coach_last_name'], $athletesData[$athleteId]['coach_suffix']);
        $reports[] = ['athlete' => $athletesData[$athleteId], 'assessments' => $athleteAssessments];
    }
}

$pageTitle = 'Athlete Reports';
require __DIR__ . '/../includes/header.php';
?>
<div class="page-title">
<h1>Athlete Performance Report</h1>
<div class="actions"><button class="btn" type="button" onclick="printReport()">Print Report</button></div>
</div>

<div class="panel report-controls">
<div class="section-heading"><div><h2>Generate Report for Selected Athletes</h2><p class="small">Only the athletes you select will appear in the report. The default period is <?= e(date('F j, Y', strtotime($dateFrom))) ?> to <?= e(date('F j, Y', strtotime($dateTo))) ?>.</p></div><span class="count-badge"><?= count($athletes) ?></span></div>
<form class="report-filter-form" method="get">
    <div class="report-form-header">
        <div><label for="athlete_select" id="athlete_select_label">Athletes</label><p class="small">Selected: <span id="selected_athlete_count"><?= count($athleteIds) ?></span></p></div>
        <div class="date-filters">
            <label for="date_from">From</label><input id="date_from" type="date" name="date_from" value="<?= e($dateFrom) ?>">
            <label for="date_to">To</label><input id="date_to" type="date" name="date_to" value="<?= e($dateTo) ?>">
        </div>
    </div>
    <div class="athlete-select-group">
        <select name="athlete_ids[]" id="athlete_select" multiple required size="12" class="multiselect-list">
            <?php foreach ($athletes as $item): ?>
            <option value="<?= (int)$item['id'] ?>" <?= in_array((int)$item['id'], $athleteIds, true) ? 'selected' : '' ?>><?= e($item['athlete_code'] . ' — ' . $item['athlete_name']) ?></option>
            <?php endforeach; ?>
        </select>
        <div id="athlete_checkbox_list" class="checkbox-list" style="display: none;">
            <?php foreach ($athletes as $item): ?>
            <div class="checkbox-list-item">
                <input type="checkbox" id="athlete_cb_<?= (int)$item['id'] ?>" value="<?= (int)$item['id'] ?>" <?= in_array((int)$item['id'], $athleteIds, true) ? 'checked' : '' ?>>
                <label for="athlete_cb_<?= (int)$item['id'] ?>"><?= e($item['athlete_code'] . ' — ' . $item['athlete_name']) ?></label>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
    <div class="report-form-actions">
        <div class="actions">
            <button type="button" id="select_action_btn" class="btn secondary">Select all</button>
            <button type="button" id="clear_selection_btn" class="btn secondary">Clear</button>
        </div>
        <div class="actions">
            <button class="btn" type="submit">Create Selected Athletes Report</button>
            <a class="btn secondary" href="<?= BASE_URL ?>/coach/reports.php">Reset</a>
        </div>
    </div>
</form>
</div>

<?php if (!empty($reports)): ?>
    <?php foreach ($reports as $reportIndex => $report): ?>
        <?php $athlete = $report['athlete']; $assessments = $report['assessments']; ?>
        <div class="panel report-sheet <?= $reportIndex > 0 ? 'report-sheet-next' : '' ?>">
            <div class="report-header-print">
                <img src="<?= BASE_URL ?>/cauayan%20logo.png" alt="Cauayan City seal" class="header-seal">
                <div class="header-text"><p class="report-government">Republic of the Philippines</p><p class="report-government">City Government of Cauayan</p><h3>City Sports Development Office</h3><p class="report-title-print">Official Athlete Performance Report</p><p class="report-date-print">Date: <?= e(date('F j, Y')) ?></p></div>
            </div>
            <div class="report-heading">
                <div><p class="report-kicker">ATHLETE PERFORMANCE RECORD</p><h2><?= e($athlete['athlete_name']) ?></h2><p class="small">Athlete ID: <?= e($athlete['athlete_code']) ?> | Coach: <?= e($athlete['coach_name']) ?></p></div>
            </div>
            <div class="report-summary">
                <div><strong>Birthdate</strong><span><?= e(format_date($athlete['birthdate'])) ?></span></div>
                <div><strong>Gender</strong><span><?= e(ucwords(str_replace('_', ' ', $athlete['gender']))) ?></span></div>
                <div><strong>Sport</strong><span><?= e($athlete['sport_name']) ?></span></div>
                <div><strong>School</strong><span><?= e($athlete['school_name'] ?? '—') ?></span></div>
                <div><strong>Status</strong><span><?= e(ucfirst($athlete['status'])) ?></span></div>
            </div>

            <h3>Assessment History</h3>
            <?php if (!$assessments): ?>
            <p class="empty">No assessments found for the selected period.</p>
            <?php else: ?>
            <?php foreach ($assessments as $assessment): ?>
            <div class="report-assessment">
            <div class="report-assessment-heading"><strong><?= e($assessment['date']) ?> · <?= e($assessment['type']) ?></strong></div>
            <?php if (!empty($assessment['results'])): ?>
            <table><thead><tr><th>Metric</th><th>Result</th><th>Notes</th></tr></thead><tbody>
            <?php foreach ($assessment['results'] as $result): ?>
            <tr><td><?= e($result['metric']) ?></td><td><?= e($result['value'] . ($result['unit'] ? ' ' . $result['unit'] : '')) ?></td><td><?= e($result['notes'] ?? '—') ?></td></tr>
            <?php endforeach; ?>
            </tbody></table>
            <?php else: ?><p class="small">No metric results recorded.</p><?php endif; ?>
            <?php if ($assessment['remarks']): ?><p class="small"><strong>Remarks:</strong> <?= e($assessment['remarks']) ?></p><?php endif; ?>
            </div>
            <?php endforeach; ?>
            <?php endif; ?>
            <div class="report-certification"><p>This certifies that the performance information above is based on the assessment records maintained by the City Sports Development Office.</p><div class="signature-line"><span>Prepared by / Coach</span><span>Noted by / Sports Coordinator</span></div></div>
            <div class="report-footer-print">
            <p>Official Athlete Performance Report | <?= e(date('F j, Y')) ?></p>
            </div>
        </div>
    <?php endforeach; ?>
<?php elseif (!empty($athleteIds)): ?>
<div class="alert warning">No assessment data found for the selected athletes or date range.</div>
<?php endif; ?>
<script>
document.addEventListener('DOMContentLoaded', function() {
    const multiSelect = document.getElementById('athlete_select');
    const checkboxList = document.getElementById('athlete_checkbox_list');
    const checkboxes = checkboxList ? checkboxList.querySelectorAll('input[type="checkbox"]') : [];
    const actionButton = document.getElementById('select_action_btn');
    const clearButton = document.getElementById('clear_selection_btn');
    const selectedCount = document.getElementById('selected_athlete_count');
    const form = document.querySelector('.report-filter-form');

    if (!multiSelect || !checkboxList || !actionButton || !clearButton || !form) return;

    const updateCount = function() {
        selectedCount.textContent = String(Array.from(multiSelect.options).filter(option => option.selected).length);
    };

    const syncSelect = function() {
        const selectedValues = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
        Array.from(multiSelect.options).forEach(option => {
            option.selected = selectedValues.includes(option.value);
        });
        updateCount();
    };

    actionButton.addEventListener('click', () => {
        multiSelect.style.display = 'none';
        checkboxList.style.display = 'block';
        checkboxes.forEach(cb => cb.checked = true);
        syncSelect();
        actionButton.textContent = 'All selected';
    });

    clearButton.addEventListener('click', () => {
        multiSelect.style.display = 'block';
        checkboxList.style.display = 'none';
        Array.from(multiSelect.options).forEach(option => option.selected = false);
        checkboxes.forEach(cb => cb.checked = false);
        actionButton.textContent = 'Select all';
        updateCount();
    });

    multiSelect.addEventListener('change', updateCount);
    checkboxes.forEach(cb => cb.addEventListener('change', syncSelect));
    form.addEventListener('submit', () => {
        syncSelect();
    });
    updateCount();
});

function printReport() {
    const originalTitle = document.title;
    document.title = 'Official Athlete Performance Report - <?= e(date('Y-m-d')) ?>';
    window.print();
    window.setTimeout(() => { document.title = originalTitle; }, 1000);
}
</script>
<?php require __DIR__ . '/../includes/footer.php'; ?>
