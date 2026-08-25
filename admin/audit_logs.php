<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';

require_once __DIR__ . '/../includes/functions.php';
require_admin();

$logs=db()->query(
    "SELECT al.*,COALESCE(u.username,u.email,'System') AS actor
     FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id
     ORDER BY al.created_at DESC LIMIT 200"
)->fetchAll();

$pageTitle='Audit Logs';
require __DIR__.'/../includes/header.php';
?>
<div class="page-title"><h1>Audit Logs</h1></div>
<div class="panel">
<p class="small">Admin-only activity history. Sensitive credentials and session tokens are not recorded.</p>
<table>
<thead><tr><th>Date</th><th>Actor</th><th>Action</th><th>Entity</th><th>Description</th><th>IP</th></tr></thead>
<tbody>
<?php foreach($logs as $log): ?>
<tr><td><?= e($log['created_at']) ?></td><td><?= e($log['actor']) ?></td><td><?= e($log['action']) ?></td><td><?= e(($log['entity_type']??'').' #'.($log['entity_id']??'')) ?></td><td><?= e($log['description']??'') ?></td><td><?= e($log['ip_address']??'') ?></td></tr>
<?php endforeach; ?>
<?php if(!$logs): ?><tr><td colspan="6">No audit records yet.</td></tr><?php endif; ?>
</tbody></table>
</div>
<?php require __DIR__.'/../includes/footer.php'; ?>
