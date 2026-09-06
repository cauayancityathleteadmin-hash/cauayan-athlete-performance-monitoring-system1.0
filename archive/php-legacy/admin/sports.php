<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';

require_once __DIR__ . '/../includes/functions.php';
require_admin();

if($_SERVER['REQUEST_METHOD']==='POST'){
    verify_csrf();
    $action=$_POST['action']??'';

    if($action==='create_sport'){
        $name=trim($_POST['sport_name']??'');
        $desc=trim($_POST['description']??'');
        if($name===''){flash('danger','Sport name is required.');redirect('admin/sports.php');}
        try{
            $stmt=db()->prepare("INSERT INTO sports (sport_name,description) VALUES (?,?)");
            $stmt->execute([$name,$desc?:null]);
            $id=(int)db()->lastInsertId();
            audit('CREATE_SPORT','sport',$id,"Created sport {$name}.");
            flash('success','Sport created.');
        }catch(Throwable $e){flash('danger','Sport already exists or could not be created.');}
        redirect('admin/sports.php');
    }

    if($action==='create_event'){
        $sportId=(int)($_POST['sport_id']??0);
        $name=trim($_POST['event_name']??'');
        if(!$sportId||$name===''){flash('danger','Sport and event name are required.');redirect('admin/sports.php');}
        try{
            $stmt=db()->prepare("INSERT INTO events (sport_id,event_name,description) VALUES (?,?,?)");
            $stmt->execute([$sportId,$name,trim($_POST['event_description']??'')?:null]);
            $id=(int)db()->lastInsertId();
            audit('CREATE_EVENT','event',$id,"Created event {$name}.");
            flash('success','Event created.');
        }catch(Throwable $e){flash('danger','Event already exists for this sport.');}
        redirect('admin/sports.php');
    }
}

$sports=db()->query("SELECT * FROM sports ORDER BY sport_name")->fetchAll();
$events=db()->query("SELECT e.*,s.sport_name FROM events e JOIN sports s ON s.id=e.sport_id ORDER BY s.sport_name,e.event_name")->fetchAll();

$pageTitle='Sports & Events';
require __DIR__.'/../includes/header.php';
?>
<div class="page-title"><h1>Sports & Events</h1></div>
<div class="form-grid">
<div class="panel">
<h2>Add Sport</h2>
<form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="create_sport">
<div class="form-group"><label>Sport Name *</label><input name="sport_name" required></div>
<div class="form-group"><label>Description</label><textarea name="description"></textarea></div><br>
<button class="btn" type="submit">Add Sport</button>
</form>
</div>
<div class="panel">
<h2>Add Event / Discipline</h2>
<form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="create_event">
<div class="form-group"><label>Sport *</label><select name="sport_id" required><option value="">Select</option><?php foreach($sports as $s): ?><option value="<?= $s['id'] ?>"><?= e($s['sport_name']) ?></option><?php endforeach; ?></select></div>
<div class="form-group"><label>Event Name *</label><input name="event_name" required></div>
<div class="form-group"><label>Description</label><textarea name="event_description"></textarea></div><br>
<button class="btn" type="submit">Add Event</button>
</form>
</div>
</div>
<div class="panel"><h2>Sports</h2><table><thead><tr><th>Sport</th><th>Status</th></tr></thead><tbody><?php foreach($sports as $s): ?><tr><td><?= e($s['sport_name']) ?></td><td><span class="badge <?= e($s['status']) ?>"><?= e(ucfirst($s['status'])) ?></span></td></tr><?php endforeach; ?></tbody></table></div>
<div class="panel"><h2>Events</h2><table><thead><tr><th>Sport</th><th>Event</th><th>Status</th></tr></thead><tbody><?php foreach($events as $e): ?><tr><td><?= e($e['sport_name']) ?></td><td><?= e($e['event_name']) ?></td><td><span class="badge <?= e($e['status']) ?>"><?= e(ucfirst($e['status'])) ?></span></td></tr><?php endforeach; ?></tbody></table></div>
<?php require __DIR__.'/../includes/footer.php'; ?>
