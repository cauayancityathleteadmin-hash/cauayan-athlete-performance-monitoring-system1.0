# Phase 4: Side-by-Side Verification — Progress → Training Merge

Verify every piece of value from the standalone Progress feature now lives inside Training
(Training Detail or Athlete "See Progress"). Nothing is lost before Phase 5 removes anything.

## Source features being merged

1. **Standalone athlete progress page** — `/athletes/[id]/progress`
   (tabs: Overview · Training · Performance · Recognition).
2. **Training Plans "Progress" tab** — `/training-plans` → `RosterProgress`
   (roster-wide completion across all of a coach's plans, per `/api/progress?roster=1`).

## Side-by-side checklist

### A. Standalone page → Athlete "See Progress" (`/training-plans/[id]/athletes/[athleteId]`)

| # | Standalone Progress value | New home in Training | Status |
|---|---|---|---|
| 1 | Overview · Latest training rating | Drill **Overview** "Coach rating" card + **Assessments** tab trend | ✅ covered |
| 2 | Overview · Best performance score | Drill **Overview** "Best performance score" card + **Exercise Performance** tab (best by category) | ✅ covered (card added in Phase 4) |
| 3 | Overview · Average performance score | Drill **Overview** "Average performance score" card + **Exercise Performance** tab | ✅ covered (card added in Phase 4) |
| 4 | Overview · Sessions present + attendance rate | Drill **Overview** "Sessions present" card + **Attendance** tab effort overview | ✅ covered (card added in Phase 4) |
| 5 | Training · Training rating trend (chart + last-10 table) | Drill **Assessments** tab (trend + table, now with Plan column) | ✅ covered |
| 6 | Training · Exercise score trend (chart + last-10 table w/ RPE) | Drill **Exercise Performance** tab | ✅ covered |
| 7 | Training · Strengths by fitness dimension | Drill **Assessments** tab "Strengths by area" | ✅ covered |
| 8 | Performance · Effort overview (present/late/excused/absent) | Drill **Attendance** tab "Effort overview" | ✅ covered |
| 9 | Performance · Activity log counts + completion rate | Drill **Overview** (completion %) + **Attendance** tab | ✅ covered |
| 10 | Performance · Achievements list | Drill **Achievements** tab | ✅ covered |
| 11 | Recognition · Recent health history (5) | Drill **Health** tab (10 recent) | ✅ covered (superset) |
| 12 | Cross-plan assessment history (old page showed all plans) | Drill **Assessments** queries athlete-wide with Plan column (Phase 4 fix) | ✅ covered |

### B. Training Plans "Progress" tab (`RosterProgress`)

Per the plan, Training List stays as-is → the built-in Progress tab inside
`/training-plans` is retained (it is already part of the Training feature, not a sidebar item).

| Feature | Location | Status |
|---|---|---|
| Roster-wide latest completion % per athlete (coach's plans) | `/training-plans` → Progress tab (`RosterProgress`, `/api/progress?roster=1`) | ✅ stays |
| Per-plan athlete rating | Same tab; also Training Detail roster shows latest rating per plan | ✅ stays |
| "View" → athlete progress | Links to `/training-plans/[id]/athletes/[athleteId]` (drill page) | ✅ unchanged target |

### C. Access path

| Path | Where |
|---|---|
| Training List → Training Detail | `/training-plans` → `/training-plans/[id]` |
| Training Detail → athlete roster → "See progress →" | `/training-plans/[id]/athletes/[athleteId]` |
| Athlete profile → "View progress" | Repointed to athlete's most recent plan drill page (else `/training-plans`) |

## Decision log

- **No silent drops.** Every standalone-page tab from the audit is reachable inside the
  drill page; nothing from Progress was discarded.
- **Old `/athletes/[id]/progress` URL**: converted to a graceful in-gSSP redirect to the
  athlete's most recent plan drill page (`/training-plans/{plan}/athletes/{id}`), falling
  back to `/athletes/{id}` when the athlete has no plans → old bookmarks never 404.
- **Sidebar**: the current sidebar has no "Progress" item (verified AppShell `NAV_GROUPS`);
  nothing to remove there. The merge removes the *standalone route*, not a sidebar link.
- **Standings leaderboard link** (previously → `/athletes/{id}/progress`): repointed to the
  athlete profile `/athletes/{id}` to avoid a dead link.
- **`/api/progress` endpoint**: retained — still consumed by `RosterProgress` (`roster=1`)
  and the drill page (`planId` + `athleteId`).

## Phase 4 verdict

✅ Every item of value from the standalone Progress feature exists in Training
(Training Detail and/or athlete "See Progress"). Proceeding to Phase 5 (removal) is safe.