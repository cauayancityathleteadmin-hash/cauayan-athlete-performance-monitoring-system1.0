<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';

require_once __DIR__ . '/../includes/functions.php';
require_coach_or_admin();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $action = $_POST['action'] ?? '';
    $pdo = db();
    
    // Security: Explicitly define which actions a coach is allowed to perform on this page.
    $coach_allowed_actions = ['create', 'bulk_import'];
    if (is_coach() && !in_array($action, $coach_allowed_actions, true)) {
        http_response_code(403); // Forbidden
        exit('Access Denied: You do not have permission to perform this action.');
    }

    if ($action === 'create' || $action === 'update') {
        $id = (int)($_POST['athlete_id'] ?? 0);
        $first = trim($_POST['first_name'] ?? '');
        $middle = trim($_POST['middle_name'] ?? '');
        $last = trim($_POST['last_name'] ?? '');
        $suffix = trim($_POST['suffix'] ?? '');
        $birthdate = $_POST['birthdate'] ?? '';
        $gender = $_POST['gender'] ?? '';
        $contact = trim($_POST['contact_number'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $address = trim($_POST['address'] ?? '');
        $schoolName = trim($_POST['school_name'] ?? '');
        $sportName = trim($_POST['sport_name'] ?? '');
        $coachName = trim($_POST['coach_name'] ?? '');
        $coachId = 0;

        if (is_coach()) {
            $coachId = get_coach_id_for_user((int)current_user_id()) ?? 0;
        }

        $validEmail = $email === '' || filter_var($email, FILTER_VALIDATE_EMAIL);
        $birthObject = $birthdate === '' ? false : DateTime::createFromFormat('!Y-m-d', $birthdate);
        $birthValid = $birthObject !== false
            && $birthObject->format('Y-m-d') === $birthdate
            && $birthdate <= date('Y-m-d');
        $validationErrors = [];
        if ($first === '') $validationErrors[] = 'first name';
        if ($last === '') $validationErrors[] = 'last name';
        if (!$birthValid) $validationErrors[] = 'birthdate';
        if (!in_array($gender, ['male','female','other','prefer_not_to_say'], true)) $validationErrors[] = 'gender';
        if ($sportName === '') $validationErrors[] = 'sport';
        if (!$coachId && $coachName === '') $validationErrors[] = 'assigned coach';
        if (!$validEmail) $validationErrors[] = 'email';
        if ($validationErrors) {
            flash('danger', 'Please check: ' . implode(', ', $validationErrors) . '. School and suffix are optional.');
            redirect($action === 'update' ? 'admin/athletes.php?edit=' . $id : 'admin/athletes.php?add=1');
        }

        try {
            $pdo->beginTransaction();

            $schoolId = ($schoolName !== '') ? get_or_create_id($pdo, 'schools', 'school_name', $schoolName) : null;
            $sportId = get_or_create_id($pdo, 'sports', 'sport_name', $sportName);

                        if (is_admin()) {
                                $stmt = $pdo->prepare(
                                        "SELECT c.id
                                         FROM coaches c
                                         JOIN users u ON u.id = c.user_id
                                         WHERE c.status = 'active' AND u.status = 'active'
                                             AND (c.coach_code = ? OR u.email = ?
                                                        OR LOWER(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name, c.suffix)) = LOWER(?))
                                         LIMIT 1"
                                );
                                $stmt->execute([$coachName, $coachName, $coachName]);
                                $coachId = (int)($stmt->fetchColumn() ?: 0);
                        }
            if (!$coachId) {
                throw new RuntimeException('Assigned coach not found. Enter the coach ID, email, or exact full name of an active coach.');
            }

            if ($action === 'create') {
                $stmt = $pdo->prepare(
                    'INSERT INTO athletes
                    (athlete_code, first_name, middle_name, last_name, suffix, birthdate, gender, contact_number, email, address, school_id, sport_id, coach_id, status, date_registered)
                    VALUES ("TEMP", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "active", CURDATE())'
                );
                $stmt->execute([$first, $middle ?: null, $last, $suffix ?: null, $birthdate, $gender, $contact ?: null, $email ?: null, $address ?: null, $schoolId, $sportId, $coachId]);
                $athleteId = (int)$pdo->lastInsertId();
                $athleteCode = generate_code('ATH', $athleteId);
                $pdo->prepare('UPDATE athletes SET athlete_code = ? WHERE id = ?')->execute([$athleteCode, $athleteId]);
                $pdo->prepare('INSERT INTO athlete_coach_history (athlete_id, coach_id, assigned_by, reason) VALUES (?, ?, ?, ?)')->execute([$athleteId, $coachId, current_user_id(), 'Initial coach assignment']);
                $pdo->prepare('INSERT INTO athlete_status_history (athlete_id, old_status, new_status, changed_by, reason) VALUES (?, NULL, "active", ?, ?)')->execute([$athleteId, current_user_id(), 'Initial registration']);
                $pdo->commit();
                audit('CREATE_ATHLETE', 'athlete', $athleteId, "Created athlete {$athleteCode}.");
                flash('success', "Athlete created. Athlete ID: {$athleteCode}");
            } else {
                $old = $pdo->prepare('SELECT coach_id, athlete_code FROM athletes WHERE id = ? FOR UPDATE');
                $old->execute([$id]);
                $existing = $old->fetch();
                if (!$existing) throw new RuntimeException('Athlete not found.');

                $pdo->prepare('UPDATE athletes SET first_name=?, middle_name=?, last_name=?, suffix=?, birthdate=?, gender=?, contact_number=?, email=?, address=?, school_id=?, sport_id=?, coach_id=? WHERE id=?')
                    ->execute([$first, $middle ?: null, $last, $suffix ?: null, $birthdate, $gender, $contact ?: null, $email ?: null, $address ?: null, $schoolId, $sportId, $coachId, $id]);

                if ((int)$existing['coach_id'] !== $coachId) {
                    $pdo->prepare('UPDATE athlete_coach_history SET ended_at = NOW() WHERE athlete_id = ? AND ended_at IS NULL')->execute([$id]);
                    $pdo->prepare('INSERT INTO athlete_coach_history (athlete_id, coach_id, assigned_by, reason) VALUES (?, ?, ?, ?)')->execute([$id, $coachId, current_user_id(), 'Coach reassigned by Admin']);
                }
                $pdo->commit();
                audit('UPDATE_ATHLETE', 'athlete', $id, "Updated athlete {$existing['athlete_code']}.");
                if ((int)$existing['coach_id'] !== $coachId) audit('REASSIGN_ATHLETE', 'athlete', $id, "Reassigned {$existing['athlete_code']} to coach ID {$coachId}.");
                flash('success', 'Athlete information updated.');
            }
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            flash('danger', $e instanceof RuntimeException ? $e->getMessage() : 'Could not save the athlete. Please check the entered values.');
        }
        $redirect_path = is_coach() ? 'coach/athletes.php' : 'admin/athletes.php';
        redirect($redirect_path);
    }

    if ($action === 'bulk_import') {
        if (!isset($_FILES['athlete_file']) || $_FILES['athlete_file']['error'] !== UPLOAD_ERR_OK) {
            flash('danger', 'File upload failed. Please check the file size and try again.');
            redirect('admin/athletes.php?import=1');
        }

        $file = $_FILES['athlete_file'];
        $file_ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($file_ext, ['csv', 'xlsx'], true)) {
            flash('danger', 'Invalid file type. Please upload a CSV or XLSX Excel file.');
            redirect('admin/athletes.php?import=1');
        }

        $rows_to_process = [];
        $errors = [];
        $row_num = 1;
        $currentCoachId = is_coach() ? (get_coach_id_for_user((int)current_user_id()) ?? 0) : 0;
        $coachIdentifier = '';

        try {
            $importRows = read_athlete_import_file($file['tmp_name'], $file_ext);
            if (!$importRows) {
                throw new RuntimeException('The uploaded file is empty.');
            }
            validate_athlete_import_headers(array_shift($importRows), is_admin());
        } catch (Throwable $e) {
            flash('danger', $e instanceof RuntimeException ? $e->getMessage() : 'The uploaded file could not be read.');
            redirect('admin/athletes.php?import=1');
        }

        foreach ($importRows as $data) {
            $row_num++;
            $row_errors = [];
            $first = trim($data[0] ?? '');
            $last = trim($data[2] ?? '');
            $birthdate = trim($data[4] ?? '');
            $gender = trim($data[5] ?? '');
            $sportName = trim($data[10] ?? '');
            $coachIdentifier = is_admin() ? trim($data[11] ?? '') : '';

            if ($first === '') $row_errors[] = 'first_name is required';
            if ($last === '') $row_errors[] = 'last_name is required';
            $birthObject = $birthdate === '' ? false : DateTime::createFromFormat('!Y-m-d', $birthdate);
            if ($birthObject === false || $birthObject->format('Y-m-d') !== $birthdate || $birthdate > date('Y-m-d')) $row_errors[] = 'invalid birthdate (use YYYY-MM-DD and do not use a future date)';
            if (!in_array($gender, ['male','female','other','prefer_not_to_say'], true)) $row_errors[] = 'invalid gender';
            if ($sportName === '') $row_errors[] = 'sport_name is required';
            if (($email = trim($data[7] ?? '')) !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $row_errors[] = 'invalid email';
            if (is_admin() && $coachIdentifier === '') $row_errors[] = 'coach_identifier is required for admins';

            if (!empty($row_errors)) {
                $errors[] = "Row {$row_num}: " . implode(', ', $row_errors);
            } else {
                $rows_to_process[] = $data;
            }
        }

        if (!empty($errors)) {
            flash('danger', 'Import failed. Please fix these errors: ' . implode(' | ', $errors));
            redirect('admin/athletes.php?import=1');
        }

        if (empty($rows_to_process)) {
            flash('warning', 'The uploaded CSV file is empty or contains no valid data rows.');
            redirect('admin/athletes.php?import=1');
        }

        try {
            $pdo->beginTransaction();
            $imported_count = 0;

            foreach ($rows_to_process as $row) {
                $coachId = $currentCoachId;
                if (is_admin()) {
                    $coachIdentifier = trim($row[11] ?? '');
                    $stmt = $pdo->prepare("SELECT c.id FROM coaches c JOIN users u ON u.id = c.user_id WHERE c.status = 'active' AND u.status = 'active' AND (c.coach_code = ? OR u.email = ? OR LOWER(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name, c.suffix)) = LOWER(?)) LIMIT 1");
                    $stmt->execute([$coachIdentifier, $coachIdentifier, $coachIdentifier]);
                    $coachId = (int)($stmt->fetchColumn() ?: 0);
                }

                if (!$coachId) {
                    throw new RuntimeException("Import aborted: Coach '{$coachIdentifier}' could not be found for one or more rows. Please ensure all coach identifiers are correct.");
                }

                $schoolId = ($s_name = trim($row[9] ?? '')) ? get_or_create_id($pdo, 'schools', 'school_name', $s_name) : null;
                $sportId = get_or_create_id($pdo, 'sports', 'sport_name', trim($row[10]));
                $stmt = $pdo->prepare('INSERT INTO athletes (athlete_code, first_name, middle_name, last_name, suffix, birthdate, gender, contact_number, email, address, school_id, sport_id, coach_id, status, date_registered) VALUES ("TEMP", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "active", CURDATE())');
                $stmt->execute([
                    trim($row[0]), trim($row[1]) ?: null, trim($row[2]), trim($row[3]) ?: null, trim($row[4]), trim($row[5]),
                    trim($row[6]) ?: null, trim($row[7]) ?: null, trim($row[8]) ?: null,
                    $schoolId, $sportId, $coachId
                ]);
                $athleteId = (int)$pdo->lastInsertId();
                $athleteCode = generate_code('ATH', $athleteId);
                $pdo->prepare('UPDATE athletes SET athlete_code = ? WHERE id = ?')->execute([$athleteCode, $athleteId]);
                $pdo->prepare('INSERT INTO athlete_coach_history (athlete_id, coach_id, assigned_by, reason) VALUES (?, ?, ?, ?)')->execute([$athleteId, $coachId, current_user_id(), 'Initial assignment via bulk import']);
                $pdo->prepare('INSERT INTO athlete_status_history (athlete_id, old_status, new_status, changed_by, reason) VALUES (?, NULL, "active", ?, ?)')->execute([$athleteId, current_user_id(), 'Initial registration via bulk import']);
                $imported_count++;
            }

            $pdo->commit();
            audit('BULK_IMPORT_ATHLETES', 'system', null, "Imported {$imported_count} athletes.");
            flash('success', "Successfully imported {$imported_count} athletes.");

        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            flash('danger', $e instanceof RuntimeException ? $e->getMessage() : 'An unexpected error occurred during import. The transaction was rolled back.');
        }
        $redirect_path = is_coach() ? 'coach/athletes.php' : 'admin/athletes.php';
        redirect($redirect_path);
    }

    if ($action === 'toggle_status') { // Admin-only action
        $athleteId = (int)($_POST['athlete_id'] ?? 0);
        $stmt = $pdo->prepare('SELECT status, athlete_code FROM athletes WHERE id = ?');
        $stmt->execute([$athleteId]);
        $athlete = $stmt->fetch();

        if ($athlete) {
            $newStatus = $athlete['status'] === 'active' ? 'inactive' : 'active';
            $pdo->prepare('UPDATE athletes SET status = ? WHERE id = ?')->execute([$newStatus, $athleteId]);
            $pdo->prepare('INSERT INTO athlete_status_history (athlete_id, old_status, new_status, changed_by, reason) VALUES (?, ?, ?, ?, ?)')->execute([$athleteId, $athlete['status'], $newStatus, current_user_id(), 'Status changed by Admin']);
            audit('UPDATE_ATHLETE_STATUS', 'athlete', $athleteId, "Athlete {$athlete['athlete_code']} changed to {$newStatus}.");
            flash('success', 'Athlete status updated.');
        }
        redirect('admin/athletes.php');
    } // End toggle_status
}

$editId = (int)($_GET['edit'] ?? 0);
$editAthlete = null;
$showImport = isset($_GET['import']);
if ($editId) {
    if (!is_admin()) {
        flash('danger', 'Only administrators can edit athlete records.');
        redirect('admin/athletes.php');
    }

    $stmt = db()->prepare(
        "SELECT a.*, s.school_name, sp.sport_name,
                c.coach_code,
                CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name, c.suffix) AS coach_name
         FROM athletes a
         LEFT JOIN schools s ON s.id = a.school_id
         JOIN sports sp ON sp.id = a.sport_id
         JOIN coaches c ON c.id = a.coach_id
         WHERE a.id = ?"
    );
    $stmt->execute([$editId]);
    $editAthlete = $stmt->fetch() ?: null;
}

$q = trim($_GET['q'] ?? ''); // Search query
$sortBy = $_GET['sort_by'] ?? 'name_asc'; // Default sort
$params = [];
$sql = "SELECT a.*, s.school_name, sp.sport_name, c.coach_code,
    c.first_name AS coach_first_name, c.middle_name AS coach_middle_name, c.last_name AS coach_last_name, c.suffix AS coach_suffix,
    a.first_name, a.middle_name, a.last_name, a.suffix
        FROM athletes a
        LEFT JOIN schools s ON s.id=a.school_id
        JOIN sports sp ON sp.id=a.sport_id
        JOIN coaches c ON c.id=a.coach_id"; // Always join coaches for admin view
if ($q !== '') {
    $sql .= " WHERE a.athlete_code LIKE ? OR
                  a.first_name LIKE ? OR
                  a.last_name LIKE ? OR
                  CONCAT_WS(' ', a.first_name, a.last_name) LIKE ? OR
                  CONCAT_WS(' ', a.first_name, a.middle_name, a.last_name) LIKE ? OR
                  c.coach_code LIKE ? OR
                  c.first_name LIKE ? OR
                  c.last_name LIKE ? OR
                  sp.sport_name LIKE ?";
    $like = "%{$q}%";
    $params = [$like, $like, $like, $like, $like, $like, $like, $like, $like];
}

switch ($sortBy) {
    case 'name_desc': $sql .= " ORDER BY a.last_name DESC, a.first_name DESC"; break;
    case 'sport_asc': $sql .= " ORDER BY sp.sport_name ASC, a.last_name, a.first_name"; break;
    case 'coach_asc': $sql .= " ORDER BY c.coach_code ASC, a.last_name, a.first_name"; break;
    case 'registered_desc': $sql .= " ORDER BY a.date_registered DESC, a.last_name, a.first_name"; break;
    case 'status_asc': $sql .= " ORDER BY a.status ASC, a.last_name, a.first_name"; break;
    case 'age_desc': $sql .= " ORDER BY a.birthdate ASC, a.last_name, a.first_name"; break; // Older athletes first
    case 'age_asc': $sql .= " ORDER BY a.birthdate DESC, a.last_name, a.first_name"; break; // Younger athletes first
    default: $sql .= " ORDER BY a.last_name, a.first_name"; break; // name_asc
}

$stmt = db()->prepare($sql);
$stmt->execute($params);
$athletes = $stmt->fetchAll();

$pageTitle = 'Athletes';
if (isset($_GET['add'])) $pageTitle = 'Add Athlete';
if ($showImport) $pageTitle = 'Bulk Import Athletes';
if ($editAthlete) $pageTitle = 'Edit Athlete — ' . e($editAthlete['athlete_code']);

require __DIR__ . '/../includes/header.php';
?>
<?php $showAthleteForm = isset($_GET['add']) || $editAthlete; ?>
<div class="page-title">
    <h1><?= e($pageTitle) ?></h1>
    <div class="actions">
        <?php if (!$showAthleteForm && !$showImport && is_admin()): ?>
            <a class="btn" href="<?= BASE_URL ?>/admin/athletes.php?add=1">Add Athlete</a>
            <a class="btn secondary" href="<?= BASE_URL ?>/admin/athletes.php?import=1">Import Athletes</a>
        <?php endif; ?>
    </div>
</div>

<?php if ($showImport): ?>
<div class="panel">
    <div class="import-heading"><div><h2>Import Athletes in Bulk</h2><p class="small">Upload a CSV file or an Excel workbook saved as XLSX.</p></div><a class="btn secondary" href="<?= BASE_URL ?>/assets/templates/athlete_import_template.csv" download>Download Template</a></div>
    <div class="import-instructions">
        <h3>File requirements</h3>
        <ol>
            <li>Use the downloadable template and keep the header names and column order unchanged.</li>
            <li>Use <strong>YYYY-MM-DD</strong> for birthdates. Gender must be <strong>male</strong>, <strong>female</strong>, <strong>other</strong>, or <strong>prefer_not_to_say</strong>.</li>
            <li>School, sport, and event names may be new; matching records are reused automatically.</li>
            <li>Remove the example row before importing your real records.</li>
        </ol>
        <p><strong>Columns:</strong> first_name, middle_name, last_name, suffix, birthdate, gender, contact_number, email, address, school_name, sport_name<?php if (is_admin()): ?>, coach_identifier<?php endif; ?>.</p>
        <p class="small"><?php if (is_coach()): ?>Every imported athlete is automatically assigned to your coach account; coach_identifier is ignored.<?php else: ?>For each row, coach_identifier must be an active Coach ID, login email, or exact full name.<?php endif; ?></p>
    </div>

    <h3>Upload file</h3>

    <form method="post" enctype="multipart/form-data" action="<?= BASE_URL ?>/admin/athletes.php">
        <?= csrf_field() ?><input type="hidden" name="action" value="bulk_import"><div class="form-group"><label for="athlete_file">CSV or XLSX file *</label><input type="file" name="athlete_file" id="athlete_file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></div><div class="actions"><button class="btn" type="submit">Import Athletes</button><a class="btn secondary" href="<?= BASE_URL ?>/<?= is_coach() ? 'coach' : 'admin' ?>/athletes.php">Cancel</a></div>
    </form>
</div>
    <?php endif; ?>
<?php if ($showAthleteForm): ?>
<div class="panel">
<h2><?= $editAthlete ? 'Edit Athlete — ' . e($editAthlete['athlete_code']) : 'Register Athlete' ?></h2>
<form method="post">
<?= csrf_field() ?><input type="hidden" name="action" value="<?= $editAthlete ? 'update' : 'create' ?>">
<?php if ($editAthlete): ?><input type="hidden" name="athlete_id" value="<?= (int)$editAthlete['id'] ?>"><?php endif; ?>
<div class="form-grid">
<div class="form-group"><label>First Name *</label><input name="first_name" value="<?= e($editAthlete['first_name'] ?? '') ?>" required></div>
<div class="form-group"><label>Middle Name</label><input name="middle_name" value="<?= e($editAthlete['middle_name'] ?? '') ?>"></div>
<div class="form-group"><label>Last Name *</label><input name="last_name" value="<?= e($editAthlete['last_name'] ?? '') ?>" required></div>
<div class="form-group"><label>Suffix (optional)</label><input name="suffix" value="<?= e($editAthlete['suffix'] ?? '') ?>" placeholder="Jr., III (optional)"></div>
<div class="form-group"><label>Birthdate *</label><input type="date" name="birthdate" max="<?= date('Y-m-d') ?>" value="<?= e($editAthlete['birthdate'] ?? '') ?>" required></div>
<div class="form-group"><label>Gender *</label><select name="gender" required><option value="">Select</option><?php foreach(['male'=>'Male','female'=>'Female','other'=>'Other','prefer_not_to_say'=>'Prefer not to say'] as $value=>$label): ?><option value="<?= $value ?>" <?= (($editAthlete['gender'] ?? '') === $value) ? 'selected' : '' ?>><?= $label ?></option><?php endforeach; ?></select></div>
<div class="form-group"><label>Contact Number</label><input name="contact_number" value="<?= e($editAthlete['contact_number'] ?? '') ?>"></div>
<div class="form-group"><label>Email</label><input type="email" name="email" value="<?= e($editAthlete['email'] ?? '') ?>"></div>
<div class="form-group full"><label>Address</label><textarea name="address"><?= e($editAthlete['address'] ?? '') ?></textarea></div>
<div class="form-group"><label>School</label><input name="school_name" value="<?= e($editAthlete['school_name'] ?? '') ?>" placeholder="Type school name"></div>
<div class="form-group"><label>Sport *</label><input name="sport_name" value="<?= e($editAthlete['sport_name'] ?? '') ?>" placeholder="Type sport name" required></div>
<?php if (is_admin()): ?><div class="form-group"><label>Assigned Coach *</label><input name="coach_name" value="<?= e($editAthlete['coach_code'] ?? '') ?>" placeholder="Coach ID, email, or exact full name" required></div><?php else: ?><div class="form-group"><label>Assigned Coach</label><input value="Your coach account" disabled><span class="small">This athlete will be assigned to you.</span></div><?php endif; ?>
</div>
<br><div class="actions">
    <button class="btn" type="submit"><?= $editAthlete ? 'Save Changes' : 'Register Athlete' ?></button>
    <a class="btn secondary" href="<?= BASE_URL ?>/<?= is_coach() ? 'coach' : 'admin' ?>/athletes.php">Cancel</a>
</div>
</form>
</div>
<?php endif; ?>

<?php if (is_admin() && !$showAthleteForm && !$showImport): ?>
<div class="panel">
<h2>Athletes</h2>
<form class="search-bar" method="get"> <!-- Moved outside the table -->
    <input name="q" value="<?= e($q) ?>" placeholder="Search ID, name, coach, sport, event">
    <select name="sort_by">
        <option value="name_asc" <?= $sortBy === 'name_asc' ? 'selected' : '' ?>>Name (A-Z)</option>
        <option value="name_desc" <?= $sortBy === 'name_desc' ? 'selected' : '' ?>>Name (Z-A)</option>
        <option value="sport_asc" <?= $sortBy === 'sport_asc' ? 'selected' : '' ?>>Sport</option>
        <option value="coach_asc" <?= $sortBy === 'coach_asc' ? 'selected' : '' ?>>Coach</option>
        <option value="age_desc" <?= $sortBy === 'age_desc' ? 'selected' : '' ?>>Age (Oldest first)</option>
        <option value="age_asc" <?= $sortBy === 'age_asc' ? 'selected' : '' ?>>Age (Youngest first)</option>
    </select>
    <button class="btn" type="submit">Search & Sort</button>
    <a class="btn secondary" href="<?= BASE_URL ?>/admin/athletes.php">Clear</a>
</form> 
<div class="table-wrap"><table>
<thead><tr><th>ID</th><th>Athlete</th><th>Age</th><th>Sport</th><th>School</th><th>Coach</th><th>Status</th><th>Action</th></tr></thead>
<tbody>
<?php foreach($athletes as $a): ?><tr>
<td><a href="<?= BASE_URL ?>/athletes/view.php?id=<?= (int)$a['id'] ?>"><?= e($a['athlete_code']) ?></a></td>
<td><?= e(format_person_name($a['first_name'], $a['middle_name'], $a['last_name'], $a['suffix'])) ?></td>
<td><?= calculate_age($a['birthdate']) ?></td>
<td><?= e($a['sport_name']) ?></td>
<td><?= e($a['school_name'] ?? '—') ?></td><td><?= e(format_person_name($a['coach_first_name'], $a['coach_middle_name'], $a['coach_last_name'], $a['coach_suffix'])) ?></td>
<td><span class="badge <?= e($a['status']) ?>"><?= e(ucfirst($a['status'])) ?></span></td>
<td><div class="actions athlete-row-actions"><a class="btn secondary" href="<?= BASE_URL ?>/admin/athletes.php?edit=<?= (int)$a['id'] ?>">Edit</a><form method="post" data-confirm="Change this athlete's status?"><?= csrf_field() ?><input type="hidden" name="action" value="toggle_status"><input type="hidden" name="athlete_id" value="<?= (int)$a['id'] ?>"><button class="btn secondary" type="submit"><?= $a['status']==='active'?'Mark Inactive':'Mark Active' ?></button></form></div></td>
</tr><?php endforeach; ?>
<?php if(!$athletes): ?><tr><td colspan="8" class="empty">No athletes found.</td></tr><?php endif; ?>
</tbody></table></div>
</div>
<?php endif; ?>
<?php require __DIR__ . '/../includes/footer.php'; 
?>