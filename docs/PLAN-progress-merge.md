# PLAN: Merge "Progress" into Training + Remove from Sidebar — DONE

**Status: ALL PHASES COMPLETE ✅** (commits `4dd928a` → `8b90da6` → `180812b`, all pushed/deployed)

## Purpose
Remove "Progress" as a standalone destination and fold everything useful about it into
Training, so there is one place for athlete monitoring. Build/verify first, remove second.

## Final structure
- **Training List** `/training-plans` — unchanged: two containers (Normal (N) /
  Pre-Conditioning (N)) + built-in Progress tab (`RosterProgress`, cross-plan roster).
- **Training Detail** `/training-plans/[id]` — team-wide progress charts, athlete roster
  with "See progress →", assessment/scoring, trends.
- **Athlete "See Progress"** `/training-plans/[id]/athletes/[athleteId]` — the merged
  athlete hub, 9 tabs:
  1. Overview — plan stats + current standing (best/avg performance score, sessions present)
  2. Activities — add/edit/remove, full session history, comments
  3. Trends & charts — completion trend, metric trend, radar, activity completion
  4. Distribution — activities by fitness dimension
  5. Assessments — training rating trend + strengths by area (athlete-wide, Plan column)
  6. Exercise Performance — score + RPE trend, best by category
  7. Attendance — effort overview + session history
  8. Achievements — full recognition list
  9. Health — recent health history + status

## What was removed / changed (Phase 5)
- No sidebar "Progress" item existed to remove (verified `AppShell` `NAV_GROUPS`).
- `/athletes/[id]/progress` → graceful 307 redirect:
  - athlete on a plan → `/training-plans/{plan}/athletes/{id}`
  - athlete with no plan → `/athletes/{id}`
  - nonexistent athlete → 404
- `/athletes/[id]` "View progress" → most recent plan drill page (else `/training-plans`).
- `/standings` athlete links → `/athletes/{id}`.
- `/api/progress` kept (used by `RosterProgress` + drill page).

## Verification highlights (Phase 6)
- Real admin login (local) → all listed routes 200; drill page renders every new tab with
  real data; redirect targets confirmed via response `Location`.
- Regression-only bugs caught & fixed: `TrainingSession` fields (`startTime`/`sessionType`,
  not `sessionDate`/`sessionName`), missing `fmtNum` helper in drill page, missing
  `healthStatus` in drill gSSP select.
- Live: `/api/health` 200; production deploy success for every commit; buildId changed.
- Theme unchanged — reuses existing panels, badges, tokens, and `lib/chart-config.js`.

## Deploy trail
| Commit | Purpose | Deploy |
|---|---|---|
| `4dd928a` | Phase 2–3: 5 new drill tabs (Assessments/Performance/Attendance/Achievements/Health) + gSSP data | 6581046948 |
| `8b90da6` | Phase 4–5: verification doc, drop-preview stat cards, Plan column, athlete-wide assessments, route/link repoints, redirect page, AGENTS.md sync | 6581152843 |
| `180812b` | Phase 6 regression fixes + docs | 6581305968 |