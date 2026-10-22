# Dashboard Overview + Analytics Charts (2026-10-22)

Follow-up request: make **Dashboard** a summarized overview (especially items that
need attention) with charts/graphs, and make **Analytics** show everything as
charts — outputs, progress and trends, including events, sports and winners.

All changes were made one at a time, each with: backup → edit → lint (0 errors) →
`next build` → commit + push to `main` → live verify (authenticated checks against
the running deploy) → standing regression suite. Every chart imports `lib/chart-config.js`
(no new chart library, no theme change, tokens only). No panel-required wording,
report formats/signatures, filters or sidebar were touched.

---

## Part A — Dashboard (`pages/dashboard.js`)

### A1. Needs-attention summary charts
- **"What needs attention"** horizontal bar: health flags, documents due, missed
  training activities, and (for approvers) pending coach approvals — one glance at
  what is piling up.
- **"Health flags"** donut (healthy / sick / injured / recovering / inactive) using
  the same semantic colours as Analytics.
- Placed at the top, above the existing named triage list (which is kept — people,
  not just counts).

### A2. Overview trend charts
- **Activity completion — 8 weeks** stacked column (done / partial / missed).
- **Rating trend** line (latest 1–10 training ratings).
- **Athletes by sport** horizontal bar.
- **Share by status** donut.
- The original number panels (completion rate, average rating, health counts, coach
  average) and all feature cards remain below.

**Data model:** Dashboard is read-only; no schema change, so
`lib/athlete-import-headers.js` is unaffected.

**Verified live.** Admin and coach dashboards both 200; all new panels present;
completion / coach-average / triage panels still present. Commits `b2e8566`,
`42503dc` (fix `b899397`).

---

## Part B — Analytics (`pages/analytics.js`)

### B1. Tables → charts
- **Average result per metric** → horizontal bars.
- **Metric range — low to high** → range bars (grey = lowest, green = spread,
  amber tick = average) via a new `RangeBars` helper.

### B2. Real athlete progress
- Replaced the peer-percentile table with **Improving / flat / declining** donut and
  a **Biggest movers** bar.
- Progress now compares each athlete's **latest result to their previous result on
  the same metric**, respecting each metric's `betterDirection` (higher- or
  lower-is-better) — real improvement, not a peer rank. Requires ≥2 records per
  metric, with a clear empty state otherwise. Export CSV kept.

### B3. Events & sports
- **Athletes by sport** bar.
- **Events by sport category** bar (uses the `Sport.category` field added for the
  panel's item #6).

### B4. Competition (admin-only tab)
- **Medals by sport**, **Medal breakdown** donut, **Medals by level**,
  **Top winners** (ranked by standing points), **Achievements over time**, and a
  summary (gold / silver / bronze / records set).
- Reuses `lib/points.js` (`computeAchievementPoints`, `medalCounts`, `MEDAL_ORDER`)
  — the single source of truth for medals and standing points. No new scoring rules.

**Data model:** Analytics is read-only; no schema change, so
`lib/athlete-import-headers.js` is unaffected.

**Verified live.** Admin: all sections present. Coach: sees the athlete/assessment/
measurement/training charts and **correctly does not see** the admin-only Competition
tab. Commits `aa9bcc1`, `e9738f5`, `51fa64b`.

### Note on athlete progress placement
Per the recommendation, **deep per-athlete progress is NOT in Analytics**. Analytics
keeps only the aggregate progress view (improving/flat/declining + movers). A single
athlete's own trend belongs on the athlete's Training page
(`/training-plans/[id]/athletes/[athleteId]`) — not enhanced in this pass.

---

## Standing verification

- `npx eslint` on changed files: 0 errors.
- `npx next build`: compiles clean.
- `live-regression.cjs`: **46 passed, 0 failed**.
- `panel-verify.cjs`: **12 passed, 0 failed**.
- Analytics achievements check: KPI = 11, chart present, Export CSV present.

## Backups

- `backups/dashboard-analytics-20261022-113302` (start of dashboard/analytics work)
- `backups/dashboard-partA-done-20261022-125811` (after Dashboard Part A)
- `backups/dashboard-analytics-complete-<stamp>` (after all parts)

## Open carried items (unchanged)
- Live admin password rotation before the panel demo.
- Athlete login role not built.
- 8 npm audit vulns intentionally not force-fixed.
