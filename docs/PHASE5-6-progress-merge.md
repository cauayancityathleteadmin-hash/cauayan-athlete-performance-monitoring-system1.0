# Phases 5–6: Removal + Full Regression — Progress → Training Merge

## Phase 5 — Remove the standalone Progress route (Sidebar)

- **Sidebar**: verified `AppShell` `NAV_GROUPS` — there is no "Progress" sidebar item to
  remove; the merge removed the standalone *route*, and the built-in "Progress" tab inside
  Training List (`/training-plans`) stays by plan design ("Training List stays as-is").
- **Old route** `/athletes/[id]/progress`: converted to an in-gSSP graceful redirect
  (307) to the athlete's most recent plan drill page; falls back to `/athletes/{id}` when
  the athlete has no plan memberships. Nonexistent athletes still 404.
- **Links repointed** (no dead links remain):
  - `/athletes/[id]` "View progress" → `progressHref` = most recent plan drill page
    (`/training-plans/{plan}/athletes/{id}`) or `/training-plans` if no plan.
  - `/standings` athlete links → `/athletes/{id}` (profile hub).
- **`/api/progress` retained** — still consumed by `RosterProgress` (`roster=1`) and the
  drill page (`planId`+`athleteId`).
- **Docs in sync**: `AGENTS.md` "pages with tabs" list no longer lists the old page.

### Phase 5 verified (local, real admin login)
```
/athletes/37/progress  -> 307 Location: /training-plans/12/athletes/37
/athletes/19/progress  -> 307 Location: /training-plans/3/athletes/19
/athletes/3/progress   -> 307 Location: /athletes/3        (no-plan fallback)
/athletes/999999/progress -> 404                            (not found)
```

## Phase 6 — Full Regression

### Routes (local admin session)
```
/training-plans                     -> 200  (Progress tab intact, id="progress")
/training-plans/12                  -> 200  (pre-conditioning plan detail)
/training-plans/6                   -> 200  (normal plan detail)
/training-plans/12/athletes/37      -> 200  (drill page, 9 tabs)
/training-plans/3/athletes/4        -> 200  (drill page with real assessment data)
/athletes/37                        -> 200  ("View progress" -> /training-plans/12/athletes/37)
/standings                          -> 200  (no /progress links)
```

### Drill page content (athlete with data)
- Overview stat grid now includes Best / Average performance score + Sessions present
  (the standalone page's "current standing" preserved).
- Assessments tab: Training rating trend + Strengths by area + table with **Plan** column.
- Exercise Performance, Attendance, Achievements, Health tabs all render.

### Bugs found & fixed during regression (caught by real-login local tests)
1. `TrainingAttendance` has no `sessionDate` — date lives on `session.startTime`;
   `TrainingSession` has no `sessionName` — uses `sessionType`. Fixed query + table.
2. `fmtNum` was referenced in the new tabs but not defined in the drill page — only
   crashed when data existed (empty states masked it). Added the helper.
3. `athlete.healthStatus` missing from drill gSSP select (Health tab header). Added.

### Mandatory workflow
- Backup → lint 0 → `next build` → commit `8b90da6` (+ follow-up fixes commit) → push
  `main` → Vercel prod deploy success → live `/api/health` 200 → live buildId changed →
  mirror synced.
- Theme unchanged: all new UI reuses existing `.panel` / `.detailPanel` / `.statGrid` /
  `.tableWrap` / badge classes and `lib/chart-config.js` tokens; no new CSS.

## Final structure (per plan)
- **Training List** `/training-plans` — two containers (Normal / Pre-Conditioning). The
  cross-plan "Progress" tab was removed in the final follow-up step: each plan row keeps its
  own Progress/Rating columns, and all *training* progress lives inside Training Detail.
- **Training Detail** `/training-plans/[id]` — team-wide progress charts, athlete roster with per-athlete completion/rating and "See progress →", assessment/scoring.
- **Athlete "See Progress"** `/training-plans/[id]/athletes/[athleteId]` — all activities, all progress charts, plus assessments/exercise performance/attendance/achievements/health.

## Follow-up step (final): remove the Training List "Progress" tab
After Phase 6 verification, the `/training-plans` "Progress" tab (`RosterProgress` — a
cross-plan "latest progress across plans" rollup) was removed so that "Progress" no longer
exists as any standalone destination. Its value is preserved per plan inside **Training
Detail** (every plan's roster completion/rating) and per athlete inside **See Progress**.
The Plans table keeps its per-plan Progress/Rating columns; `/api/progress` stays (drill
page + `roster=1` mode remains in the API). Verified locally: tab gone, containers intact,
all routes 200.

**Status: All phases complete ✅**