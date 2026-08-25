# Event plans

Upcoming Cauayan City events are managed from `admin/events.php`. Apply the migration in `database/migrations/002_add_event_plans.sql` first. Coaches use `coach/events.php` to view plans, apply, and add athletes assigned to their account. A sample event import is available at `assets/templates/event_plan_import_template.csv`; detailed format and security guidance is in `docs/event-plans-and-security.md`.

For local testing, run `database/migrations/003_seed_test_accounts.sql` after the event migrations, then run `database/migrations/005_seed_test_performance_metrics.sql`. The credentials and sample-data coverage are listed in `docs/test-accounts.md`. Do not run the test-data migrations in production.
# Cauayan City Athletes Performance Monitoring System

Athlete performance tracking system for coaches and administrators (Cauayan City, Isabela context).

## Requirements

- PHP 8.1+ with PDO MySQL
- PHP ZIP extension enabled for XLSX athlete imports
- MySQL / MariaDB 10.5+

## Setup

1. Create database and import schema:

```bash
C:\xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE performance_monitoring_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
C:\xampp\mysql\bin\mysql.exe -u root performance_monitoring_system < database/schema.sql
```

For a default XAMPP installation, the application is configured to use the local `root` account with an empty password. This is suitable for local development only. Set a dedicated database user and password in `includes/config.php` before production deployment.

2. Edit `includes/config.php`:

```php
define('BASE_URL', '/your-folder');   // or '' if at web root
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'performance_monitoring_system');
define('DB_USER', 'root');
define('DB_PASS', '');
// Optional socket (leave empty / remove unix_socket if using TCP):
// define('DB_SOCKET', '/var/run/mysqld/mysqld.sock');
```

For existing databases created before coach birthdates were added, run
`database/migrations/001_add_coach_birthdate.sql` once before using coach registration.

If using TCP only, set `db.php` DSN back to:

```php
$dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
```

3. Point your web server document root at this folder (or use PHP built-in server):

```bash
php -S localhost:8080 -t .
```

4. Create the first admin (only works when no users exist):

Visit `/setup/create_admin.php`

Or create via SQL / CLI. Default seed admin (if you ran the test seed):

- Username: `admin`
- Password: `admin12345`

**Delete or protect `setup/create_admin.php` after installation.**

### Coach email delivery

When an Admin creates a coach, the system sends the coach ID, login email, and initial password to the entered email address. Gmail delivery requires configuring PHP's mail transport in XAMPP first; PHP's `mail()` function does not send through Gmail automatically. Configure `sendmail_path` in `C:\xampp\php\php.ini` and the SMTP settings in `C:\xampp\sendmail\sendmail.ini`, then restart Apache. For production, use an authenticated SMTP provider and do not use the local XAMPP `root` database account.

## Roles

| Role  | Capabilities |
|-------|--------------|
| Admin | Manage coaches, athletes, sports/events, metrics, audit logs, backups |
| Coach | View all athletes, record assessments only for assigned athletes |

## Login

- Admin: username or email
- Coach: coach code (e.g. `COA-000001`) or email

## Features

- Athlete registration with school, sport, event, coach assignment
- Bulk athlete import from CSV or XLSX using the downloadable template; admin rows require an active coach identifier and coach rows are assigned automatically to the importing coach
- Coach reassignment history
- Status history
- Performance metrics per event (decimal / integer / text)
- Assessment recording with validation
- Achievements list (view)
- Audit logging
- CSRF protection on all POST actions
