# PLAN: Training consistency — charts-first detail, plain tabs, no general comments

Status: planned (not started)
Owner: plan approved 2026-09-15 — waiting for go

Companion plans: `PLAN-nav-drill-comments.md`, `PLAN-activity-metrics-progress.md`,
`PLAN-nav-ia.md`. This plan refines (does not replace) the drill-down IA; it supersedes
one decision in `PLAN-nav-drill-comments.md` (see Risks).

## Why (user request)

- Make the Training feature one familiar, consistent drill: **Training → Trainings →
  Training (charts + athlete list) → athlete (activities + charts)**.
- Consistency: the same breadcrumb, tab bar, cards, tables, buttons, and charts on every
  page. Use controls everyone already knows; drop jargon like "Squad view".
- Comments stay **specific**: one per athlete, or one per a specific athlete's activity.
  Remove the general "for everyone" activity note.

## Decisions locked (Q&A 2026-09-15)

1. Training detail page lands on **Charts first**, athlete list follows.
2. **Delete** existing general ("everyone") activity comments — no archive.
3. Keep the sidebar **Progress overview** page as-is (it is the across-trainings view).
4. **Rename/drop** "Squad view"; use plain tabs.

## Current state (facts from code)

- Plan detail `next-app/pages/training-plans/[id]/index.js`:
  - Default tab is the **athletes** list (`useState("athletes")`, index.js:177); tab bar =
    Athletes / Squad view / Plan activities (index.js:276).
  - "Squad view" bundles TrainingCharts + MonitoringGrid + the coach AssessStudio which
    **auto-opens** (index.js:287-329).
  - TrainingCharts already has a weekly LineChart (index.js:1794) plus HBars/Donut KPIs.
  - "Plan activities" repeats per-athlete activity grids **and** the guidance threads
    (index.js:348-396).
- Drill page `next-app/pages/training-plans/[id]/athletes/[athleteId].js`:
  - Sections: athlete guidance, latest-score chart, activities & progress, distribution.
  - Activity comment thread has a scope toggle `everyone | thisAthlete`
    (athleteId.js:142-209) incl. an "Everyone" badge.
- Data model `next-app/prisma/schema.prisma:802-817`: `ActivityPlanComment.athleteId` is
  nullable — `null` = general note for the activity.
- Charts: recharts is already used app-wide (dashboard.js:8, reports.js:6,
  progress/index.js:5) — no new chart library needed.

## Approved design

### 1. Training detail: Charts first, plain tabs
`next-app/pages/training-plans/[id]/index.js`

- Default tab becomes **Charts** (matches user decision #1). Tab bar becomes
  `Charts | Athletes | Activities` (no "Squad view", no "Plan activities").
- **Charts (default):** header KPI block + TrainingCharts (keeps the weekly trend line)
  + MonitoringGrid. The coach AssessStudio no longer auto-opens — it sits behind one
  explicit, familiar action button **"Assess athletes"** on the Charts tab (coach only).
- **Athletes:** the roster (existing columns) plus per-athlete guidance threads
  (`AthleteGuidanceRow`), which move here from the old "Plan activities" tab so guidance
  appears in exactly one place.
- **Activities:** the plan-level activity planning/editing grids (`AthleteActivitiesBlock`:
  add / edit / remove). Drop the duplicated guidance section that currently lives here.
- Remove every "Squad view" label in this file (and from docs below).

### 2. Drill page: specific comments only
`next-app/pages/training-plans/[id]/athletes/[athleteId].js`

- Delete the scope toggle and "Everyone" badge in `ActivityCommentThread`.
- POST always attaches the comment to **this athlete** (athleteId = route athlete); GET
  returns this athlete's comments for the activity only.
- Keep the athlete-level guidance thread (`AthletePlanComment`) on the page.
- Standardize the drill sections to the same header pattern used everywhere (eyebrow +
  h2 + panel) and keep its existing charts.

### 3. Data model + API: general comments impossible
- `next-app/prisma/schema.prisma:802-817`: `ActivityPlanComment.athleteId` `Int?` → `Int`;
  the `athlete` relation becomes required.
- **Before** `prisma db push`: delete existing general rows
  (`activity_plan_comments WHERE athlete_id IS NULL`) — ordered first, or the push fails.
- `next-app/pages/api/training-plans/[id]/activities/[activityId]/comments.js`: POST now
  **requires** `athleteId` (validated to belong to the plan); GET drops scope grouping;
  DELETE rule unchanged (admin / author).

### 4. Consistency pattern (reuse, don't rebuild)
- Page template everywhere: breadcrumb → header panel (eyebrow + h2 + badge) → tab bar
  (same buttons) → panels.
- Tables: same columns and `.tableWrap`; buttons/empty states reuse existing styles.
- Charts: same card header (eyebrow "Charts" + h2), and reuse the recharts theming from
  `progress/index.js` (`percentColor`, tooltip styles) so every chart looks identical.
- No dropdown pickers — keep the search/suggestion patterns already shipped
  (coach-card style from `PLAN-athlete-directory`).

## Files to touch

- `next-app/pages/training-plans/[id]/index.js` — default tab, tab rename/reorder,
  "Assess athletes" action, guidance moved to Athletes tab, consistent headers.
- `next-app/pages/training-plans/[id]/athletes/[athleteId].js` — remove scope toggle +
  Everyone badge; POST fixed to athlete; header consistency.
- `next-app/pages/api/training-plans/[id]/activities/[activityId]/comments.js` —
  `athleteId` required; drop scope grouping.
- `next-app/prisma/schema.prisma` — `athleteId` required (`Int`, relation required).
- one-off delete of general comment rows (before `prisma db push`).
- `next-app/styles/Dashboard.module.css` — only if a consistency class is missing.
- `docs/PLAN-nav-drill-comments.md` — note decision #2 is superseded (default landing
  moves to Charts; see Risks).

## Verification (standing workflow)

1. Backup snapshot to `C:\Users\FUJITSU\AppData\Local\Temp\opencode\backups\`.
2. Delete general comment rows, then `prisma db push` (NO `--skip-generate`) syncs Neon.
3. ESLint changed files → 0 errors; full `npm run lint`; `npm run build`.
4. Commit + push `main` → confirm prod deployment Ready.
5. `/api/health` 200; `smoke-metrics.ps1` green.
6. Manual: plan page lands on **Charts**; tabs Athletes + Activities work; grep shows no
   "Squad view" and no "Everyone"; drill POST only creates per-athlete comment rows;
   no `athlete_id IS NULL` rows remain in `activity_plan_comments`.

## Risks

- Making `athleteId` required before deleting null rows fails the push — order matters
  (delete first).
- Supersedes decision #2 of `PLAN-nav-drill-comments.md` (default landing was "athletes
  list"; now "Charts"). Flag it in that doc rather than rewriting history.
- Moving AssessStudio behind a button changes the coach scoring flow — button must stay
  prominent on the Charts tab.