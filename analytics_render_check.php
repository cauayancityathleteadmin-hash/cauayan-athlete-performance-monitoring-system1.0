<?php
require_once __DIR__ . '/includes/functions.php';
$_SERVER['REQUEST_METHOD'] = 'GET';
$checks = [
    ['admin', 1, []],
    ['coach', 34, []],
    ['coach', 34, ['sport_id' => '1']],
];
foreach ($checks as [$role, $userId, $query]) {
    $_SESSION['user'] = ['id' => $userId, 'username' => $role, 'email' => $role . '@example.test', 'role' => $role, 'display_name' => ucfirst($role)];
    $_GET = $query;
    ob_start();
    try {
        include __DIR__ . '/analytics.php';
        $output = ob_get_clean();
        foreach (['Assessment Activity', 'Assessments by Sport', 'Assessments by Event', 'Athlete Status', 'Average Metric Values'] as $marker) {
            if (strpos($output, $marker) === false) {
                throw new RuntimeException("Missing graph: {$marker}");
            }
        }
        echo "OK {$role} " . http_build_query($query) . ' ' . strlen($output) . " bytes\n";
    } catch (Throwable $error) {
        ob_end_clean();
        echo "FAIL {$role}: {$error->getMessage()}\n";
        exit(1);
    }
}
