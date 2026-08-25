<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/functions.php';

if (current_user()) {
    redirect('index.php');
}

$error = null;
$show_form = true;
$show_confirmation = false;
$form_data = $_POST;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    $step = $form_data['step'] ?? 'confirm';

    if ($step === 'edit') {
        $show_form = true;
        $show_confirmation = false;
    } else {
        $first = trim($form_data['first_name'] ?? '');
        $middle = trim($form_data['middle_name'] ?? '');
        $last = trim($form_data['last_name'] ?? '');
        $email = trim($form_data['email'] ?? '');
        $password = $form_data['password'] ?? '';
        $confirm = $form_data['confirm_password'] ?? '';
        $schoolName = trim($form_data['school_name'] ?? '');
        $birthdate = $form_data['birthdate'] ?? '';
        $sports = $form_data['sports'] ?? [];
        $filteredSports = array_values(array_filter(array_map('trim', $sports)));

        if ($first === '' || $last === '') {
            $error = 'First name and last name are required.';
        } elseif ($schoolName === '') {
            $error = 'School is required.';
        } elseif ($birthdate === '' || !($birthObject = DateTime::createFromFormat('!Y-m-d', $birthdate)) || $birthObject->format('Y-m-d') !== $birthdate || $birthdate > date('Y-m-d')) {
            $error = 'Please enter a valid birthdate.';
        } elseif (calculate_age($birthdate) < 18) {
            $error = 'Coach must be at least 18 years old.';
        } elseif (empty($filteredSports)) {
            $error = 'At least one sport is required.';
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $error = 'Enter a valid email address.';
        } elseif ($step !== 'submit' && strlen($password) < 10) { // Don't re-check password length on final submit
            $error = 'Password must be at least 10 characters.';
        } elseif ($step !== 'submit' && $password !== $confirm) {
            $error = 'Passwords do not match.';
        }

        if ($error) {
            $show_form = true;
            $show_confirmation = false;
        } else {
            if ($step === 'confirm') {
                $show_form = false;
                $show_confirmation = true;
            } elseif ($step === 'submit') {
                $pdo = db();
                try {
                    $pdo->beginTransaction();

                    $stmt = $pdo->prepare('INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, "coach", "pending")');
                    $stmt->execute([$email, password_hash($password, PASSWORD_DEFAULT)]);
                    $userId = (int)$pdo->lastInsertId();

                    $schoolId = get_or_create_id($pdo, 'schools', 'school_name', $schoolName);

                    $stmt = $pdo->prepare(
                        'INSERT INTO coaches
                         (user_id, coach_code, first_name, middle_name, last_name, birthdate, email, school_id, status, date_registered)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, "inactive", CURDATE())'
                    );
                    $stmt->execute([$userId, 'TEMP', $first, $middle ?: null, $last, $birthdate, $email, $schoolId]);
                    $coachId = (int)$pdo->lastInsertId();
                    $coachCode = generate_code('COA', $coachId);

                    $pdo->prepare('UPDATE coaches SET coach_code = ? WHERE id = ?')->execute([$coachCode, $coachId]);
                    $pdo->prepare('UPDATE users SET username = ? WHERE id = ?')->execute([$coachCode, $userId]);

                    $coachSportStmt = $pdo->prepare('INSERT INTO coach_sports (coach_id, sport_id) VALUES (?, ?)');

                    foreach ($filteredSports as $sportName) {
                        $sportId = get_or_create_id($pdo, 'sports', 'sport_name', $sportName);
                        $coachSportStmt->execute([$coachId, $sportId]);
                    }

                    $pdo->commit();

                    audit('COACH_REGISTRATION', 'coach', $coachId, "Coach registration submitted: {$coachCode}.");
                    flash('success', 'Registration submitted. An administrator must approve your account before you can log in.');
                    redirect('auth/login.php');
                } catch (Throwable $exception) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    $error = $exception instanceof RuntimeException ? $exception->getMessage() : 'Registration could not be completed. That email may already be registered.';
                    $show_form = true;
                    $show_confirmation = false;
                }
            }
        }
    }
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Coach Registration | <?= e(APP_NAME) ?></title>
<link rel="stylesheet" href="<?= BASE_URL ?>/assets/css/style.css">
</head>
<body class="login-page registration-page">
<div class="login-box registration-box">
    <img class="auth-logo" src="<?= BASE_URL ?>/cauayan%20logo.png" alt="Cauayan City logo">
    <?php if ($show_form): ?>
        <h1>Coach Registration</h1>
        <p class="small">Submit your details for administrator approval.</p>
        <?php if ($error): ?><div class="alert danger"><?= e($error) ?></div><?php endif; ?>
        <form method="post">
            <?= csrf_field() ?>
            <input type="hidden" name="step" value="confirm">
            <div class="form-grid registration-form-grid">
            <div class="form-group"><label>First Name *</label><input name="first_name" value="<?= e($form_data['first_name'] ?? '') ?>" required></div>
            <div class="form-group"><label>Middle Name</label><input name="middle_name" value="<?= e($form_data['middle_name'] ?? '') ?>"></div>
            <div class="form-group"><label>Last Name *</label><input name="last_name" value="<?= e($form_data['last_name'] ?? '') ?>" required></div>
            <div class="form-group"><label>School *</label><input name="school_name" value="<?= e($form_data['school_name'] ?? '') ?>" required></div>
            <div class="form-group"><label>Birthdate *</label><input type="date" name="birthdate" max="<?= date('Y-m-d') ?>" value="<?= e($form_data['birthdate'] ?? '') ?>" required></div>
            <div class="form-group">
                <label>Sports Coached *</label>
                <div id="sports-inputs">
                    <?php
                    $posted_sports = $form_data['sports'] ?? [''];
                    if (empty($posted_sports)) $posted_sports[] = '';
                    foreach ($posted_sports as $i => $sport): // This is the correct block for coach_register.php
                        $sportValue = trim($sport);
                    ?>
                    <div class="sport-input-group">
                        <input name="sports[]" value="<?= e($sportValue) ?>" placeholder="<?= $i === 0 ? 'e.g., Basketball' : 'Another sport' ?>" <?= $i === 0 ? 'required' : '' ?>>
                        <?php if ($i > 0): ?>
                        <button type="button" class="btn-remove-sport btn secondary" style="padding: 0.25rem 0.75rem; font-size: 0.85rem;">Remove</button>
                        <?php endif; ?>
                    </div> 
                    <?php endforeach; ?>
                </div>
                <button type="button" id="add-sport-btn" class="btn-add-more">+ Add another sport</button>
            </div>
            <div class="form-group"><label>Email *</label><input type="email" name="email" value="<?= e($form_data['email'] ?? '') ?>" required></div>
            <div class="form-group"><label>Password *</label><input type="password" name="password" minlength="10" required></div>
            <div class="form-group"><label>Confirm Password *</label><input type="password" name="confirm_password" minlength="10" required></div>
            </div>
            <button class="btn" type="submit">Review & Submit</button>
        </form>

    <?php elseif ($show_confirmation): ?>
        <h1>Review Your Information</h1>
        <p class="small">Please double-check your details before final submission.</p>

        <dl class="confirmation-summary">
            <dt>Full Name</dt><dd><?= e(trim(($form_data['first_name'] ?? '') . ' ' . ($form_data['middle_name'] ?? '') . ' ' . ($form_data['last_name'] ?? ''))) ?></dd>
            <dt>School</dt><dd><?= e($form_data['school_name'] ?? '') ?></dd>
            <dt>Birthdate</dt><dd><?= e($form_data['birthdate'] ?? '') ?> (Age: <?= calculate_age($form_data['birthdate'] ?? 'now') ?>)</dd>
            <dt>Email</dt><dd><?= e($form_data['email'] ?? '') ?></dd>
            <dt>Sports</dt>
            <dd>
                <ul>
                <?php foreach (array_filter(array_map('trim', $form_data['sports'] ?? [])) as $sport): ?>
                    <li><?= e($sport) ?></li>
                <?php endforeach; ?>
                </ul>
            </dd>
        </dl>

        <form method="post">
            <?= csrf_field() ?>
            <input type="hidden" name="step" value="submit">
            <input type="hidden" name="first_name" value="<?= e($form_data['first_name'] ?? '') ?>">
            <input type="hidden" name="middle_name" value="<?= e($form_data['middle_name'] ?? '') ?>">
            <input type="hidden" name="last_name" value="<?= e($form_data['last_name'] ?? '') ?>">
            <input type="hidden" name="school_name" value="<?= e($form_data['school_name'] ?? '') ?>">
            <input type="hidden" name="birthdate" value="<?= e($form_data['birthdate'] ?? '') ?>">
            <input type="hidden" name="email" value="<?= e($form_data['email'] ?? '') ?>">
            <input type="hidden" name="password" value="<?= e($form_data['password'] ?? '') ?>">
            <?php foreach ($form_data['sports'] ?? [] as $sport): ?>
            <input type="hidden" name="sports[]" value="<?= e($sport) ?>">
            <?php endforeach; ?>
            <div class="actions">
                <button class="btn" type="submit">Confirm & Submit</button>
                <button class="btn secondary" type="submit" name="step" value="edit">Edit Details</button>
            </div>
        </form>
    <?php endif; ?>
    <p class="small login-register"><a href="<?= BASE_URL ?>/auth/login.php">Back to login</a></p>
</div>
<script>
document.addEventListener('DOMContentLoaded', function() {
    const sportsInputsContainer = document.getElementById('sports-inputs');
    if (!sportsInputsContainer) return;

    const addButton = document.getElementById('add-sport-btn');

    addButton.addEventListener('click', function() {
        const newGroup = document.createElement('div');
        newGroup.className = 'sport-input-group';
        newGroup.innerHTML = `
            <input name="sports[]" placeholder="Another sport">
                <button type="button" class="btn-remove-sport btn secondary">Remove</button>
        `;
        sportsInputsContainer.appendChild(newGroup);
    });

    sportsInputsContainer.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('btn-remove-sport')) {
            e.target.closest('.sport-input-group').remove();
        }
    });
});
</script>
</body>
</html>
