<?php
declare(strict_types=1);
require_once __DIR__ . '/functions.php';

function require_login(): void
{
    if (!current_user()) {
        flash('warning', 'Please log in first.');
        redirect('auth/login.php');
    }
}

function require_admin(): void
{
    require_login();

    if (!is_admin()) {
        http_response_code(403);
        exit('Access denied.');
    }
}

function require_coach(): void
{
    require_login();

    if (!is_coach()) {
        http_response_code(403);
        exit('Access denied. This page is for coaches only.');
    }

    if (!get_coach_id_for_user((int)current_user_id())) {
        unset($_SESSION['user']);
        flash('warning', 'This coach account no longer has a profile. Please log in with an approved coach account.');
        redirect('auth/login.php');
    }
}

function require_coach_or_admin(): void
{
    require_login();

    if (is_coach() && !get_coach_id_for_user((int)current_user_id())) {
        unset($_SESSION['user']);
        flash('warning', 'This coach account no longer has a profile. Please log in with an approved coach account.');
        redirect('auth/login.php');
    }

    if (!is_admin() && !is_coach()) {
        http_response_code(403);
        exit('Access denied.');
    }
}
