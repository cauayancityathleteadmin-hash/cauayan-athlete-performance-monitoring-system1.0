<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/auth.php';

if (!current_user()) {
    redirect('auth/login.php');
}

if (is_admin()) {
    redirect('admin/dashboard.php');
}

redirect('coach/dashboard.php');
