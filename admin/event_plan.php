<?php

declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';
require_admin();

$pdo = db();
$planId = (int)($_GET['id'] ?? 0);
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $action = $_POST['action'] ?? '';
    if ($action === 'update') {
        $name = trim($_POST['event_name'] ?? '');
        $venue = trim($_POST['venue'] ?? '');
        $sports = array_values(array_filter(array_map('trim', (array)($_POST['sports'] ?? []))));
        if ($name === '' || $venue === '' || !$sports) {
            flash('danger', 'Event name, venue, and at least one sport are required.');
        } else {
            try {
                $pdo->beginTransaction();
                $pdo->prepare('UPDATE event_plans SET event_name=?, description=?, start_date=?, start_time=?, end_date=?, end_time=?, venue=?, status=?, program_flow=? WHERE id=?')
                    ->execute([$name, trim($_POST['description'] ?? '') ?: null, $_POST['start_date'], trim($_POST['start_time'] ?? '') ?: null, trim($_POST['end_date'] ?? '') ?: null, trim($_POST['end_time'] ?? '') ?: null, $venue, in_array($_POST['status'] ?? '', ['draft', 'open', 'closed', 'cancelled'], true) ? $_POST['status'] : 'draft', trim($_POST['program_flow'] ?? '') ?: null, $planId]);
                $pdo->prepare('DELETE FROM event_plan_sports WHERE event_plan_id=?')->execute([$planId]);
                $sportStmt = $pdo->prepare('INSERT INTO event_plan_sports (event_plan_id, sport_id) VALUES (?, ?)');
                foreach ($sports as $sportName) $sportStmt->execute([$planId, get_or_create_id($pdo, 'sports', 'sport_name', $sportName)]);
                $pdo->commit();
                audit('UPDATE_EVENT_PLAN', 'event_plan', $planId, "Updated event plan {$name}.");
                flash('success', 'Event plan updated.');
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                flash('danger', 'Could not update the event plan.');
            }
        }
        redirect('admin/event_plan.php?id=' . $planId);
    }
}
$stmt = $pdo->prepare("SELECT ep.*, GROUP_CONCAT(DISTINCT s.sport_name ORDER BY s.sport_name SEPARATOR ', ') sports FROM event_plans ep LEFT JOIN event_plan_sports eps ON eps.event_plan_id=ep.id LEFT JOIN sports s ON s.id=eps.sport_id WHERE ep.id=? GROUP BY ep.id");
$stmt->execute([$planId]);
$plan = $stmt->fetch();
if (!$plan) { http_response_code(404); exit('Event plan not found.'); }
$participantStmt = $pdo->prepare("SELECT CASE WHEN p.participant_type='coach' THEN CONCAT(c.coach_code, ' — ', c.first_name, ' ', c.last_name) ELSE CONCAT(a.athlete_code, ' — ', a.first_name, ' ', a.last_name) END participant_name, s.sport_name, p.participant_type FROM event_participants p LEFT JOIN athletes a ON a.id=p.athlete_id LEFT JOIN coaches c ON c.id=p.coach_id JOIN sports s ON s.id=p.sport_id WHERE p.event_plan_id=? AND p.status='active' ORDER BY p.participant_type, participant_name");
$participantStmt->execute([$planId]);
$participants = $participantStmt->fetchAll();
$sports = $pdo->query("SELECT id, sport_name FROM sports WHERE status='active' ORDER BY sport_name")->fetchAll();
$pageTitle = 'Event Details';
require __DIR__ . '/../includes/header.php';
?>
<div class="page-title"><h1>Event Details</h1><div class="actions"><a class="btn secondary" href="<?= BASE_URL ?>/admin/events.php">Back to Events</a><a class="btn secondary" href="#edit-event">Edit Event</a></div></div>
<div class="panel event-plan-detail"><h2><?= e($plan['event_name']) ?></h2><div class="event-plan-meta"><div><strong>Date</strong><span><?= e(format_date($plan['start_date'])) ?><?= $plan['end_date'] ? ' to ' . e(format_date($plan['end_date'])) : '' ?></span></div><div><strong>Time</strong><span><?= e(format_time($plan['start_time'] ?? null)) ?> to <?= e(format_time($plan['end_time'] ?? null)) ?></span></div><div><strong>Venue</strong><span><?= e($plan['venue']) ?></span></div><div><strong>Sports</strong><span><?= e($plan['sports'] ?? 'None') ?></span></div><div><strong>Status</strong><span class="badge <?= e($plan['status']) ?>"><?= e(ucfirst($plan['status'])) ?></span></div></div><h2>Program Flow</h2><pre class="program-flow"><?= e($plan['program_flow'] ?? 'No program flow added.') ?></pre><h2>Participants</h2><div class="table-wrap"><table><thead><tr><th>Participant</th><th>Type</th><th>Sport</th></tr></thead><tbody><?php foreach ($participants as $participant): ?><tr><td><?= e($participant['participant_name']) ?></td><td><?= e(ucfirst($participant['participant_type'])) ?></td><td><?= e($participant['sport_name']) ?></td></tr><?php endforeach; ?><?php if (!$participants): ?><tr><td colspan="3" class="empty">No participants listed yet.</td></tr><?php endif; ?></tbody></table></div></div>
<details class="panel" id="edit-event"><summary><h2>Edit Event</h2></summary><form method="post"><input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>"><input type="hidden" name="action" value="update"><div class="form-grid"><div class="form-group"><label>Event name *</label><input name="event_name" value="<?= e($plan['event_name']) ?>" required></div><div class="form-group"><label>Venue *</label><input name="venue" value="<?= e($plan['venue']) ?>" required></div><div class="form-group"><label>Start date *</label><input type="date" name="start_date" value="<?= e($plan['start_date']) ?>" required></div><div class="form-group"><label>Start time</label><input type="time" name="start_time" value="<?= e($plan['start_time'] ?? '') ?>"></div><div class="form-group"><label>End date</label><input type="date" name="end_date" value="<?= e($plan['end_date'] ?? '') ?>"></div><div class="form-group"><label>End time</label><input type="time" name="end_time" value="<?= e($plan['end_time'] ?? '') ?>"></div><div class="form-group full"><label>Sports played *</label><div id="edit-sports-inputs"><?php foreach (explode(', ', $plan['sports'] ?? '') as $sport): ?><div class="sport-input-row"><input name="sports[]" value="<?= e($sport) ?>" required><button class="btn secondary remove-sport" type="button">Remove</button></div><?php endforeach; ?></div><button class="btn secondary" id="add-edit-sport" type="button">Add sport</button></div><div class="form-group full"><label>Description</label><textarea name="description"><?= e($plan['description'] ?? '') ?></textarea></div><div class="form-group full"><label>Program flow</label><textarea name="program_flow"><?= e($plan['program_flow'] ?? '') ?></textarea></div><div class="form-group"><label>Status</label><select name="status"><?php foreach (['draft','open','closed','cancelled'] as $status): ?><option value="<?= $status ?>" <?= $plan['status'] === $status ? 'selected' : '' ?>><?= ucfirst($status) ?></option><?php endforeach; ?></select></div></div><br><button class="btn" type="submit">Save Changes</button></form></details>
<script>document.addEventListener('DOMContentLoaded',function(){const c=document.getElementById('edit-sports-inputs'),b=document.getElementById('add-edit-sport');if(!c||!b)return;b.onclick=function(){const r=document.createElement('div');r.className='sport-input-row';r.innerHTML='<input name="sports[]" required placeholder="e.g. Basketball"><button class="btn secondary remove-sport" type="button">Remove</button>';c.appendChild(r)};c.onclick=function(e){if(e.target.classList.contains('remove-sport')&&c.children.length>1)e.target.closest('.sport-input-row').remove()}});</script>
<?php require __DIR__ . '/../includes/footer.php'; ?>
