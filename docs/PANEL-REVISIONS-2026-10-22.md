# Panel Revisions — Analytics, Report Filtering, Sports Catalog (2026-10-22)

Follow-up work addressing the panel's six review comments. This document covers the
three items built in this pass; the other three were already satisfied and verified
earlier (documents summarized in compliance report; yearly accomplishments report;
event winners/history).

All changes were made one at a time, each with: backup → edit → lint (0 errors) →
`next build` → commit + push to `main` → live verify (fresh `/api/health` uptimeSec +
authenticated checks) → standing regression suite (46 passed, 0 failed).

---

## 1. Analytics achievements bug — `pages/analytics.js`

**Problem.** On `/analytics`, the "Achievements" KPI was hardcoded to `0` and the
"Achievements by type" chart was hardcoded to an empty array, so it always showed
"No achievements recorded." The "Export CSV" button called an empty
`function downloadCsv() {}` stub.

**Change.**
- Added `prisma.achievement.findMany()` to the page's `Promise.all` data fetch.
- `kpi.achievements` now counts real achievement records.
- `achievementTypeDist` aggregates achievements by `achievementType` (blank types
  grouped as "Unspecified"), sorted high→low, matching the existing `HBars` chart
  shape.
- Implemented `downloadCsv` using the already-present, unused `toCsvRows` helper in
  `lib/performance-insights.js` (no new CSV format invented).

**Verified live.** Achievements KPI = 11 (was 0); chart empty-state gone; Export CSV
present. Commit `2dd8f91`.

---

## 2. Report filtering — `pages/reports.js`

**Problem.** In `/reports` (Records tab), the period filter (presets + From/To) only
appeared on the **Athlete** tab; the **Coach** tab had no period filter and
`CoachReportCard` ignored periods. There were also no school, status, or sport
filters — only free-text search.

**Change.**
- Period presets + From/To inputs now apply to the Coach tab too.
- `CoachReportCard` accepts `from`/`to` and windows its date-bearing sections
  (III Training Sessions, IV Training Plans, V Evaluations, VI Applications,
  VII Participation) with the shared `inPeriod` helper — same rule as
  `AthleteReportCard`. The profile/identity section (I) stays unwindowed. Section
  numbering and the signature chain are unchanged.
- Added **School**, **Status**, and **Sport** facet filters to the records table for
  both tabs. Options are derived from the data actually present (a filter never
  yields an empty set); rendered as chip-style segmented buttons (no dropdowns), with
  an "All" chip to clear.
- Facet filters reset when switching between Athlete/Coach tabs.

Report content, wording, section numbering, and signature blocks were not changed.

**Verified live.** All 7 period presets present; School/Status/Sport filters present;
Report period + date inputs present. Commit `93e1bcb`.

---

## 3. Sports complete & categorized — schema + seed + API + UI

**Problem.** Only 6 sports and 11 events were seeded, and sports had no category
(events already had `eventCategory`: individual / smallTeam / largeTeam).

**Change.**
- Added `enum SportCategory { individual, team, racket, combat, aquatics, dance }`
  and `Sport.category` (`@default(individual)`) in `prisma/schema.prisma`.
- Migration `20261022110000_add_sport_category` (generated with
  `prisma migrate diff --from-config-datasource --to-schema`, applied with
  `migrate deploy`).
- Expanded the reference seed (`prisma/seed.js`) from **6 → 23 sports** and
  **11 → 61 events** (each with a performance metric). All pre-existing sports/events
  were kept, so existing athlete/event references remain valid.
  - Categories: individual 5, team 7, racket 3, combat 5, aquatics 1, dance 2.
- **Fixed a latent seed bug:** the events/metrics maps were keyed by `eventName` only,
  so same-named events across sports ("Singles", "Doubles") overwrote each other. They
  are now keyed by `sport|event`, and the assessment/achievement seed loops use the
  composite key (including the sport from the athlete row).
- Catalog API (`pages/api/catalog/index.js`) accepts and validates `category` on
  sport create + update (whitelist `SPORT_CATEGORIES`).
- Admin catalog UI (`pages/admin/catalog.js`): category selector on add/edit sport, a
  **Category** column in the sports table, category filter chips with counts, and an
  event **Type** column.

**Note on data model:** this is a `Sport`/`Event` change, not an athlete-model change,
so `lib/athlete-import-headers.js` and the import round-trip are unaffected.

**Verified live.** `/api/catalog` returns 23 categorized sports (0 without category)
and 61 events; the catalog page renders the Category column, category filter chips
(All 23 / Individual 5 / Team 7 / Racket 3 / Combat 5 / Aquatics 1 / Dance 2), and the
event Type column. Commit `f27c035`.

---

## Standing verification

- `npx eslint` on all changed files: 0 errors.
- `npx next build`: compiles clean.
- `live-regression.cjs`: **46 passed, 0 failed**.
- `panel-verify.cjs`: **12 passed, 0 failed**.

## Backups

- `backups/panel-revisions-20261022-095949` (item 1)
- `backups/panel-item4-reporting-20261022-100757` (item 2)
- `backups/panel-item6-sports-20261022-101742` (item 3)
