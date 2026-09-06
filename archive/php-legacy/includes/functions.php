<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

function e(?string $value): string
{
    return htmlspecialchars($value ?? '', ENT_QUOTES, 'UTF-8');
}

function redirect(string $path): never
{
    header('Location: ' . BASE_URL . '/' . ltrim($path, '/'));
    exit;
}

function flash(string $type, string $message): void
{
    $_SESSION['flash'] = ['type' => $type, 'message' => $message];
}

function get_flash(): ?array
{
    $flash = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    return $flash;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf_token" value="' . e(csrf_token()) . '">';
}

function verify_csrf(): void
{
    $token = $_POST['csrf_token'] ?? '';
    if (!hash_equals($_SESSION['csrf_token'] ?? '', $token)) {
        http_response_code(419);
        exit('Invalid security token. Please go back and try again.');
    }
}

function current_user(): ?array
{
    return $_SESSION['user'] ?? null;
}

function current_user_id(): ?int
{
    return isset($_SESSION['user']['id']) ? (int) $_SESSION['user']['id'] : null;
}

function is_admin(): bool
{
    return ($_SESSION['user']['role'] ?? '') === 'admin';
}

function is_coach(): bool
{
    return ($_SESSION['user']['role'] ?? '') === 'coach';
}

function generate_code(string $prefix, int $id): string
{
    return $prefix . '-' . str_pad((string)$id, 6, '0', STR_PAD_LEFT);
}

function calculate_age(string $birthdate): int
{
    $birth = new DateTime($birthdate);
    $today = new DateTime('today');
    return $birth->diff($today)->y;
}

function format_date(?string $date, string $fallback = '—'): string
{
    if (!$date) return $fallback;
    $value = DateTime::createFromFormat('Y-m-d', substr($date, 0, 10));
    return $value ? $value->format('M j, Y') : $date;
}

function format_time(?string $time, string $fallback = '—'): string
{
    if (!$time) return $fallback;
    $value = DateTime::createFromFormat('H:i:s', substr($time, 0, 8)) ?: DateTime::createFromFormat('H:i', substr($time, 0, 5));
    return $value ? $value->format('g:i A') : $time;
}

function format_person_name(?string $first, ?string $middle, ?string $last, ?string $suffix = null, bool $firstNameFirst = false): string
{
    $firstPart = trim(implode(' ', array_filter([$first, $middle])));
    $lastPart = trim(implode(' ', array_filter([$last, $suffix])));
    if ($firstNameFirst) return trim(implode(' ', array_filter([$firstPart, $lastPart])));
    return $lastPart === '' ? $firstPart : ($firstPart === '' ? $lastPart : $lastPart . ', ' . $firstPart);
}

function audit(
    string $action,
    ?string $entityType = null,
    ?int $entityId = null,
    ?string $description = null
): void {
    $stmt = db()->prepare(
        'INSERT INTO audit_logs
         (user_id, action, entity_type, entity_id, description, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    $stmt->execute([
        current_user_id(),
        $action,
        $entityType,
        $entityId,
        $description,
        $_SERVER['REMOTE_ADDR'] ?? null,
        substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 500),
    ]);
}

function mail_transport_ready(): bool
{
    $sendmailPath = (string)ini_get('sendmail_path');
    $sendmailConfig = 'C:\\xampp\\sendmail\\sendmail.ini';
    $sendmailContents = is_file($sendmailConfig) ? file_get_contents($sendmailConfig) : false;
    $hasSmtpPassword = is_string($sendmailContents)
           && preg_match('/^auth_password[ \t]*=[ \t]*([^\r\n]+)\r?$/m', $sendmailContents) === 1;
    return $sendmailPath !== '' && is_file('C:\\xampp\\sendmail\\sendmail.exe')
        && MAIL_FROM !== 'noreply@localhost' && $hasSmtpPassword;
}

function send_coach_credentials(string $email, string $coachName, string $coachCode, string $password): ?bool
{
    if (!mail_transport_ready()) {
        return null;
    }

    $subject = APP_NAME . ' coach account';
    $message = "Hello {$coachName},\n\n"
        . "Your coach account has been created.\n\n"
        . "Login using your email or your Coach ID as the username.\n\n"
        . "Login email: {$email}\n"
        . "Coach ID / Username: {$coachCode}\n"
        . "Temporary password: {$password}\n\n"
        . "Please change this password after your first login.\n"
        . APP_NAME;
    $headers = [
        'From: ' . MAIL_FROM_NAME . ' <' . MAIL_FROM . '>',
        'Content-Type: text/plain; charset=UTF-8',
    ];

    return mail($email, $subject, $message, implode("\r\n", $headers));
}

function send_coach_status_email(string $email, string $coachName, string $coachCode, string $status, ?string $reason = null): ?bool
{
    if (!mail_transport_ready()) {
        return null;
    }

    $approved = $status === 'active';
    $subject = APP_NAME . ($approved ? ' registration approved' : ' registration rejected');
    $message = "Hello {$coachName},\n\n";
    if ($approved) {
        $message .= "Your coach registration has been approved.\n\n"
            . "Coach ID: {$coachCode}\n"
            . "Login email: {$email}\n\n"
            . "You can now log in using the password you created during registration.\n";
    } else {
        $message .= "Your coach registration was not approved at this time.\n\n";
        if ($reason) {
            $message .= "Reason: {$reason}\n\n";
        }
        $message .= "Please contact the administrator if you need more information.\n";
    }
    $message .= "\n" . APP_NAME;
    $headers = [
        'From: ' . MAIL_FROM_NAME . ' <' . MAIL_FROM . '>',
        'Content-Type: text/plain; charset=UTF-8',
    ];

    return mail($email, $subject, $message, implode("\r\n", $headers));
}

/**
 * Finds an entity by name, or creates it if it doesn't exist.
 *
 * @param PDO $pdo The database connection.
 * @param string $tableName The name of the table (e.g., 'schools').
 * @param string $columnName The name of the column to search (e.g., 'school_name').
 * @param string $value The value to find or create.
 * @return int The ID of the found or created entity.
 */
function get_or_create_id(PDO $pdo, string $tableName, string $columnName, string $value): int
{
    // Whitelist to prevent SQL injection on table/column names
    $allowedTables = [
        'schools' => 'school_name',
        'sports' => 'sport_name',
    ];
    if (!isset($allowedTables[$tableName]) || $allowedTables[$tableName] !== $columnName) {
        throw new InvalidArgumentException("Invalid table or column name for get_or_create_id.");
    }

    $stmt = $pdo->prepare("SELECT id FROM `{$tableName}` WHERE LOWER(`{$columnName}`) = LOWER(?) LIMIT 1");
    $stmt->execute([$value]);
    $id = $stmt->fetchColumn();

    if ($id === false) {
        $stmt = $pdo->prepare("INSERT INTO `{$tableName}` (`{$columnName}`) VALUES (?)");
        $stmt->execute([$value]);
        $id = $pdo->lastInsertId();
    }

    return (int)$id;
}

/**
 * Finds an event by name for a given sport, or creates it if it doesn't exist.
 */
function get_or_create_event_id(PDO $pdo, int $sportId, string $eventName): int
{
    $stmt = $pdo->prepare('SELECT id FROM events WHERE sport_id = ? AND LOWER(event_name) = LOWER(?) LIMIT 1');
    $stmt->execute([$sportId, $eventName]);
    $eventId = $stmt->fetchColumn();

    if ($eventId === false) {
        $stmt = $pdo->prepare('INSERT INTO events (sport_id, event_name) VALUES (?, ?)');
        $stmt->execute([$sportId, $eventName]);
        $eventId = $pdo->lastInsertId();
    }

    return (int)$eventId;
}

function athlete_import_headers(): array
{
    return [
        'first_name', 'middle_name', 'last_name', 'suffix', 'birthdate', 'gender',
        'contact_number', 'email', 'address', 'school_name', 'sport_name',
        'coach_identifier',
    ];
}

function read_athlete_import_file(string $path, string $extension): array
{
    $extension = strtolower($extension);
    if ($extension === 'csv') {
        $handle = fopen($path, 'r');
        if ($handle === false) {
            throw new RuntimeException('Could not open the uploaded file.');
        }

        $rows = [];
        while (($row = fgetcsv($handle)) !== false) {
            if (count(array_filter($row, static fn ($value): bool => trim((string)$value) !== '')) > 0) {
                $rows[] = array_map(static fn ($value): string => trim((string)$value), $row);
            }
        }
        fclose($handle);
        return $rows;
    }

    if ($extension !== 'xlsx' || !class_exists('ZipArchive')) {
        throw new RuntimeException('Upload a CSV file or an XLSX Excel workbook.');
    }

    $zip = new ZipArchive();
    if ($zip->open($path) !== true) {
        throw new RuntimeException('The Excel workbook could not be opened.');
    }

    $sharedStrings = [];
    $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
    if ($sharedXml !== false) {
        $shared = simplexml_load_string($sharedXml);
        if ($shared !== false) {
            foreach ($shared->xpath('//*[local-name()="si"]') ?: [] as $item) {
                $sharedStrings[] = trim(implode('', array_map('strval', $item->xpath('.//*[local-name()="t"]') ?: [])));
            }
        }
    }

    $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
    $zip->close();
    if ($sheetXml === false) {
        throw new RuntimeException('The Excel workbook does not contain a readable first sheet.');
    }

    $sheet = simplexml_load_string($sheetXml);
    if ($sheet === false) {
        throw new RuntimeException('The Excel worksheet could not be read.');
    }

    $rows = [];
    foreach ($sheet->xpath('//*[local-name()="sheetData"]/*[local-name()="row"]') ?: [] as $sheetRow) {
        $cells = [];
        foreach ($sheetRow->xpath('./*[local-name()="c"]') ?: [] as $cell) {
            $reference = (string)$cell['r'];
            preg_match('/^[A-Z]+/', $reference, $matches);
            $column = $matches[0] ?? 'A';
            $index = 0;
            foreach (str_split($column) as $letter) {
                $index = ($index * 26) + ord($letter) - 64;
            }
            $valueNodes = $cell->xpath('./*[local-name()="v"]') ?: [];
            $value = isset($valueNodes[0]) ? (string)$valueNodes[0] : '';
            if ((string)$cell['t'] === 's') {
                $value = $sharedStrings[(int)$value] ?? '';
            } elseif ((string)$cell['t'] === 'inlineStr') {
                $value = trim(implode('', array_map('strval', $cell->xpath('./*[local-name()="is"]//*[local-name()="t"]') ?: [])));
            }
            $cells[$index - 1] = trim($value);
        }
        if ($cells) {
            $row = array_fill(0, count(athlete_import_headers()), '');
            foreach ($cells as $index => $value) {
                if ($index < count($row)) {
                    $row[$index] = $value;
                }
            }
            if (isset($row[4]) && is_numeric($row[4])) {
                $excelSerial = (float)$row[4];
                if ($excelSerial > 0 && $excelSerial < 100000) {
                    $row[4] = (new DateTime('1899-12-30'))->modify('+' . (int)$excelSerial . ' days')->format('Y-m-d');
                }
            }
            $rows[] = $row;
        }
    }

    return $rows;
}

function validate_athlete_import_headers(array $headers, bool $adminImport): void
{
    $headers = array_map(static fn ($value): string => strtolower(trim((string)$value)), $headers);
    $required = athlete_import_headers();
    if (!$adminImport) {
        array_pop($required);
    }
    if (array_slice($headers, 0, count($required)) !== $required) {
        throw new RuntimeException('Invalid header row. Use the provided template and keep the columns in the exact required order.');
    }
}

function get_coach_id_for_user(int $userId): ?int
{
    $stmt = db()->prepare('SELECT id FROM coaches WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $id = $stmt->fetchColumn();

    return $id === false ? null : (int)$id;
}

function coach_can_manage_athlete(int $athleteId, int $userId): bool
{
    if (is_admin()) {
        return true;
    }

    $coachId = get_coach_id_for_user($userId);
    if (!$coachId) {
        return false;
    }

    $stmt = db()->prepare('SELECT COUNT(*) FROM athletes WHERE id = ? AND coach_id = ?');
    $stmt->execute([$athleteId, $coachId]);

    return (int)$stmt->fetchColumn() === 1;
}

function require_post(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        exit('Method Not Allowed');
    }
}
