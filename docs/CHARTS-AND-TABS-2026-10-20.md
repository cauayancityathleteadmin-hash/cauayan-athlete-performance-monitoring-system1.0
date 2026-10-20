# Charts & Shortcut Tabs Pass — 2026-10-20

Request: "fix all graphs and charts (format, labels, formal) + add shortcut tabs only where needed; plan first, test after, don't break anything."

## Audit result
- 6 files contain charts (4 recharts pages, 2 hand-rolled SVG sparklines, 1 report component set). Dashboard, standings, assessments have no charts.
- Tabs audit across every page (lines, `<section id>` count, existing tabs): only `/training-plans` qualified (3 stacked sections, long scroll). `/account` already has its own in-panel tab buttons; `/athletes` + `/dashboard` are excluded by the standing convention; all other pages are short (≤320 lines) or list/modal pages.

## Chart fixes (all use `lib/chart-config.js`, no new colors, no new files)
1. `pages/analytics.js`
   - "Assessments recorded per month": removed rainbow per-bar colors — single-series chart now uses the single accent color (chart standard: same data kind = same color).
   - "Health flags": was colored positionally (order-dependent, semantically wrong). Now fixed order (Injured → Sick → Recovering → Inactive) with per-flag semantic colors (danger/warning/muted/muted), matching `HEALTH_COLORS`.
   - Removed the now-unused local `PALETTE` const.
2. `pages/reports.js` (official printable report)
   - Rating trend: added axis titles "Assessment date" (x) and "Rating (1–10)" (y).
   - Plan activity completion: tooltip now reads "n activities" instead of a bare number.
3. `pages/training-plans/[id]/index.js`
   - Completion by athlete: axis titles "Completion" (x) / "Athlete" (y) + long-name truncation (`shortAxisLabel`) so names don't overflow.
   - Weekly completion trend: axis titles "Plan week" (x) / "Completion" (y).
4. `pages/training-plans/[id]/athletes/[athleteId].js` — axis titles on all 6 charts:
   - Training load: "Week of" / "Load (sum of RPE)".
   - Completion trend: "Session date|Week of|Month" (follows the granularity selector) / "Completion".
   - Metric trend: "Session date" / "Result (unit)" (unit from the selected activity).
   - Fitness balance radar: radius ticks now show `%`.
   - Activity completion: "Completion" / "Activity".
   - Activities by dimension: "Activities" / "Fitness dimension".
5. `pages/admin/coach-performances.js` — coach evaluation trend (hand-rolled SVG) now shows y-axis value labels (max/mid/min), matching the athlete-profile sparkline pattern.
6. `components/Charts.js` — deleted: dead code (imported nowhere) that duplicated the chart standard with an off-theme palette.

## Shortcut tabs
- `/training-plans` now uses `PageSectionTabs`: **All plans** (`#plans`) | **Normal Training** (`#normal`) | **Pre-Conditioning** (`#pre-conditioning`). Sticky scroll-nav pattern, same as every other tabbed page.
- `next-app/AGENTS.md` navigation list updated (added `/training-plans`, `/reports`, note on `/account`).

## Verification
- `npm run lint`: 0 errors. `next build`: compiles.
- No API or schema changes → no migrations; existing data untouched.
- Live verification after deploy: health 200, live regression suite, page-render checks for every touched page (see session transcript).
