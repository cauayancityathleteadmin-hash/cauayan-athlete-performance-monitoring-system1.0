<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/functions.php';

if (current_user()) {
    redirect('index.php');
}

$flash = get_flash();
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Login | <?= e(APP_NAME) ?></title>
    <link rel="stylesheet" href="<?= BASE_URL ?>/assets/css/style.css">
</head>
<body class="login-page">
<div class="login-box">
    <img class="auth-logo" src="<?= BASE_URL ?>/cauayan%20logo.png" alt="Cauayan City logo">
    <h1><?= e(APP_NAME) ?></h1>
    <p class="small">Cauayan City, Isabela</p>

    <?php if ($flash): ?>
        <div class="alert <?= e($flash['type']) ?>"><?= e($flash['message']) ?></div>
    <?php endif; ?>

    <form action="<?= BASE_URL ?>/auth/login_process.php" method="post">
        <?= csrf_field() ?>

        <div class="form-group">
            <label for="login_identifier">Email or Coach ID</label>
            <input id="login_identifier" name="login_identifier" required autofocus>
        </div>

        <div class="form-group">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" required>
        </div>
        <br>

        <button class="btn" type="submit">Log In</button>
    </form>
    <p class="small login-register">Are you a coach? <br><a href="<?= BASE_URL ?>/auth/coach_register.php">Register.</a></p>
</div>
</body>
</html>
