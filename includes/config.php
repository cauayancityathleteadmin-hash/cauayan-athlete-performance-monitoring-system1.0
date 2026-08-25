<?php
declare(strict_types=1);

define('APP_NAME', 'Cauayan City Athletes Performance Monitoring System');

$documentRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
$applicationRoot = realpath(__DIR__ . '/..');
$baseUrl = '';
if ($documentRoot !== false && $applicationRoot !== false) {
    $documentRoot = str_replace('\\', '/', rtrim($documentRoot, '/\\'));
    $applicationRoot = str_replace('\\', '/', rtrim($applicationRoot, '/\\'));
    $rootPrefix = strtolower($documentRoot);
    $normalizedApplicationRoot = strtolower($applicationRoot);
    if ($normalizedApplicationRoot === $rootPrefix || str_starts_with($normalizedApplicationRoot, $rootPrefix . '/')) {
        $relativeRoot = trim(substr($applicationRoot, strlen($documentRoot)), '/');
        $baseUrl = $relativeRoot === '' ? '' : '/' . $relativeRoot;
    }
}
define('BASE_URL', $baseUrl);

define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'if0_42742694_atheletes_db');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_SOCKET', '');

// On Linux servers with a local MariaDB socket, uncomment and set a valid socket path:
// define('DB_SOCKET', '/var/run/mysqld/mysqld.sock');

date_default_timezone_set('Asia/Manila');

ini_set('session.use_strict_mode', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
