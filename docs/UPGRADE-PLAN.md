# Upgrade Plan — Central Athlete Progress Monitoring

> Working notes for the planned upgrades to the **active system** (`next-app/`).
> Legacy PHP at the repo root is deprecated — do not modify it.
> The active system is a Next.js 16 (Pages Router) app on Neon PostgreSQL with Prisma.

---

## Core goal

Make this a true **centralized monitoring system** for athlete progress by combining all the
data the system already collects into single, live per-athlete (and per-coach) progress views.

## What the system ALREADY collects (foundation, no new forms needed)

| Data | Source model | Fields |
|---|---|---|
| Training score | `TrainingAssessment` | rating 1–10, fitness dimension, date, assessor |
| Physical performance | `ExercisePerformance` | score, scoreBreakdown, HR avg/max, RPE, sets/reps/load/distance |
| Attendance / effort | `TrainingAttendance`, `PlanActivityLog` | present/late/absent; done/partial/missed + quantity |
| Achievements | `Achievement` | title, type, date, org, description ONLY (no medals/points) |

## The gap

These are 4 separate silos with **no combined "how is this athlete doing NOW" view**.
Achievements have **no medal/place/level/points**, so medals cannot be counted, athletes cannot
be ranked, and "sports won" cannot be tracked.

---

## Phase 1 — Live Athlete Progress Dashboard  (no DB change)

New page: `/athletes/[id]/progress` (linked from each athlete profile).

Shows (updating the moment data is saved):
- Latest training rating (1–10, per fitness dimension) + trend sparkline over last N assessments
- Best/avg physical performance score (from `ExercisePerformance.score`) + progress vs earlier
- Effort summary: sessions attended, done/partial/missed counts
- Current health flags (injured/sick/recovering)
- Achievements list (current)

Reuse existing `Analytics` percentile/trend logic (`lib/performance-insights.js`) where possible.
No migration, no new forms.

## Phase 2 — Coach Progress View  (no DB change)

Extend the existing "Coach Evaluations" page (or add a summary section) using data already in
`CoachPerformance`:
- Score trend over time (overallScore per period)
- Per-criterion trends (sessionPlanning, exerciseSelection, technicalInstruction,
  athleteDevelopment, communication, safetyCompliance, trainingImplementation)
- Average overall score across all evaluations
- Improvement/decline indicators between evaluations

Honest limit: evaluation data is sparse/infrequent (1–4 evals per coach per season) and only
grows when admins actively fill in evaluations. May want a reminder/prompt for regular reviews.

## Phase 3 — Structured achievements + points system  (DB migration)

Modify `Achievement` model:
```
medal            String?   # gold|silver|bronze|1st|2nd|3rd|participation
level            String?   # intramural|district|regional|national|international
sportId          Int?      # FK -> Sport
eventId          Int?      # FK -> Event
certificateUrl   String?   # uploaded image/pdf proof
```

New model `PointsConfig` (admin-editable so the formula is not hard-coded):
```
id, medal, level, points, @@unique([medal, level])
```
Default points (nominal, tunable): District {G:5,S:3,B:1}, Regional {10,6,3},
National {20,12,6}, Intl {40,24,12}.

Total points per athlete = SUM over achievements of configured points (computed on read).

Migration: add columns -> new table -> seed default points -> backfill/clean historical records.

## Phase 4 — Standings & analytics layer

- **Leaderboard** page: athletes ranked by total points, filterable by sport / school / medal / level.
- **"Sports won"**: achievements link sportId + eventId, so wins can be counted/aggregated per sport.
- **Analytics additions**: points distribution, medal counts by color/level, top performers.
- **Reports**: add a "Medals & Points" section to the athlete full-profile report.

---

## Sorting fix (done)

Broken: the Athletes list `sort` dropdown did nothing because `getServerSideProps` was overriding
the chosen `orderBy` with a hardcoded sort at query time (`athletes.js`). Fixed so the dropdown +
direction actually sorts the server results. Coach/report sorts were already wired correctly.

---

## STATUS (current)

- Phase 1 — DONE: `/athletes/[id]/progress` + "View progress" link on profile.
- Phase 2 — DONE: Coach progress panel on `/admin/coach-performances`.
- Phase 5 — DONE: Training-plan coach filter (create + edit forms).
- Sorting — DONE: Athletes sort dropdown fixed.
- Phase 3 — CODE DONE, MIGRATION NOT YET APPLIED to a DB.
- Phase 4 — Standings page DONE (`/standings` + nav link). Analytics/reports medal section deferred.

### IMPORTANT — migration constraint
The schema change (achievement medals/level/FK + `points_config` table) and its migration SQL are
ready at `prisma/migrations/20260903090000_achievement_medals_points/migration.sql`.
**The local env has NO `DIRECT_URL` (only placeholder/localhost URLs) and no reachable Neon DB,
so the migration has NOT been applied here.** To go live:

1. Push to `main` (Vercel deploys HEAD).
2. Apply the migration against the production Neon DB via the real `DIRECT_URL`, e.g.
   `npx prisma migrate deploy` with `DIRECT_URL` set to the Neon direct connection string
   (as AGENTS.md workflows use), or run it in the Vercel/CI step.

Until the migration is applied to the live DB, the new achievement/points fields will not exist
there — pages querying them (standings, medal display) will fail on the live site. Apply the
migration before relying on those features.

---

## Real-time honesty

- "Live" = updates the instant a coach/admin saves an entry (DB write -> page refresh).
- NO automatic sensing, NO live meet feeds, NO wearables.
- Value depends on recording consistency.

---

## Phase 5 — Training plan coach filter  (no DB change, quick win)

Current behavior: on the training-plan create/edit form, the athlete checkbox list is filtered
by SPORT only. When an ADMIN selects a coach, athlete options do NOT re-filter by that coach,
so admins can accidentally add athletes who belong to a different coach.

Fix: when a coach is selected, the athlete list re-filters to only athletes assigned to that
coach (still scoped to the sport). For a coach user, the palette is already scoped to their own
athletes in getServerSideProps — no change needed there.

Files: `next-app/pages/training-plans.js` (create form) + `next-app/pages/training-plans/[id].js`
(edit form). No DB migration.

## Build order (most efficient)

1. Phase 1 athlete progress dashboard (reuse existing data, low risk)
2. Phase 2 coach progress view (reuse existing data, low risk)
3. Phase 5 training plan coach filter (reuse existing data, no migration)
4. Phase 3 schema + points (the only real migration)
5. Phase 4 standings + analytics + reports
6. Backfill/clean historical achievement records

## Files likely to be touched

- `next-app/prisma/schema.prisma` (+ a new migration)
- New: `next-app/pages/athletes/[id]/progress.js`, `next-app/pages/standings.js`,
  `next-app/pages/admin/points-config.js`
- Modify: `next-app/pages/athletes/[id].js` (link progress),
  `next-app/pages/admin/coach-performances.js` (coach trend),
  `next-app/pages/training-plans.js` + `next-app/pages/training-plans/[id].js` (coach filter),
  `next-app/pages/analytics.js`, `next-app/pages/reports.js`,
  relevant API routes, `next-app/components/AppShell.js` (nav links)

---

## Delivery principles

- Back up the repo + DB (`git clone` + `pg_dump` via `DIRECT_URL`) before every upgrade/deploy.
- Verify `npm run lint` and `npm run build` before any deploy (CI does this on push to main).
- Apply migrations via `DIRECT_URL`; use pooled `DATABASE_URL` at runtime.
- Never run the seed with `SEED_TEST_DATA=1` on production.
