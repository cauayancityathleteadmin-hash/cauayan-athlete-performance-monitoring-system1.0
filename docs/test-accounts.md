# Test accounts

The demo dataset (seed with `SEED_TEST_DATA=1`) was applied on **2026-09-09** to the production Neon database used by Vercel (`cauayan-athlete-performance-monitoring-system1-0`). The live site at `https://cauayan-athlete-performance-monitor-indol.vercel.app` uses these accounts.

To re-create the dataset locally (next-app):

```powershell
cd next-app
$env:SEED_TEST_DATA = "1"
node prisma/seed.js
```

The seed always creates idempotent **reference data** (schools, sports, events, performance metrics, points configuration, system settings). Test users, coaches, athletes, assessments, event plans, training data, etc. are created only with `SEED_TEST_DATA=1`.

## Administrator

| Identifier            | Password      |
| --------------------- | ------------- |
| `admin` / `admin@cauayan.local` | `AdminTest2026!` |

## Coaches (same password: `CoachTest2026!`)

| Code       | Email                          | Status   |
| ---------- | ------------------------------ | -------- |
| COA-100001 | maria.santos@cauayan.local     | Active   |
| COA-100002 | roberto.delacruz@cauayan.local | Active   |
| COA-100003 | elena.reyes@cauayan.local      | Active   |
| COA-100004 | jose.ramos@cauayan.local       | Active   |
| COA-100005 | rosa.diaz@cauayan.local        | Active   |
| COA-100006 | pedro.delvalle@cauayan.local   | Pending  |
| COA-100007 | liza.flores@cauayan.local      | Rejected |

> Security: `SEED_TEST_DATA=1` must never be enabled in the deploy build, and test credentials must never be used on a public deployment. Production login accounts are created through the coach registration & admin approval flow only.