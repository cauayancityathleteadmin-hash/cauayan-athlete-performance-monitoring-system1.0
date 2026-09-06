<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';

require_once __DIR__ . '/../includes/functions.php';
require_admin();

if($_SERVER['REQUEST_METHOD']==='POST'){
    verify_csrf();
    audit('DATABASE_BACKUP','system',null,'Database backup requested.');
    flash('info','Database backup generation will be added in the deployment phase. For now, use phpMyAdmin Export for a verified backup.');
    redirect('admin/backup_database.php');
}

$pageTitle='Database Backup';
require __DIR__.'/../includes/header.php';
?>
<div class="page-title"><h1>Database Backup</h1></div>
<div class="panel">
<h2>Backup Safety</h2>
<p>The Admin-only backup area is reserved for the deployment phase. During local development, use phpMyAdmin's Export function to create a verified SQL backup.</p>
<form method="post">
<?= csrf_field() ?>
<button class="btn" type="submit">Record Backup Request</button>
</form>
</div>
<?php require __DIR__.'/../includes/footer.php'; ?>
