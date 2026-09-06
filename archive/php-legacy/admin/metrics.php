<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';

require_once __DIR__ . '/../includes/functions.php';
require_admin();

if($_SERVER['REQUEST_METHOD']==='POST'){
    verify_csrf();
    $eventId=(int)($_POST['event_id']??0);
    $name=trim($_POST['metric_name']??'');
    $unit=trim($_POST['unit']??'');
    $dataType=$_POST['data_type']??'decimal';
    $direction=$_POST['better_direction']??'neutral';
    $decimalPlaces=(int)($_POST['decimal_places']??2);
    $required=isset($_POST['is_required'])?1:0;
    $min=trim((string)($_POST['minimum_value']??''));
    $max=trim((string)($_POST['maximum_value']??''));
    $min=$min===''?null:$min;
    $max=$max===''?null:$max;

    if(!$eventId||$name===''||!in_array($dataType,['decimal','integer','text'],true)||!in_array($direction,['higher','lower','neutral'],true)){
        flash('danger','Complete the metric fields correctly.');redirect('admin/metrics.php');
    }
    $boundsValid = $dataType === 'text'
        ? $min === null && $max === null
        : ($min === null || is_numeric($min)) && ($max === null || is_numeric($max));
    $integerBoundsValid = $dataType !== 'integer'
        || (($min === null || filter_var($min, FILTER_VALIDATE_INT) !== false)
            && ($max === null || filter_var($max, FILTER_VALIDATE_INT) !== false));
    if (!$boundsValid || !$integerBoundsValid || ($min !== null && $max !== null && (float)$min > (float)$max)) {
        flash('danger','Minimum and maximum values must match the data type and minimum cannot exceed maximum.');
        redirect('admin/metrics.php');
    }

    try{
        $stmt=db()->prepare(
            "INSERT INTO performance_metrics
            (event_id,metric_name,unit,data_type,better_direction,decimal_places,minimum_value,maximum_value,is_required)
            VALUES (?,?,?,?,?,?,?,?,?)"
        );
        $stmt->execute([$eventId,$name,$unit?:null,$dataType,$direction,max(0,min(6,$decimalPlaces)),$min,$max,$required]);
        $id=(int)db()->lastInsertId();
        audit('CREATE_METRIC','performance_metric',$id,"Created metric {$name}.");
        flash('success','Performance metric created.');
    }catch(Throwable $e){flash('danger','Metric already exists for this event or could not be created.');}
    redirect('admin/metrics.php');
}

$events=db()->query("SELECT e.id,e.event_name,s.sport_name FROM events e JOIN sports s ON s.id=e.sport_id WHERE e.status='active' ORDER BY s.sport_name,e.event_name")->fetchAll();
$metrics=db()->query(
    "SELECT pm.*,e.event_name,s.sport_name
     FROM performance_metrics pm
     JOIN events e ON e.id=pm.event_id
     JOIN sports s ON s.id=e.sport_id
     ORDER BY s.sport_name,e.event_name,pm.metric_name"
)->fetchAll();

$pageTitle='Performance Metrics';
require __DIR__.'/../includes/header.php';
?>
<div class="page-title"><h1>Performance Metrics</h1></div>
<div class="panel">
<h2>Add Performance Metric</h2>
<form method="post">
<?= csrf_field() ?>
<div class="form-grid">
<div class="form-group"><label>Event *</label><select name="event_id" required><option value="">Select event</option><?php foreach($events as $e): ?><option value="<?= $e['id'] ?>"><?= e($e['sport_name'].' — '.$e['event_name']) ?></option><?php endforeach; ?></select></div>
<div class="form-group"><label>Metric Name *</label><input name="metric_name" required></div>
<div class="form-group"><label>Unit</label><input name="unit" placeholder="seconds, meters, %, points"></div>
<div class="form-group"><label>Data Type</label><select name="data_type"><option value="decimal">Decimal</option><option value="integer">Integer</option><option value="text">Text</option></select></div>
<div class="form-group"><label>Better Result</label><select name="better_direction"><option value="neutral">Neutral / not scored</option><option value="higher">Higher is better</option><option value="lower">Lower is better</option></select></div>
<div class="form-group"><label>Decimal Places</label><input type="number" name="decimal_places" min="0" max="6" value="2"></div>
<div class="form-group"><label>Minimum Value</label><input type="number" step="any" name="minimum_value"></div>
<div class="form-group"><label>Maximum Value</label><input type="number" step="any" name="maximum_value"></div>
<div class="form-group"><label><input type="checkbox" name="is_required"> Required metric</label></div>
</div><br>
<button class="btn" type="submit">Add Metric</button>
</form>
</div>
<div class="panel">
<h2>Configured Metrics</h2>
<table><thead><tr><th>Sport / Event</th><th>Metric</th><th>Unit</th><th>Data Type</th><th>Better</th><th>Required</th></tr></thead><tbody>
<?php foreach($metrics as $m): ?><tr><td><?= e($m['sport_name']) ?> / <?= e($m['event_name']) ?></td><td><?= e($m['metric_name']) ?></td><td><?= e($m['unit']??'—') ?></td><td><?= e($m['data_type']) ?></td><td><?= e($m['better_direction']) ?></td><td><?= $m['is_required']?'Yes':'No' ?></td></tr><?php endforeach; ?>
</tbody></table>
</div>
<?php require __DIR__.'/../includes/footer.php'; ?>
