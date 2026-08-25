# Local test accounts

These accounts are for local testing only. Run `database/migrations/003_seed_test_accounts.sql` after `schema.sql`, `002_add_event_plans.sql`, `004_add_event_times.sql`, and `005_seed_test_performance_metrics.sql`.

| Role | Login email or username | Password | Purpose |
| --- | --- | --- | --- |
| Admin | `admin.test@cauayan.local` or `admin-test` | `AdminTest2026` | Create plans, import plans, approve/reject applications, manage all records |
| Coach | `coach.one@cauayan.local`, `coach-001`, or `COA-TEST01` | `CoachTest2026A` | Approved application, Athletics and Swimming athletes |
| Coach | `coach.two@cauayan.local`, `coach-002`, or `COA-TEST02` | `CoachTest2026B` | Rejected application, Basketball and Volleyball athletes |
| Coach | `coach.three@cauayan.local`, `coach-003`, or `COA-TEST03` | `CoachTest2026C` | Pending application and athlete participation testing |

Athletes do not have login accounts in this system. The migration creates nine sample athlete records distributed across the three coaches. Use the coach accounts to test athlete creation, bulk import, event participation, assessments, and reports.

Change or delete these credentials before any online deployment.