<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';
require_admin();

$pdo = db();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $action = $_POST['action'] ?? '';
    try {
        if ($action === 'create') {
            $name = trim($_POST['event_name'] ?? '');
            $venue = trim($_POST['venue'] ?? '');
            $start = trim($_POST['start_date'] ?? '');
            $startTime = trim($_POST['start_time'] ?? '') ?: null;
            $end = trim($_POST['end_date'] ?? '') ?: null;
            $endTime = trim($_POST['end_time'] ?? '') ?: null;
            $sports = array_values(array_filter(array_map('trim', (array)($_POST['sports'] ?? []))));
            if ($name === '' || $venue === '' || !$start || !$sports) throw new RuntimeException('Event name, date, venue, and at least one sport are required.');
            $pdo->beginTransaction();
            $stmt = $pdo->prepare('INSERT INTO event_plans (event_name, description, start_date, start_time, end_date, end_time, venue, status, program_flow, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([$name, trim($_POST['description'] ?? '') ?: null, $start, $startTime, $end, $endTime, $venue, $_POST['status'] === 'open' ? 'open' : 'draft', trim($_POST['program_flow'] ?? '') ?: null, current_user_id()]);
            $planId = (int)$pdo->lastInsertId();
            $sportStmt = $pdo->prepare('INSERT INTO event_plan_sports (event_plan_id, sport_id) VALUES (?, ?)');
            foreach ($sports as $sportName) $sportStmt->execute([$planId, get_or_create_id($pdo, 'sports', 'sport_name', $sportName)]);
            $pdo->commit();
            audit('CREATE_EVENT_PLAN', 'event_plan', $planId, "Created event plan {$name}.");
            flash('success', 'Event plan created.');
        } elseif ($action === 'import') {
            if (!isset($_FILES['event_file']) || $_FILES['event_file']['error'] !== UPLOAD_ERR_OK) throw new RuntimeException('Choose a CSV event-plan file first.');
            $handle = fopen($_FILES['event_file']['tmp_name'], 'r');
            if ($handle === false) throw new RuntimeException('The event-plan file could not be opened.');
            $headers = array_map(static fn($value): string => strtolower(trim((string)$value)), fgetcsv($handle) ?: []);
            $expected = ['event_name','description','start_date','start_time','end_date','end_time','venue','status','sports','program_flow'];
            if ($headers !== $expected) throw new RuntimeException('Invalid event template. Download the sample and keep its header order unchanged.');
            $pdo->beginTransaction(); $count = 0;
            while (($row = fgetcsv($handle)) !== false) {
                if (count(array_filter($row, static fn($value): bool => trim((string)$value) !== '')) === 0) continue;
                $row = array_pad(array_map('trim', $row), 10, '');
                if ($row[0] === '' || $row[2] === '' || $row[6] === '' || $row[8] === '') throw new RuntimeException('Every imported row needs event_name, start_date, venue, and sports.');
                $status = in_array($row[7], ['draft','open'], true) ? $row[7] : 'draft';
                $stmt = $pdo->prepare('INSERT INTO event_plans (event_name, description, start_date, start_time, end_date, end_time, venue, status, program_flow, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $stmt->execute([$row[0], $row[1] ?: null, $row[2], $row[3] ?: null, $row[4] ?: null, $row[5] ?: null, $row[6], $status, $row[9] ?: null, current_user_id()]);
                $planId = (int)$pdo->lastInsertId(); $sportStmt = $pdo->prepare('INSERT INTO event_plan_sports (event_plan_id, sport_id) VALUES (?, ?)');
                foreach (explode('|', $row[6]) as $sportName) { $sportName = trim($sportName); if ($sportName !== '') $sportStmt->execute([$planId, get_or_create_id($pdo, 'sports', 'sport_name', $sportName)]); }
                $count++;
            }
            fclose($handle); $pdo->commit(); audit('IMPORT_EVENT_PLANS', 'system', null, "Imported {$count} event plans."); flash('success', "Imported {$count} event plan(s).");
        } elseif ($action === 'review_application') {
            $newStatus = ($_POST['decision'] ?? '') === 'approve' ? 'approved' : 'rejected';
            $stmt = $pdo->prepare('UPDATE event_applications SET status=?, reason=?, reviewed_at=NOW(), reviewed_by=? WHERE id=?');
            $stmt->execute([$newStatus, trim($_POST['reason'] ?? '') ?: null, current_user_id(), (int)$_POST['application_id']]);
            if ($newStatus === 'approved') {
                $details = $pdo->prepare('SELECT event_plan_id, coach_id FROM event_applications WHERE id=?');
                $details->execute([(int)$_POST['application_id']]); $application = $details->fetch();
                if ($application) {
                    $sportsStmt = $pdo->prepare('SELECT sport_id FROM event_plan_sports WHERE event_plan_id=?'); $sportsStmt->execute([(int)$application['event_plan_id']]);
                    $participantStmt = $pdo->prepare("INSERT IGNORE INTO event_participants (event_plan_id, coach_id, athlete_id, sport_id, participant_type, added_by) VALUES (?, ?, NULL, ?, 'coach', ?)");
                    foreach ($sportsStmt->fetchAll() as $sport) $participantStmt->execute([(int)$application['event_plan_id'], (int)$application['coach_id'], (int)$sport['sport_id'], current_user_id()]);
                }
            }
            flash('success', 'Event application ' . $newStatus . '.');
        } elseif ($action === 'delete_application') {
            $pdo->prepare('DELETE FROM event_applications WHERE id=? AND status="rejected"')->execute([(int)$_POST['application_id']]);
            flash('success', 'Rejected application deleted.');
        } elseif ($action === 'reapprove_application') {
            $stmt = $pdo->prepare('UPDATE event_applications SET status="approved", reason=NULL, reviewed_at=NOW(), reviewed_by=? WHERE id=? AND status="rejected"');
            $stmt->execute([current_user_id(), (int)$_POST['application_id']]);
            $details = $pdo->prepare('SELECT event_plan_id, coach_id FROM event_applications WHERE id=?');
            $details->execute([(int)$_POST['application_id']]);
            $application = $details->fetch();
            if ($application) {
                $sportsStmt = $pdo->prepare('SELECT sport_id FROM event_plan_sports WHERE event_plan_id=?');
                $sportsStmt->execute([(int)$application['event_plan_id']]);
                $participantStmt = $pdo->prepare("INSERT IGNORE INTO event_participants (event_plan_id, coach_id, athlete_id, sport_id, participant_type, added_by) VALUES (?, ?, NULL, ?, 'coach', ?)");
                foreach ($sportsStmt->fetchAll() as $sport) $participantStmt->execute([(int)$application['event_plan_id'], (int)$application['coach_id'], (int)$sport['sport_id'], current_user_id()]);
            }
            flash('success', 'Rejected application re-approved.');
        } elseif ($action === 'delete') {
            $planId = (int)($_POST['event_plan_id'] ?? 0);
            $stmt = $pdo->prepare('SELECT event_name FROM event_plans WHERE id=?');
            $stmt->execute([$planId]); $plan = $stmt->fetch();
            if (!$plan) throw new RuntimeException('Event plan not found.');
            $pdo->prepare('DELETE FROM event_plans WHERE id=?')->execute([$planId]);
            audit('DELETE_EVENT_PLAN', 'event_plan', $planId, "Deleted event plan {$plan['event_name']}.");
            flash('success', 'Event plan deleted.');
        }
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        flash('danger', $error instanceof RuntimeException ? $error->getMessage() : 'Could not save the event plan.');
    }
    redirect('admin/events.php');
}

$sports = $pdo->query("SELECT id, sport_name FROM sports WHERE status='active' ORDER BY sport_name")->fetchAll();
$plans = $pdo->query("SELECT ep.*, GROUP_CONCAT(s.sport_name ORDER BY s.sport_name SEPARATOR ', ') AS sports, COUNT(DISTINCT p.id) AS participant_count,
    GROUP_CONCAT(DISTINCT CASE WHEN p.participant_type='athlete' THEN CONCAT(a.athlete_code, ' — ', a.first_name, ' ', a.last_name) WHEN p.participant_type='coach' THEN c.coach_code ELSE NULL END SEPARATOR ', ') AS participant_names
    FROM event_plans ep LEFT JOIN event_plan_sports eps ON eps.event_plan_id=ep.id LEFT JOIN sports s ON s.id=eps.sport_id
    LEFT JOIN event_participants p ON p.event_plan_id=ep.id AND p.status='active' LEFT JOIN athletes a ON a.id=p.athlete_id LEFT JOIN coaches c ON c.id=p.coach_id
    GROUP BY ep.id ORDER BY ep.start_date ASC, ep.id DESC")->fetchAll();
            $applications = $pdo->query("SELECT ea.*, ep.event_name, c.coach_code, c.first_name AS coach_first_name, c.middle_name AS coach_middle_name, c.last_name AS coach_last_name, c.suffix AS coach_suffix
    FROM event_applications ea JOIN event_plans ep ON ep.id=ea.event_plan_id JOIN coaches c ON c.id=ea.coach_id
    WHERE ea.status='pending' ORDER BY ea.applied_at DESC")->fetchAll();
$rejectedApplications = $pdo->query("SELECT ea.*, ep.event_name, c.coach_code, c.first_name AS coach_first_name, c.middle_name AS coach_middle_name, c.last_name AS coach_last_name, c.suffix AS coach_suffix
    FROM event_applications ea JOIN event_plans ep ON ep.id=ea.event_plan_id JOIN coaches c ON c.id=ea.coach_id
    WHERE ea.status='rejected' ORDER BY ea.reviewed_at DESC, ea.applied_at DESC")->fetchAll();
foreach ($applications as &$application) $application['coach_name'] = format_person_name($application['coach_first_name'], $application['coach_middle_name'], $application['coach_last_name'], $application['coach_suffix']);
unset($application);
foreach ($rejectedApplications as &$application) $application['coach_name'] = format_person_name($application['coach_first_name'], $application['coach_middle_name'], $application['coach_last_name'], $application['coach_suffix']);
unset($application);
$pageTitle = 'Sports Event Plans'; require __DIR__ . '/../includes/header.php';
?>
<div class="page-title"><h1>Sports Event Plans</h1><div class="actions"><a class="btn" href="#create">Create Event Plan</a><a class="btn secondary" href="#applications">Applications</a><a class="btn secondary" href="#rejected">Rejected</a><a class="btn secondary" href="#import">Import CSV</a></div></div>
<div class="panel"><h2>Created Events</h2><div class="table-wrap"><table><thead><tr><th>Event</th><th>Date</th><th>Time</th><th>Venue</th><th>Status</th><th>Details</th><th>Manage</th></tr></thead><tbody>
<?php foreach ($plans as $plan): ?><tr><td><?= e($plan['event_name']) ?></td><td><?= e(format_date($plan['start_date'])) ?><?= $plan['end_date'] ? '<br>to ' . e(format_date($plan['end_date'])) : '' ?></td><td><?= e(format_time($plan['start_time'] ?? null)) ?><br>to <?= e(format_time($plan['end_time'] ?? null)) ?></td><td><?= e($plan['venue']) ?></td><td><span class="badge <?= e($plan['status']) ?>"><?= e(ucfirst($plan['status'])) ?></span></td><td><a class="btn secondary" href="<?= BASE_URL ?>/admin/event_plan.php?id=<?= (int)$plan['id'] ?>">View event details</a></td><td><a class="btn secondary" href="<?= BASE_URL ?>/admin/event_plan.php?id=<?= (int)$plan['id'] ?>#edit-event">Edit</a><form method="post" class="inline-form" data-confirm="Delete this event plan and its applications?"><?= csrf_field() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="event_plan_id" value="<?= (int)$plan['id'] ?>"><button class="btn secondary" type="submit">Delete</button></form></td></tr><?php endforeach; ?>
<?php if (!$plans): ?><tr><td colspan="7" class="empty">No event plans created yet.</td></tr><?php endif; ?></tbody></table></div></div>
<details class="panel" id="create"><summary><h2>Create Event Plan</h2></summary>
<p class="small">Use one plan per upcoming city event. Program flow is plain text, one schedule item per line.</p>
<form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="create"><div class="form-grid">
<div class="form-group"><label>Event name *</label><input name="event_name" placeholder="Cauayan City Sports Festival 2026" required></div><div class="form-group"><label>Venue *</label><input name="venue" placeholder="Cauayan City Sports Complex" required></div>
<div class="form-group"><label>Start date *</label><input type="date" name="start_date" required></div><div class="form-group"><label>Start time</label><input type="time" name="start_time"></div><div class="form-group"><label>End date</label><input type="date" name="end_date"></div><div class="form-group"><label>End time</label><input type="time" name="end_time"></div>
<div class="form-group full"><label>Sports played *</label><div id="event-sports-inputs"><div class="sport-input-row"><input name="sports[]" placeholder="e.g. Basketball" required><button class="btn secondary remove-sport" type="button">Remove</button></div></div><button class="btn secondary" id="add-event-sport" type="button">Add sport</button></div>
<div class="form-group full"><label>Description</label><textarea name="description" placeholder="Purpose, eligibility, and notes"></textarea></div><div class="form-group full"><label>Program flow</label><textarea name="program_flow" placeholder="2026-10-10 08:00 | Opening ceremony | Main court&#10;2026-10-10 09:00 | Athletics heats | Track"></textarea></div>
<div class="form-group"><label>Visibility</label><select name="status"><option value="draft">Draft</option><option value="open">Open for applications</option></select></div></div><br><button class="btn" type="submit">Create Event Plan</button></form>
 </details>
<details class="panel" id="applications"><summary><h2>Coach Applications</h2></summary><div class="table-wrap"><table><thead><tr><th>Event</th><th>Coach</th><th>Applied</th><th>Status</th><th>Action</th></tr></thead><tbody>
<?php foreach ($applications as $application): ?><tr><td><?= e($application['event_name']) ?></td><td><?= e($application['coach_code'] . ' — ' . $application['coach_name']) ?></td><td><?= e(format_date(substr($application['applied_at'], 0, 10))) ?></td><td><span class="badge pending">Pending</span></td><td><form method="post" class="actions"><?= csrf_field() ?><input type="hidden" name="action" value="review_application"><input type="hidden" name="application_id" value="<?= (int)$application['id'] ?>"><input name="reason" placeholder="Optional reason"><button class="btn" name="decision" value="approve">Approve</button><button class="btn secondary" name="decision" value="reject">Reject</button></form></td></tr><?php endforeach; ?>
<?php if (!$applications): ?><tr><td colspan="5" class="empty">No pending applications.</td></tr><?php endif; ?></tbody></table></div></details>
<details class="panel" id="rejected"><summary><h2>Rejected Applications</h2></summary><div class="table-wrap"><table><thead><tr><th>Event</th><th>Coach</th><th>Reason</th><th>Action</th></tr></thead><tbody>
<?php foreach ($rejectedApplications as $application): ?><tr><td><?= e($application['event_name']) ?></td><td><?= e($application['coach_code'] . ' — ' . $application['coach_name']) ?></td><td><?= e($application['reason'] ?? 'No reason provided') ?></td><td><form method="post" class="actions"><?= csrf_field() ?><input type="hidden" name="application_id" value="<?= (int)$application['id'] ?>"><button class="btn" name="action" value="reapprove_application">Re-approve</button><button class="btn secondary" name="action" value="delete_application">Delete</button></form></td></tr><?php endforeach; ?>
<?php if (!$rejectedApplications): ?><tr><td colspan="4" class="empty">No rejected applications.</td></tr><?php endif; ?></tbody></table></div></details>
<details class="panel" id="import"><summary><h2>Import Event Plan</h2></summary><p>Use the sample CSV exactly. Keep the header order, use <strong>YYYY-MM-DD</strong> dates, separate multiple sports with a pipe (<strong>|</strong>), and put one program item per line. PDF and DOC files need to be converted to this structured CSV first.</p><a class="btn secondary" href="<?= BASE_URL ?>/assets/templates/event_plan_import_template.csv" download>Download Sample CSV</a><form method="post" enctype="multipart/form-data"><input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>"><input type="hidden" name="action" value="import"><div class="form-group"><label>CSV event plan *</label><input type="file" name="event_file" accept=".csv,text/csv" required></div><button class="btn" type="submit">Import Event Plan</button></form></details>
<?php require __DIR__ . '/../includes/footer.php'; ?>
<script>
document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('event-sports-inputs');
    const addButton = document.getElementById('add-event-sport');
    if (!container || !addButton) return;
    addButton.addEventListener('click', function () {
        const row = document.createElement('div');
        row.className = 'sport-input-row';
        row.innerHTML = '<input name="sports[]" placeholder="e.g. Athletics" required><button class="btn secondary remove-sport" type="button">Remove</button>';
        container.appendChild(row);
    });
    container.addEventListener('click', function (event) {
        if (!event.target.classList.contains('remove-sport')) return;
        const rows = container.querySelectorAll('.sport-input-row');
        if (rows.length > 1) event.target.closest('.sport-input-row').remove();
    });
});
</script>