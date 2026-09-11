# Test accounts

The demo dataset (seed with `SEED_TEST_DATA=1`) was applied on **2026-09-11** to BOTH the local dev database and the production Neon database used by Vercel (`cauayan-athlete-performance-monitoring-system1-0`). The live site at `https://cauayan-athlete-performance-monitor-indol.vercel.app` uses these accounts.

To re-create the dataset (next-app):

```powershell
cd next-app
$env:SEED_TEST_DATA = "1"
node prisma/seed.js
```

The seed always creates idempotent **reference data** (schools, sports, events, performance metrics, points configuration, system settings). Test users, coaches, athletes, assessments, event plans, training data, etc. are created only with `SEED_TEST_DATA=1`.

Login accepts **Username, Email, or Coach Code** (email/username matched case-insensitively; coach codes are normalized to uppercase).

## Administrator

| Identifier            | Password      |
| --------------------- | ------------- |
| `admin.101` / `admin.101@cauayan.local` | `Admin.101!` |

Also accepts the numeric user id `1` as identifier.

## Coaches (same password: `CoachTest2026!`)

| Code       | Username / Email               | Status   |
| ---------- | ------------------------------ | -------- |
| COA-000001 | maria.santos@cauayan.local     | Active   |
| COA-000002 | roberto.delacruz@cauayan.local | Active   |
| COA-000003 | elena.reyes@cauayan.local      | Active   |
| COA-000004 | jose.ramos@cauayan.local       | Active   |
| COA-000005 | rosa.diaz@cauayan.local        | Active   |
| COA-000006 | coach.101 / coach.101@cauayan.local | Active (primary test coach *Miguel Santiago*) |
| COA-000007 | pedro.delvalle@cauayan.local   | Pending  |
| COA-000008 | liza.flores@cauayan.local      | Rejected |

> Pending and rejected coaches cannot sign in; they receive an "awaiting approval"/"application rejected" message. Coach code matching is case-insensitive (`coa-000006` works).

> Security: `SEED_TEST_DATA=1` must never be enabled in the deploy build, and test credentials must never be used on a public deployment. Production login accounts are created through the coach registration & admin approval flow only.