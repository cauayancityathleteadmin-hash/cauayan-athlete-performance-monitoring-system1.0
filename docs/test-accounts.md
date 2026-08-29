# Local test accounts

These accounts exist for **local development only**. Production deployments do NOT create them: the deploy build no longer runs the seed, and `next-app/prisma/seed.js` only creates test users when `SEED_TEST_DATA=1` is explicitly set.

To create the test dataset locally (Next.js app):

```bash
cd next-app
set SEED_TEST_DATA=1
npx prisma db seed   # or: node prisma/seed.js
```

The seed always creates idempotent **reference data** (schools, sports, events, performance metrics). Test users, coaches, athletes, assessments, and the sample event plan are created only with `SEED_TEST_DATA=1`.

> Security: never set `SEED_TEST_DATA=1` on production, and never rely on test credentials in any live deployment. Production login accounts are created through the coach registration & admin approval flow only.