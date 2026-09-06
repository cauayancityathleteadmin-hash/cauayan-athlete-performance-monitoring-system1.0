<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/functions.php';

require_post();
verify_csrf();

$identifier = trim($_POST['login_identifier'] ?? '');
$password = $_POST['password'] ?? '';

if ($identifier === '' || $password === '') {
    flash('danger', 'Please enter your login details.');
    redirect('auth/login.php');
}

$stmt = db()->prepare(
    'SELECT u.*, c.id AS coach_id, c.coach_code,
            CONCAT_WS(" ", c.first_name, c.middle_name, c.last_name, c.suffix) AS coach_name
     FROM users u
     LEFT JOIN coaches c ON c.user_id = u.id
     WHERE (u.username = :username OR u.email = :email OR c.coach_code = :coach_code)
     LIMIT 1'
);
$stmt->execute([
    'username' => $identifier,
    'email' => $identifier,
    'coach_code' => $identifier,
]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    audit('LOGIN_FAILED', 'user', $user ? (int)$user['id'] : null, 'Failed login attempt.');
    flash('danger', 'Invalid login credentials.');
    redirect('auth/login.php');
}

if ($user['status'] !== 'active') {
    $message = match ($user['status']) {
        'pending' => 'Your coach registration is waiting for admin approval.',
        'rejected' => 'Your coach registration was rejected. Please contact the administrator.',
        default => 'This account is inactive.',
    };
    flash('warning', $message);
    redirect('auth/login.php');
}

session_regenerate_id(true);

$_SESSION['user'] = [
    'id' => (int)$user['id'],
    'username' => $user['username'],
    'email' => $user['email'],
    'role' => $user['role'],
    'coach_id' => $user['coach_id'] ? (int)$user['coach_id'] : null,
    'coach_code' => $user['coach_code'],
    'display_name' => $user['coach_name'] ?: ($user['username'] ?: $user['email']),
];

db()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([(int)$user['id']]);

audit('LOGIN_SUCCESS', 'user', (int)$user['id'], 'Successful login.');

redirect('index.php');
