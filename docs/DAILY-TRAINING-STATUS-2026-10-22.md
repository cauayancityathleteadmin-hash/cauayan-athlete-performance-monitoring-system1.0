# Daily Training Status — replacing session attendance

Date: 2026-10-22
Status: **Shipped** (stages 1–5 complete)

## Why

Cauayan athletes train individually — anywhere, anytime, following their assigned
plan. A session **roll-call** (present / late / excused / absent) therefore
mislabeled anyone who trained on their own as "absent", which made the attendance
number wrong and unfair.

Attendance was also effectively unused: nothing in the app ever *wrote* an
attendance row. The only source of `TrainingAttendance` rows was the seed script.

The honest question is not "who showed up to roll-call?" but **"did the athlete do
the training assigned for that day?"** That is answered by the existing plan
activity logs (`PlanActivityLog`), rolled up per day.

## What changed

### Data model (`prisma/schema.prisma`)
- `ActivityStatus` gained a value: `excused`.
- New enum `ExcuseReason { rest, sick, injured, excused }`.
- `PlanActivityLog` gained `excuseReason ExcuseReason?` (`excuse_reason`).
- Migration: `prisma/migrations/20261022100000_add_excused_activity_status`
  (applied with `migrate deploy`; generated via `migrate diff`).

Rest, sickness, injury and other excused reasons are recorded as `excused` and are
**never counted against the athlete**.

### Single source of truth (`lib/training-status.js`)
- `TRAINING_STATUS_META`, `EXCUSE_REASON_META`, `EXCUSE_REASONS`
- `rollUpDayStatus(logs)` → one honest status per day
  (trained / partly trained / not trained / excused / no plan)
- `summarizeTrainingDays(days)` → period totals + `disciplineRate`
  (excused and no-plan days are excluded from the rate)
- `buildTrainingDays(logs)`, `dayKeyUTC`, label helpers

### Coach workflow (`pages/training-plans/[id]/index.js`, AssessStudio)
- Cell status cycles **D → P → M → E → open**; `E` cell style added.
- Per-athlete **Excuse…** select (rest / sick / injured / excused) exempts the whole day.
- Top-bar **Mark sick day** / **Mark injured day** buttons.
- Save payload carries `excuseReason`; confirm dialog shows the excused count.
- Auto-suggested rating excludes excused activities.

### APIs
- `pages/api/plan-activity-logs/index.js` and `.../batch-assess.js` accept
  `status: "excused"` + `excuseReason`.

### Athlete page (`pages/training-plans/[id]/athletes/[athleteId].js`)
- "Attendance" tab → **Training days** (`#training-days`), a day-by-day table with
  status, reason and activity summary.
- "Sessions present" stat card → **Training days** card (trained count + training rate).

### Official reports (`pages/reports.js`)
- Section VII is now **"Training Plans, Activities and Daily Training Status"**.
- "Session Attendance Rate" KPI → **Daily Training Status** KPI (from real logs).
- "Recent Session Attendance" table → **Daily Training Status** table.
- Coach report "Attendees" column removed.
- Signature chain (Prepared by → Reviewed by → Certified Correct) and section
  numbering unchanged.

### Data preserved — archive
- `TrainingAttendance` table and all rows are **kept**; `lib/backup.js` still lists
  `training_attendances` so backups continue to include them.
- New admin-only, read-only archive: **`/admin/attendance-archive`**
  (`pages/admin/attendance-archive.js` + `pages/api/admin/attendance-archive.js`)
  with search, status filter, and CSV export (export is audit-logged).
- Sidebar link added under System & Account (admin only).

### Feature flag (`lib/feature-flags.js`)
- `attendanceFeatureEnabled()` reads `ATTENDANCE_FEATURE_ENABLED`
  (`1` / `true`). Preserved as a switch to bring the workflow back if ever needed.
  Currently unset (feature off).

## Deliberately NOT done
- **QR athlete self-upload of proof photos** — the biggest/riskiest piece (secure
  scoped, expiring tokens; one upload per athlete per day; server-side enforcement;
  upload-only). Deferred for a dedicated planning discussion.

## Verification
- `npx eslint .` → 0 errors / 0 warnings.
- `npx next build` → compiled successfully; new routes
  `/admin/attendance-archive` and `/api/admin/attendance-archive` present.
- Migration applied (`migrate deploy`, 29 → 30 migrations) and `prisma generate` OK.

## Notes
- `PlanActivityLog` / `PlanEvidence` are **not** athlete-model fields, so the athlete
  import template (`lib/athlete-import-headers.js`) rule does not apply here.
- Terminology rule honored everywhere: none of the derived "who trained" numbers are
  called "attendance"; they are "training status" / "training days" / "completion".
