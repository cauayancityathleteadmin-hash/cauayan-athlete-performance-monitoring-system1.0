<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';

require_once __DIR__ . '/../includes/functions.php';
require_admin();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $action = $_POST['action'] ?? '';

    if ($action === 'create') {
        $first = trim($_POST['first_name'] ?? '');
        $middle = trim($_POST['middle_name'] ?? '');
        $last = trim($_POST['last_name'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $password = $_POST['password'] ?? '';
        $schoolName = trim($_POST['school_name'] ?? '');
        $birthdate = trim($_POST['birthdate'] ?? '');
        $sports = $_POST['sports'] ?? [];
        $filteredSports = array_values(array_filter(array_map('trim', $sports)));

        $birthValid = $birthdate !== '' && ($birthObject = DateTime::createFromFormat('!Y-m-d', $birthdate)) && $birthObject->format('Y-m-d') === $birthdate && $birthdate <= date('Y-m-d');

        if ($first === '' || $last === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 10 || $schoolName === '' || empty($filteredSports) || !$birthValid) {
            flash('danger', 'Complete all required fields, including at least one sport. Password must be at least 10 characters.');
            redirect('admin/coaches.php?add=1');
        } elseif (calculate_age($birthdate) < 18) {
            flash('danger', 'Coach must be at least 18 years old.');
            redirect('admin/coaches.php?add=1');
        }

        $pdo = db();
        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare('INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, "coach", "active")');
            $stmt->execute([$email, password_hash($password, PASSWORD_DEFAULT)]);
            $userId = (int)$pdo->lastInsertId();

            $schoolId = get_or_create_id($pdo, 'schools', 'school_name', $schoolName);

            $stmt = $pdo->prepare(
                'INSERT INTO coaches
                 (user_id, coach_code, first_name, middle_name, last_name, birthdate, email, school_id, status, date_registered)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, "active", CURDATE())'
            );
            $stmt->execute([$userId, 'TEMP', $first, $middle ?: null, $last, $birthdate, $email, $schoolId]);
            $coachId = (int)$pdo->lastInsertId();
            $coachCode = generate_code('COA', $coachId);

            $pdo->prepare('UPDATE coaches SET coach_code = ? WHERE id = ?')->execute([$coachCode, $coachId]);
            $pdo->prepare('UPDATE users SET username = ? WHERE id = ?')->execute([$coachCode, $userId]);

            // Use the filtered sports from validation
            $sports = $filteredSports;
            if (empty($sports)) {
                throw new RuntimeException('At least one sport must be provided.');
            }
            $coachSportStmt = $pdo->prepare('INSERT INTO coach_sports (coach_id, sport_id) VALUES (?, ?)');

            foreach ($sports as $sportName) {
                $sportId = get_or_create_id($pdo, 'sports', 'sport_name', $sportName);
                $coachSportStmt->execute([$coachId, $sportId]);
            }

            $pdo->commit();
            audit('CREATE_COACH', 'coach', $coachId, "Created coach {$coachCode}.");
            $coachName = trim($first . ' ' . $middle . ' ' . $last);
            $mailResult = send_coach_credentials($email, $coachName, $coachCode, $password);
            if ($mailResult === true) {
                flash('success', "Coach created. Login details were queued for delivery to {$email}. Coach ID / Username: {$coachCode}");
            } elseif ($mailResult === null) {
                flash('warning', "Coach created, but email delivery is not configured. Set Gmail credentials and MAIL_FROM first. Coach ID / Username: {$coachCode}; login email: {$email}");
            } else {
                flash('warning', "Coach created, but Gmail rejected the SMTP login. Generate a new Gmail App Password and update sendmail.ini. Coach ID / Username: {$coachCode}; login email: {$email}");
            }
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            flash('danger', $e instanceof RuntimeException ? $e->getMessage() : 'Could not create coach. The email may already be in use.');
        }

        redirect('admin/coaches.php');
    }

    if ($action === 'toggle_status') {
        $coachId = (int)($_POST['coach_id'] ?? 0);
        $stmt = db()->prepare('SELECT status, coach_code, user_id FROM coaches WHERE id = ?');
        $stmt->execute([$coachId]);
        $coach = $stmt->fetch();

        if ($coach) {
            $newStatus = $coach['status'] === 'active' ? 'inactive' : 'active';
            db()->prepare('UPDATE coaches SET status = ? WHERE id = ?')->execute([$newStatus, $coachId]);
            db()->prepare('UPDATE users SET status = ? WHERE id = ?')->execute([$newStatus, $coach['user_id']]);
            audit('UPDATE_COACH_STATUS', 'coach', $coachId, "Coach {$coach['coach_code']} changed to {$newStatus}.");
            flash('success', 'Coach status updated.');
        }
        redirect('admin/coaches.php');
    }

    if ($action === 'approve' || $action === 'reject') {
        $coachId = (int)($_POST['coach_id'] ?? 0);
        $reason = trim($_POST['reason'] ?? '');
        $stmt = db()->prepare(
            "SELECT c.id, c.user_id, c.coach_code, c.email,
                    CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name, c.suffix) AS coach_name
             FROM coaches c JOIN users u ON u.id = c.user_id
             WHERE c.id = ? AND u.status = 'pending'"
        );
        $stmt->execute([$coachId]);
        $pending = $stmt->fetch();
        if (!$pending) {
            flash('danger', 'Pending coach application not found.');
            redirect('admin/coaches.php');
        }

        $newStatus = $action === 'approve' ? 'active' : 'rejected';
        db()->prepare('UPDATE users SET status = ? WHERE id = ?')->execute([$newStatus, $pending['user_id']]);
        db()->prepare('UPDATE coaches SET status = ? WHERE id = ?')->execute([$action === 'approve' ? 'active' : 'inactive', $coachId]);
        audit(strtoupper('COACH_' . $action), 'coach', $coachId, $reason ?: "Coach {$pending['coach_code']} {$action}ed.");

        $mailResult = send_coach_status_email($pending['email'], $pending['coach_name'], $pending['coach_code'], $newStatus, $reason ?: null);
        $mailMessage = $mailResult === true ? ' Notification queued.' : ($mailResult === null ? ' Email is not configured.' : ' Gmail rejected the notification.');
        flash($action === 'approve' ? 'success' : 'warning', 'Coach application ' . ($action === 'approve' ? 'approved.' : 'rejected.') . $mailMessage);
        redirect('admin/coaches.php');
    }

    if ($action === 'approve_rejected') {
        $coachId = (int)($_POST['coach_id'] ?? 0);
        $stmt = db()->prepare(
            "SELECT c.id, c.user_id, c.coach_code, c.email,
                    CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name, c.suffix) AS coach_name
             FROM coaches c JOIN users u ON u.id = c.user_id
             WHERE c.id = ? AND u.status = 'rejected'"
        );
        $stmt->execute([$coachId]);
        $rejected = $stmt->fetch();
        if (!$rejected) {
            flash('danger', 'Rejected coach application not found.');
            redirect('admin/coaches.php');
        }

        db()->prepare('UPDATE users SET status = "active" WHERE id = ?')->execute([$rejected['user_id']]);
        db()->prepare('UPDATE coaches SET status = "active" WHERE id = ?')->execute([$coachId]);
        audit('COACH_REAPPROVE', 'coach', $coachId, "Re-approved rejected coach {$rejected['coach_code']}.");

        $mailResult = send_coach_status_email($rejected['email'], $rejected['coach_name'], $rejected['coach_code'], 'active');
        $mailMessage = $mailResult === true ? ' Notification queued.' : ($mailResult === null ? ' Email is not configured.' : ' Gmail rejected the notification.');
        flash('success', 'Rejected coach application has been approved.' . $mailMessage);
        redirect('admin/coaches.php');
    }

    if ($action === 'delete_rejected') {
        $coachId = (int)($_POST['coach_id'] ?? 0);
        $stmt = db()->prepare('SELECT user_id, coach_code FROM coaches WHERE id = ?');
        $stmt->execute([$coachId]);
        $coach = $stmt->fetch();

        if ($coach) {
            // The ON DELETE CASCADE on the foreign key will delete the coach record
            db()->prepare('DELETE FROM users WHERE id = ?')->execute([$coach['user_id']]);
            audit('DELETE_COACH', 'coach', $coachId, "Permanently deleted rejected coach {$coach['coach_code']}.");
            flash('success', 'Rejected coach has been permanently deleted.');
        } else {
            flash('danger', 'Coach not found.');
        }
        redirect('admin/coaches.php');
    }
}

$coachSort = $_GET['sort_by'] ?? 'surname_asc';
$coachSortOptions = [
    'surname_asc' => 'Surname (A-Z)',
    'surname_desc' => 'Surname (Z-A)',
    'first_name_asc' => 'First name (A-Z)',
    'first_name_desc' => 'First name (Z-A)',
    'coach_id_asc' => 'Coach ID (A-Z)',
    'coach_id_desc' => 'Coach ID (Z-A)',
    'age_asc' => 'Age (youngest first)',
    'age_desc' => 'Age (oldest first)',
    'school_asc' => 'School (A-Z)',
    'school_desc' => 'School (Z-A)',
    'athletes_desc' => 'Active athletes (highest first)',
    'athletes_asc' => 'Active athletes (lowest first)',
    'status_asc' => 'Status',
];
if (!array_key_exists($coachSort, $coachSortOptions)) $coachSort = 'surname_asc';
$coachOrderBy = [
    'surname_asc' => 'LOWER(c.last_name) ASC, LOWER(c.first_name) ASC, c.id ASC',
    'surname_desc' => 'LOWER(c.last_name) DESC, LOWER(c.first_name) DESC, c.id ASC',
    'first_name_asc' => 'LOWER(c.first_name) ASC, LOWER(c.last_name) ASC, c.id ASC',
    'first_name_desc' => 'LOWER(c.first_name) DESC, LOWER(c.last_name) ASC, c.id ASC',
    'coach_id_asc' => 'c.coach_code ASC',
    'coach_id_desc' => 'c.coach_code DESC',
    'age_asc' => 'c.birthdate DESC, LOWER(c.last_name) ASC, c.id ASC',
    'age_desc' => 'c.birthdate ASC, LOWER(c.last_name) ASC, c.id ASC',
    'school_asc' => 'LOWER(COALESCE(s.school_name, \'\')) ASC, LOWER(c.last_name) ASC, c.id ASC',
    'school_desc' => 'LOWER(COALESCE(s.school_name, \'\')) DESC, LOWER(c.last_name) ASC, c.id ASC',
    'athletes_desc' => 'athlete_count DESC, LOWER(c.last_name) ASC, c.id ASC',
    'athletes_asc' => 'athlete_count ASC, LOWER(c.last_name) ASC, c.id ASC',
    'status_asc' => 'u.status ASC, LOWER(c.last_name) ASC, c.id ASC',
][$coachSort];

$allCoachesStmt = db()->query(
    "SELECT c.*, u.status as user_status, u.email AS login_email, u.username, s.school_name,
           (SELECT COUNT(*) FROM athletes a WHERE a.coach_id = c.id AND a.status='active') AS athlete_count,
           (SELECT GROUP_CONCAT(sp.sport_name SEPARATOR ', ')
            FROM coach_sports cs JOIN sports sp ON sp.id = cs.sport_id
            WHERE cs.coach_id = c.id) AS coached_sports
    FROM coaches c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN schools s ON s.id = c.school_id
    ORDER BY {$coachOrderBy}"
);

$coaches = [];
$pendingCoaches = [];
$rejectedCoaches = [];
foreach ($allCoachesStmt->fetchAll() as $coach) {
    $coach['display_name'] = format_person_name($coach['first_name'], $coach['middle_name'], $coach['last_name'], $coach['suffix'] ?? null, str_starts_with($coachSort, 'first_name'));
    if ($coach['user_status'] === 'pending') $pendingCoaches[] = $coach;
    elseif ($coach['user_status'] === 'rejected') $rejectedCoaches[] = $coach;
    else $coaches[] = $coach;
}

$rejectedCoachesFromDb = db()->query(
    "SELECT c.id, c.user_id, c.coach_code, c.email, c.first_name, c.middle_name, c.last_name, c.suffix, c.birthdate, c.date_registered
     FROM coaches c JOIN users u ON u.id = c.user_id
     WHERE u.status = 'rejected'
    ORDER BY LOWER(c.last_name), LOWER(c.first_name), c.id"
)->fetchAll();

$pageTitle = 'Manage Coaches';
require __DIR__ . '/../includes/header.php';
?>
<div class="page-title">
<h1>Manage Coaches</h1><div class="actions"><a class="btn" href="<?= BASE_URL ?>/admin/coaches.php?add=1">Add Coach</a><a class="btn secondary" href="<?= BASE_URL ?>/admin/coaches.php?pending=1">Pending requests <span class="button-count"><?= count($pendingCoaches) ?></span></a><a class="btn secondary" href="<?= BASE_URL ?>/admin/coaches.php?rejected=1">Rejected coaches <span class="button-count"><?= count($rejectedCoachesFromDb) ?></span></a></div>
</div>

<?php if (isset($_GET['pending'])): ?>
<div class="panel">
<div class="section-heading"><div><h2>Pending Coach Applications</h2><p class="small">Approve or reject coach registration requests.</p></div><span class="count-badge"><?= count($pendingCoaches) ?></span></div>
<?php if (!$pendingCoaches): ?><p class="empty">No pending applications.</p><?php else: ?>
<div class="table-wrap"><table><thead><tr><th>Name</th><th>Age</th><th>Email</th><th>Submitted</th><th>Action</th></tr></thead><tbody>
<?php foreach ($pendingCoaches as $pending): ?>
<tr><td><?= e(trim($pending['first_name'] . ' ' . $pending['middle_name'] . ' ' . $pending['last_name'])) ?></td><td><?= calculate_age($pending['birthdate']) ?></td><td><?= e($pending['email']) ?></td><td><?= e($pending['date_registered']) ?></td><td><div class="actions"><form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="approve"><input type="hidden" name="coach_id" value="<?= (int)$pending['id'] ?>"><button class="btn" type="submit">Approve</button></form><form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="reject"><input type="hidden" name="coach_id" value="<?= (int)$pending['id'] ?>"><input type="text" name="reason" placeholder="Optional reason"><button class="btn secondary" type="submit">Reject</button></form></div></td></tr>
<?php endforeach; ?>
</tbody></table></div>
<?php endif; ?>
</div>
<?php endif; ?>

<?php if (isset($_GET['add'])): ?>
<div class="panel">
<h2>Create Coach</h2>
<form method="post">
<?= csrf_field() ?><input type="hidden" name="action" value="create">
<div class="form-grid">
<div class="form-group"><label>First Name *</label><input name="first_name" required></div>
<div class="form-group"><label>Middle Name</label><input name="middle_name"></div>
<div class="form-group"><label>Last Name *</label><input name="last_name" required></div>
<div class="form-group"><label>Birthdate *</label><input type="date" name="birthdate" max="<?= date('Y-m-d') ?>" required></div>
<div class="form-group"><label>School *</label><input name="school_name" required></div>
<div class="form-group">
    <label>Sports Coached *</label>
    <div id="sports-inputs">
        <div class="sport-input-group">
            <input name="sports[]" value="<?= e(($_POST['sports'][0] ?? '')) ?>" placeholder="e.g. Basketball" required>
        </div>
        <?php
        if (isset($_POST['sports']) && is_array($_POST['sports'])) {
            for ($i = 1; $i < count($_POST['sports']); $i++) {
                $sportValue = trim($_POST['sports'][$i]);
                if ($sportValue !== '') {
                    echo '<div class="sport-input-group"><input name="sports[]" value="' . e($sportValue) . '" placeholder="Another sport"><button type="button" class="btn-remove-sport btn secondary">Remove</button></div>';
                } 
            }
        }
        ?>
        </div>
    </div>
    <button type="button" id="add-sport-btn" class="btn-add-more">+ Add another sport</button>
</div>
<div class="form-group"><label>Login Email *</label><input type="email" name="email" required></div>
<div class="form-group"><label>Initial Password *</label><input type="password" name="password" minlength="10" required></div>
</div>
<br><button class="btn" type="submit">Create Coach</button>
</form>
</div>
<?php endif; ?>

<?php if (isset($_GET['rejected'])): ?>
<div class="panel">
<div class="section-heading"><div><h2>Rejected Coach Applications</h2><p class="small">Rejected applications remain available for review or re-approval.</p></div><span class="count-badge"><?= count($rejectedCoachesFromDb) ?></span></div>
<?php if (!$rejectedCoachesFromDb): ?><p class="empty">No rejected coach applications.</p><?php else: ?><div class="table-wrap"><table><thead><tr><th>Name</th><th>Age</th><th>Email</th><th>Submitted</th><th>Action</th></tr></thead><tbody>
<?php foreach ($rejectedCoachesFromDb as $rejected): ?>
<tr><td><?= e(trim($rejected['first_name'] . ' ' . $rejected['middle_name'] . ' ' . $rejected['last_name'])) ?></td><td><?= calculate_age($rejected['birthdate']) ?></td><td><?= e($rejected['email']) ?></td><td><?= e($rejected['date_registered']) ?></td><td><div class="actions"><form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="approve_rejected"><input type="hidden" name="coach_id" value="<?= (int)$rejected['id'] ?>"><button class="btn" type="submit">Re-approve</button></form><form method="post" data-confirm="Permanently delete this coach? This cannot be undone."><?= csrf_field() ?><input type="hidden" name="action" value="delete_rejected"><input type="hidden" name="coach_id" value="<?= (int)$rejected['id'] ?>"><button class="btn secondary" type="submit">Delete</button></form></div></td></tr>
<?php endforeach; ?>
</tbody></table></div><?php endif; ?>
</div>
<?php endif; ?>

<div class="panel">
<div class="section-heading"><div><h2>All Coaches</h2><p class="small">Use the controls to sort the coach directory.</p></div><span class="count-badge"><?= count($coaches) ?></span></div>
<form class="list-toolbar" method="get"><label for="coach_sort">Sort coaches by</label><select id="coach_sort" name="sort_by"><?php foreach ($coachSortOptions as $value => $label): ?><option value="<?= e($value) ?>" <?= $coachSort === $value ? 'selected' : '' ?>><?= e($label) ?></option><?php endforeach; ?></select><button class="btn" type="submit">Apply sort</button></form>
<div class="table-wrap"><table>
<thead><tr><th>Coach ID</th><th>Coach</th><th>Age</th><th>School</th><th>Sports</th><th>Email</th><th>Active Athletes</th><th>Account</th><th>Action</th></tr></thead>
<tbody>
<?php foreach ($coaches as $coach): ?>
<tr>
<td><strong><?= e($coach['coach_code']) ?></strong><br><span class="small"><?= e($coach['username']) ?></span></td>
<td>
    <?= e($coach['display_name']) ?>
</td>
<td><?= calculate_age($coach['birthdate']) ?></td>
<td><span class="small"><?= e($coach['school_name'] ?? 'No School') ?></span></td>
<td><span class="small"><?= e($coach['coached_sports'] ?? '—') ?></span></td>
<td><?= e($coach['login_email']) ?></td>
<td><?= (int)$coach['athlete_count'] ?></td>
<td><span class="badge <?= e($coach['user_status'] === 'active' ? 'active' : 'inactive') ?>"><?= e(ucfirst($coach['user_status'])) ?></span></td>
<td>
<form method="post" class="actions">
<?= csrf_field() ?><input type="hidden" name="action" value="toggle_status"><input type="hidden" name="coach_id" value="<?= (int)$coach['id'] ?>">
<button class="btn secondary" type="submit"><?= $coach['status'] === 'active' ? 'Deactivate' : 'Activate' ?></button>
</form>
</td>
</tr>
<?php endforeach; ?>
<?php if (!$coaches): ?><tr><td colspan="9" class="empty">No coach accounts found. Use Add Coach or wait for a registration request.</td></tr><?php endif; ?>
</tbody>
</table></div>
</div>
<script>
document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('sports-inputs');
    const addButton = document.getElementById('add-sport-btn');

    if (addButton && container) {
        addButton.addEventListener('click', function() {
            const newGroup = document.createElement('div');
            newGroup.className = 'sport-input-group';
            newGroup.innerHTML = `
                <input name="sports[]" placeholder="Another sport">
                <button type="button" class="btn-remove-sport btn secondary">Remove</button>
            `;
            container.appendChild(newGroup);
        });

        container.addEventListener('click', function(e) {
            if (e.target && e.target.classList.contains('btn-remove-sport')) {
                e.target.closest('.sport-input-group').remove();
            }
        });
    }
});
</script>
<?php require __DIR__ . '/../includes/footer.php'; ?>
