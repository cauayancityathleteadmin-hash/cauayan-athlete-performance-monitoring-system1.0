<?php
declare(strict_types=1);
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';
require_coach_or_admin();

$athleteId=(int)($_GET['athlete_id']??0);
if(!$athleteId){
    $params = [];
    $athleteSql = "SELECT a.id, a.athlete_code, a.status,
                          a.first_name, a.middle_name, a.last_name, a.suffix,
                             s.sport_name, c.coach_code
                   FROM athletes a
                   JOIN sports s ON s.id = a.sport_id
                   JOIN coaches c ON c.id = a.coach_id";
    if (is_coach()) {
        $athleteSql .= ' WHERE a.coach_id = ?';
        $params[] = get_coach_id_for_user((int)current_user_id());
    }
    $athleteSql .= ' ORDER BY a.last_name, a.first_name';
    $athleteStmt = db()->prepare($athleteSql);
    $athleteStmt->execute($params);
    $athletes = $athleteStmt->fetchAll();

    $pageTitle = 'Assessments';
    require __DIR__ . '/../includes/header.php';
    ?>
    <div class="page-title"><h1>Assessments</h1></div>
    <div class="panel">
    <p class="small"><?= is_coach() ? 'Select one of your assigned athletes to record an assessment.' : 'Select an athlete to record an assessment.' ?></p>
    <div class="table-wrap"><table>
    <thead><tr><th>Athlete</th><th>Sport</th><th>Coach</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>
    <?php foreach ($athletes as $item): ?>
    <tr><td><?= e($item['athlete_code']) ?> — <?= e(format_person_name($item['first_name'], $item['middle_name'], $item['last_name'], $item['suffix'])) ?></td><td><?= e($item['sport_name']) ?></td><td><?= e($item['coach_code']) ?></td><td><span class="badge <?= e($item['status']) ?>"><?= e(ucfirst($item['status'])) ?></span></td><td><a class="btn secondary" href="<?= BASE_URL ?>/coach/assessments.php?athlete_id=<?= (int)$item['id'] ?>">Assess</a></td></tr>
    <?php endforeach; ?>
    <?php if (!$athletes): ?><tr><td colspan="5" class="empty">No athletes available for assessment.</td></tr><?php endif; ?>
    </tbody></table></div>
    </div>
    <?php require __DIR__ . '/../includes/footer.php';
    exit;
}

if(!coach_can_manage_athlete($athleteId,current_user_id())){
    http_response_code(403);
    exit('You can only record assessments for athletes assigned to you.');
}

$athStmt=db()->prepare(
        "SELECT a.id,a.athlete_code,a.sport_id,
            a.first_name,a.middle_name,a.last_name,a.suffix,
            s.sport_name
         FROM athletes a JOIN sports s ON s.id=a.sport_id WHERE a.id=?"
);
$athStmt->execute([$athleteId]);$athlete=$athStmt->fetch();
if(!$athlete) exit('Athlete not found.');

$metricStmt=db()->prepare(
    "SELECT id,metric_name,unit,data_type,better_direction,decimal_places,is_required,minimum_value,maximum_value
    FROM performance_metrics pm
    JOIN events e ON e.id=pm.event_id
    WHERE e.sport_id=? AND pm.status='active' ORDER BY pm.metric_name, pm.id"
);
$metricStmt->execute([(int)$athlete['sport_id']]);$metrics=$metricStmt->fetchAll();

if($_SERVER['REQUEST_METHOD']==='POST'){
    verify_csrf();

    $date=$_POST['assessment_date']??'';
    $type=trim($_POST['assessment_type']??'Regular Assessment');
    $remarks=trim($_POST['remarks']??'');

    $dateObject = DateTime::createFromFormat('!Y-m-d', $date);
    $dateValid = $dateObject !== false && $dateObject->format('Y-m-d') === $date && $date <= date('Y-m-d');
    if(!$dateValid){ flash('danger','Enter a valid assessment date that is not in the future.'); redirect('coach/assessments.php?athlete_id='.$athleteId); }

    $pdo=db();
    try{
        $pdo->beginTransaction();
        $stmt=$pdo->prepare(
            "INSERT INTO assessments (athlete_id,recorded_by,assessment_date,assessment_type,remarks)
             VALUES (?,?,?,?,?)"
        );
        $stmt->execute([$athleteId,current_user_id(),$date,$type,$remarks?:null]);
        $assessmentId=(int)$pdo->lastInsertId();

        $resultStmt=$pdo->prepare(
            "INSERT INTO assessment_results
             (assessment_id,metric_id,value_decimal,value_text,notes)
             VALUES (?,?,?,?,?)"
        );

        foreach($metrics as $metric){
            $raw=$_POST['metric'][$metric['id']]??'';
            $note=trim($_POST['note'][$metric['id']]??'');
            if($raw===''){
                if((int)$metric['is_required']===1) throw new RuntimeException("Required metric missing: ".$metric['metric_name']);
                continue;
            }

            if($metric['data_type']==='text'){
                $resultStmt->execute([$assessmentId,(int)$metric['id'],null,$raw,$note?:null]);
            }else{
                if(!is_numeric($raw) || ($metric['data_type']==='integer' && filter_var($raw, FILTER_VALIDATE_INT) === false)) {
                    throw new RuntimeException("Invalid value for ".$metric['metric_name']);
                }
                $value=(float)$raw;
                if($metric['minimum_value']!==null && $value<(float)$metric['minimum_value']) throw new RuntimeException("Value is below the minimum for ".$metric['metric_name']);
                if($metric['maximum_value']!==null && $value>(float)$metric['maximum_value']) throw new RuntimeException("Value is above the maximum for ".$metric['metric_name']);
                $resultStmt->execute([$assessmentId,(int)$metric['id'],$value,null,$note?:null]);
            }
        }

        $pdo->commit();
        audit('CREATE_ASSESSMENT','assessment',$assessmentId,"Recorded assessment for {$athlete['athlete_code']}.");
        flash('success','Assessment recorded successfully.');
    }catch(Throwable $e){
        if($pdo->inTransaction())$pdo->rollBack();
        flash('danger',$e->getMessage() ?: 'Could not save assessment.');
    }
    redirect('coach/assessments.php?athlete_id='.$athleteId);
}

$pageTitle='Record Assessment';
require __DIR__.'/../includes/header.php';
?>
<div class="page-title"><h1>Record Performance Assessment</h1></div>
<div class="panel">
<h2><?= e($athlete['athlete_code']) ?> — <?= e(format_person_name($athlete['first_name'], $athlete['middle_name'], $athlete['last_name'], $athlete['suffix'])) ?></h2>
<p class="small">Sport: <?= e($athlete['sport_name']) ?></p>
<form method="post">
<?= csrf_field() ?>
<div class="form-grid">
<div class="form-group"><label>Assessment Date *</label><input type="date" name="assessment_date" value="<?= e(date('Y-m-d')) ?>" required></div>
<div class="form-group"><label>Assessment Type</label><input name="assessment_type" value="Regular Assessment"></div>
<div class="form-group full"><label>Remarks</label><textarea name="remarks"></textarea></div>
</div>

<?php if(!$metrics): ?>
<div class="alert warning">No performance metrics have been configured for this event yet. Ask the Admin to configure them.</div>
<?php else: ?>
<h3>Performance Metrics</h3>
<div class="form-grid">
<?php foreach($metrics as $metric): ?>
<div class="form-group">
<label><?= e($metric['metric_name']) ?> <?= (int)$metric['is_required']?'*':'' ?></label>
<input name="metric[<?= (int)$metric['id'] ?>]" <?= (int)$metric['is_required']?'required':'' ?> <?= $metric['data_type']==='text'?'type="text"':'type="number" step="'.($metric['data_type']==='integer'?'1':'any').'"' ?>>
<span class="small"><?= e($metric['unit']??'') ?> · <?= e($metric['better_direction']) ?> is better</span>
<input name="note[<?= (int)$metric['id'] ?>]" placeholder="Metric note (optional)">
</div>
<?php endforeach; ?>
</div>
<br><button class="btn" type="submit">Save Assessment</button>
<?php endif; ?>
</form>
</div>
<?php require __DIR__.'/../includes/footer.php'; ?>
