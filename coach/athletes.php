<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';
require_coach();

$params = [];
$q = trim($_GET['q'] ?? ''); // Search query
$sortBy = $_GET['sort_by'] ?? 'name_asc'; // Default sort

$athleteSql = "SELECT a.id, a.athlete_code, a.birthdate, a.status,
                      a.first_name, a.middle_name, a.last_name, a.suffix,
                      s.sport_name
               FROM athletes a
               JOIN sports s ON s.id = a.sport_id
               WHERE a.coach_id = ?"; // Always filter by current coach
$params[] = get_coach_id_for_user((int)current_user_id());

if ($q !== '') {
    $athleteSql .= " AND (a.athlete_code LIKE ? OR
                        a.first_name LIKE ? OR
                        a.last_name LIKE ? OR
                        CONCAT_WS(' ', a.first_name, a.last_name) LIKE ? OR
                        CONCAT_WS(' ', a.first_name, a.middle_name, a.last_name) LIKE ? OR
                        s.sport_name LIKE ?)";
    $like = "%{$q}%";
    $params = array_merge($params, [$like, $like, $like, $like, $like, $like]);
}

switch ($sortBy) {
    case 'name_desc': $athleteSql .= " ORDER BY a.last_name DESC, a.first_name DESC"; break;
    case 'sport_asc': $athleteSql .= " ORDER BY s.sport_name ASC, a.last_name, a.first_name"; break;
    case 'registered_desc': $athleteSql .= " ORDER BY a.date_registered DESC, a.last_name, a.first_name"; break;
    case 'status_asc': $athleteSql .= " ORDER BY a.status ASC, a.last_name, a.first_name"; break;
    default: $athleteSql .= " ORDER BY a.last_name, a.first_name"; break; // name_asc
}

$athleteStmt = db()->prepare($athleteSql);
$athleteStmt->execute($params);
$athletes = $athleteStmt->fetchAll();

$pageTitle = 'My Athletes';
require __DIR__ . '/../includes/header.php';
?>
<div class="page-title">
    <h1>My Athletes</h1>
    <div class="actions">
        <a class="btn" href="<?= BASE_URL ?>/admin/athletes.php?add=1">Add Athlete</a>
        <a class="btn secondary" href="<?= BASE_URL ?>/admin/athletes.php?import=1">Import Athletes</a>
    </div>
</div>
<div class="panel">
<form class="search-bar" method="get">
    <input name="q" value="<?= e($q) ?>" placeholder="Search ID, name, or sport">
    <select name="sort_by">
        <option value="name_asc" <?= $sortBy === 'name_asc' ? 'selected' : '' ?>>Name (A-Z)</option>
        <option value="name_desc" <?= $sortBy === 'name_desc' ? 'selected' : '' ?>>Name (Z-A)</option>
        <option value="sport_asc" <?= $sortBy === 'sport_asc' ? 'selected' : '' ?>>Sport</option>
        <option value="registered_desc" <?= $sortBy === 'registered_desc' ? 'selected' : '' ?>>Date Registered (Newest)</option>
        <option value="status_asc" <?= $sortBy === 'status_asc' ? 'selected' : '' ?>>Status</option>
    </select>
    <button class="btn" type="submit">Search & Sort</button>
    <a class="btn secondary" href="<?= BASE_URL ?>/coach/athletes.php">Clear</a>
</form> 
<div class="table-wrap"><table>

<thead><tr><th>Athlete</th><th>Age</th><th>Sport</th><th>Status</th><th>Action</th></tr></thead>
<tbody>
<?php foreach ($athletes as $item): ?>
<tr><td><a href="<?= BASE_URL ?>/athletes/view.php?id=<?= (int)$item['id'] ?>"><?= e($item['athlete_code']) ?> — <?= e(format_person_name($item['first_name'], $item['middle_name'], $item['last_name'], $item['suffix'])) ?></a></td><td><?= calculate_age($item['birthdate']) ?></td><td><?= e($item['sport_name']) ?></td><td><span class="badge <?= e($item['status']) ?>"><?= e(ucfirst($item['status'])) ?></span></td><td><a class="btn secondary" href="<?= BASE_URL ?>/coach/assessments.php?athlete_id=<?= (int)$item['id'] ?>">Assess</a></td></tr>
<?php endforeach; ?>
<?php if (!$athletes): ?><tr><td colspan="5" class="empty">You have not been assigned any athletes yet.</td></tr><?php endif; ?>
</tbody></table></div>
</div>
<?php require __DIR__ . '/../includes/footer.php'; ?>