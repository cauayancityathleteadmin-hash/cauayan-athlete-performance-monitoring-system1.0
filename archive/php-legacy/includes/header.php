<?php
declare(strict_types=1);
require_once __DIR__ . '/auth.php';

require_login();

$flash = get_flash();
$user = current_user();
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e($pageTitle ?? APP_NAME) ?> | <?= e(APP_NAME) ?></title>
    <link rel="stylesheet" href="<?= BASE_URL ?>/assets/css/style.css">
</head>
<body>
<header class="topbar">
    <div class="brand">
        <a href="<?= BASE_URL ?>/index.php"><img src="<?= BASE_URL ?>/cauayan%20logo.png" alt="Cauayan City logo"><span><?= e(APP_NAME) ?></span></a>
    </div>
    <div class="user-area">
        <span><?= e($user['display_name'] ?? $user['username'] ?? 'User') ?></span>
        <span class="role-badge"><?= e(ucfirst($user['role'])) ?></span>
        <a class="logout-link" href="<?= BASE_URL ?>/auth/logout.php">Logout</a>
    </div>
</header>

<div class="layout">
    <aside class="sidebar">
        <a href="<?= BASE_URL ?>/index.php">Dashboard</a>

        <?php if (is_admin()): ?>
            <div class="nav-heading">Administration</div>
            <a href="<?= BASE_URL ?>/analytics.php">Analytics</a>
            <a href="<?= BASE_URL ?>/admin/coaches.php">Coaches</a>
            <a href="<?= BASE_URL ?>/admin/athletes.php">Athletes</a>
            <a href="<?= BASE_URL ?>/admin/events.php">Sports Event Plans</a>
            <a href="<?= BASE_URL ?>/admin/sports.php">Sports & Events</a>
            <a href="<?= BASE_URL ?>/admin/metrics.php">Performance Metrics</a>
            <a href="<?= BASE_URL ?>/admin/audit_logs.php">Audit Logs</a>
            <a href="<?= BASE_URL ?>/admin/backup_database.php">Database Backup</a>
        <?php endif; ?>

        <?php if (is_coach()): ?>
            <div class="nav-heading">Coach</div>
            <a href="<?= BASE_URL ?>/coach/analytics.php">Analytics</a>
            <a href="<?= BASE_URL ?>/coach/athletes.php">My Athletes</a>
            <a href="<?= BASE_URL ?>/coach/events.php">Upcoming Events</a>
            <a href="<?= BASE_URL ?>/coach/assessments.php">Assessments</a>
            <a href="<?= BASE_URL ?>/coach/reports.php">Athlete Reports</a>
        <?php endif; ?>
    </aside>

    <main class="content">
        <?php if ($flash): ?>
            <div class="alert <?= e($flash['type']) ?>"><?= e($flash['message']) ?></div>
        <?php endif; ?>
