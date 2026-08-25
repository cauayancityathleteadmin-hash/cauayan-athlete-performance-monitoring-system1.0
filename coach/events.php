<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php'; require_once __DIR__ . '/../includes/functions.php'; require_coach();
$pdo = db(); $coachId = get_coach_id_for_user((int)current_user_id());
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf(); $action = $_POST['action'] ?? ''; $planId = (int)($_POST['event_plan_id'] ?? 0);
    try {
        if ($action === 'apply') $pdo->prepare("INSERT INTO event_applications (event_plan_id, coach_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE status='pending', reason=NULL, applied_at=NOW()")->execute([$planId, $coachId]);
        if ($action === 'add_participant') {
            $athleteIds = array_values(array_unique(array_filter(array_map('intval', (array)($_POST['athlete_ids'] ?? [])))));
            if (!$athleteIds && !empty($_POST['athlete_id'])) $athleteIds = [(int)$_POST['athlete_id']];
            if (!$athleteIds) throw new RuntimeException('Select at least one athlete.');
            $check = $pdo->prepare('SELECT id, sport_id FROM athletes WHERE id=? AND coach_id=? AND status="active"');
            $sportCheck = $pdo->prepare('SELECT 1 FROM event_plan_sports WHERE event_plan_id=? AND sport_id=?');
            $insert = $pdo->prepare("INSERT IGNORE INTO event_participants (event_plan_id, coach_id, athlete_id, sport_id, participant_type, added_by) VALUES (?, ?, ?, ?, 'athlete', ?)");
            $pdo->beginTransaction();
            foreach ($athleteIds as $athleteId) {
                $check->execute([$athleteId, $coachId]); $athlete = $check->fetch();
                if (!$athlete) throw new RuntimeException('You may only add active athletes assigned to your coach account.');
                $sportId = (int)$athlete['sport_id']; $sportCheck->execute([$planId, $sportId]);
                if (!$sportCheck->fetchColumn()) throw new RuntimeException('One selected athlete plays a sport that is not listed for this event.');
                $insert->execute([$planId, $coachId, $athleteId, $sportId, current_user_id()]);
            }
            $pdo->commit();
        }
        flash('success', $action === 'apply' ? 'Application submitted.' : 'Athlete added to the event.');
    } catch (Throwable $error) { flash('danger', $error instanceof RuntimeException ? $error->getMessage() : 'Could not update event participation.'); }
    redirect('coach/events.php');
}
$plans = $pdo->prepare("SELECT ep.*, GROUP_CONCAT(DISTINCT s.sport_name ORDER BY s.sport_name SEPARATOR ', ') sports, ea.status application_status
 FROM event_plans ep JOIN event_plan_sports eps ON eps.event_plan_id=ep.id JOIN sports s ON s.id=eps.sport_id LEFT JOIN event_applications ea ON ea.event_plan_id=ep.id AND ea.coach_id=? WHERE ep.status='open' GROUP BY ep.id ORDER BY ep.start_date"); $plans->execute([$coachId]); $plans=$plans->fetchAll();
$athletesStmt=$pdo->prepare('SELECT a.id, CONCAT_WS(" ",a.first_name,a.last_name) athlete_name, a.athlete_code, a.sport_id, s.sport_name FROM athletes a JOIN sports s ON s.id=a.sport_id WHERE a.coach_id=? AND a.status="active" ORDER BY a.last_name'); $athletesStmt->execute([$coachId]); $athletes=$athletesStmt->fetchAll();
$participantStmt=$pdo->prepare('SELECT ep.event_plan_id, CONCAT_WS(" ",a.first_name,a.last_name) athlete_name, a.athlete_code, s.sport_name FROM event_participants ep JOIN athletes a ON a.id=ep.athlete_id JOIN sports s ON s.id=ep.sport_id WHERE ep.coach_id=? AND ep.status="active" ORDER BY a.last_name'); $participantStmt->execute([$coachId]); $participants=[]; foreach($participantStmt->fetchAll() as $row) $participants[(int)$row['event_plan_id']][]=$row;
$pageTitle='Events'; require __DIR__ . '/../includes/header.php';
?><div class="page-title"><h1>Upcoming Events</h1></div><div class="panel"><p class="small">Browse plans and program flows. You can apply for an open event and add only athletes assigned to your coach account.</p><div class="table-wrap"><table><thead><tr><th>Event</th><th>Date</th><th>Time</th><th>Venue</th><th>Sports</th><th>Participation</th><th>Actions</th></tr></thead><tbody>
<?php foreach($plans as $plan): ?><tr><td><strong><?= e($plan['event_name']) ?></strong><br><?= e($plan['description'] ?? '') ?></td><td><?= e(format_date($plan['start_date'])) ?><?= $plan['end_date']?' to '.e(format_date($plan['end_date'])):'' ?></td><td><?= e(format_time($plan['start_time'] ?? null)) ?><br>to <?= e(format_time($plan['end_time'] ?? null)) ?></td><td><?= e($plan['venue']) ?></td><td><?= e($plan['sports']) ?></td><td><?php if(!$plan['application_status']): ?><form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="apply"><input type="hidden" name="event_plan_id" value="<?= (int)$plan['id'] ?>"><button class="btn" type="submit">Apply</button></form><?php else: ?><span class="badge <?= e($plan['application_status']) ?>"><?= e(ucfirst($plan['application_status'])) ?></span><?php endif; ?></td><td><div class="actions"><a class="btn secondary" href="<?= BASE_URL ?>/coach/event_plan.php?id=<?= (int)$plan['id'] ?>">View plan</a><button class="btn secondary" type="button" onclick="document.getElementById('add-athletes-<?= (int)$plan['id'] ?>').open=true; document.getElementById('add-athletes-<?= (int)$plan['id'] ?>').scrollIntoView({behavior:'smooth',block:'center'});">Add athletes</button></div></td></tr><tr><td colspan="7"><details class="event-participant-form" id="add-athletes-<?= (int)$plan['id'] ?>"><summary>Add athletes to this event</summary><p class="small">Select one athlete or use Ctrl-click to select a group.</p><form method="post" class="actions"><input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>"><input type="hidden" name="action" value="add_participant"><input type="hidden" name="event_plan_id" value="<?= (int)$plan['id'] ?>"><select name="athlete_ids[]" multiple required size="5"><?php foreach($athletes as $athlete): ?><option value="<?= (int)$athlete['id'] ?>"><?= e($athlete['athlete_code'].' — '.$athlete['athlete_name'].' ('.$athlete['sport_name'].')') ?></option><?php endforeach; ?></select><button class="btn" type="submit">Add selected athletes</button></form></details></td></tr><?php endforeach; ?>
<?php if(!$plans): ?><tr><td colspan="5" class="empty">No open event plans are available.</td></tr><?php endif; ?></tbody></table></div></div><?php require __DIR__ . '/../includes/footer.php'; ?>