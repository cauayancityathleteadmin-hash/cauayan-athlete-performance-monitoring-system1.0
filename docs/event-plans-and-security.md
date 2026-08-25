# Event plans and security plan

## Install the event feature

1. Back up the database.
2. Run `database/migrations/002_add_event_plans.sql` and then `database/migrations/004_add_event_times.sql` after `database/schema.sql`.
3. Sign in as an administrator and open **Sports Event Plans**.
4. Create an event manually, select its sports, add the date, venue, and one program-flow item per line.
5. Set the plan to **Open for applications** when coaches may apply.

The old `events` catalog remains only for performance-metric definitions. Athletes now require a sport and coach, but no event. Upcoming city plans use `event_plans` and do not change an athlete's sport record.

## Import format

Download `assets/templates/event_plan_import_template.csv`. Keep these headers and their order:

`event_name,description,start_date,start_time,end_date,end_time,venue,status,sports,program_flow`

Use `YYYY-MM-DD` dates, `draft` or `open` status, and separate multiple sports with `|`. Put program-flow lines inside one quoted CSV cell. The importer validates required fields and reuses existing sport names. PDF and DOC files should first be converted to this CSV format; importing free-form documents directly would require guessing dates, sports, and participants.

Athlete imports use `assets/templates/athlete_import_template.csv`. They now contain `sport_name` and (for administrators) `coach_identifier`; there is no event column.

## Prioritized online security plan

1. **HTTPS and secrets:** deploy behind TLS, keep database credentials outside the web root, use environment-level secrets, and disable PHP error display in production.
2. **Authentication:** use password hashing, strong password policy, login throttling, secure session cookies, session ID rotation after login, logout invalidation, and MFA for administrators.
3. **Authorization:** enforce server-side role and ownership checks on every write; never trust hidden fields, coach IDs, athlete IDs, or uploaded filenames from the browser.
4. **CSRF and XSS:** keep CSRF tokens on every state-changing request, escape output by context, validate redirect targets, and add a restrictive Content-Security-Policy.
5. **SQL and uploads:** use prepared statements, allow-list sort fields, limit upload size, validate MIME and extension, store uploads outside the public directory, rename files, and scan or reject macros and active content.
6. **Data protection:** minimize personal data, encrypt backups, restrict database accounts, use foreign keys, define retention, and test restore procedures.
7. **Abuse controls:** rate-limit login/import endpoints, cap CSV rows and field lengths, reject malformed archives, and log suspicious failures.
8. **Audit and monitoring:** retain immutable admin audit logs for approvals, imports, exports, status changes, and deletions; alert on repeated failures and unusual bulk activity.
9. **Operations:** patch PHP/MySQL and dependencies, remove test accounts and sample credentials, disable directory listing, set secure headers, and perform dependency and vulnerability scans before release.
10. **Recovery and testing:** maintain encrypted off-site backups, rehearse incident response, run authorization/CSRF/upload tests, and conduct a security review before exposing the site publicly.