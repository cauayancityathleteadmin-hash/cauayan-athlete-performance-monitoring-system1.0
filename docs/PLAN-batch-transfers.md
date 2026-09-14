# Batch Athlete Transfer Upgrade Plan

Status: planned (not started)
Owner: plan approved 2026-09-14

Companion plans: `PLAN-nav-ia.md` (sidebar), `PLAN-activity-metrics-progress.md`
(activity scoring + progress).

## Goal

Replace the per-athlete dropdown transfer flow with a batch, checklist-based
transfer center so a coach can move multiple athletes in one transaction, while
keeping today's approval governance fully intact.

## Current state (facts from code)

- Coach flows live inline in `next-app/pages/athletes.js`:
  - `RequestTransferForm` (:590-645) — pick ONE athlete from own-roster `<select>`,
    ONE coach, reason. POST `/api/transfers` -> one `AthleteTransfer` row.
  - `ClaimUncoachedForm` (:774-820) — same, one uncoached athlete at a time.
  - `CoachRequestsPanel` (:647-772) — compose forms + Incoming + Sent lists.
  - `AdminClaimsPanel` (:822-923) — pending claims + history.
  - Admin `TransferPanel` (:487-580) — already checkbox-based bulk reassign,
    instant (no approval), calls `POST /api/athletes/transfer`.
- API:
  - `pages/api/transfers/index.js` — GET `{claims,history}` (admin) /
    `{received,sent}` (coach); POST coach-only single transfer/claim. CSRF +
    `requireRole(session,"coach")` + audit + `notifyCoach`.
  - `pages/api/transfers/[id].js` — decide approve/reject/cancel. Permissions:
    claim -> admin; transfer -> receiving coach; cancel -> requester/admin.
    On approve: reassigns `athlete.coachId`, writes `AthleteCoachHistory`, audit,
    notify.
  - `pages/api/athletes/transfer.js` — admin-only bulk reassign (max 500).
- Model `AthleteTransfer` (schema.prisma:829-850): one row per athlete; no
  grouping column (`fromCoachId=null` = uncoached claim -> admin approval;
  `fromCoachId=<coach>` = coach-to-coach -> target approval).
- Notifications via `lib/notify.js` `notifyCoach` (email + SMS per coach flags).
- Rate limiting per endpoint via `lib/rate-limit.js`; `validId`/`requireCsrf`
  via `lib/api-security.js`.

## Pain today

- Moving N athletes = N dropdown trips + N approvals on the other side.
- Plain `<select>` with no search/checklist -> wrong-athlete risk on big rosters.
- No selection summary/preview before submit.
- Incoming side has only per-row Accept/Reject.
- Sidebar companions: see `PLAN-nav-ia.md` (Training sub-menu, no scrolling) and
  `PLAN-athlete-directory.md` (browse any coach's athletes, filtered by coach —
  no dropdown pickers).

## Approved design

### Coach compose flow (replaces both forms in `CoachRequestsPanel`)

Two tabs:
1. **My roster -> another coach** (creates transfer requests, target approves)
2. **Uncoached athletes -> me** (creates claims, admin approves)

Per tab:
- **Checklist table**: athlete name, code, sport, current coach; searchable;
  "select all matches" checkbox; live "N selected" counter.
- **Target picker — NO dropdowns, ever**. Searchable coach LIST rendered as
  selectable cards/rows (radio-style highlight on click: name, sports, roster
  size). Excludes self and inactive coaches. The picked coach's name appears on
  the submit button. Claims tab has no target picker, just "will join your
  roster".
- **One submit button**: "Transfer N athletes to Coach X" -> confirmation modal
  listing all N names -> single POST `/api/transfers/batch`.
- **Result feedback**: "N requests sent · M skipped (already pending) · K not
  applicable" summary, no full reload.

### Approving side (bulk decision, in scope)

- Incoming requests grouped by requesting coach with **Accept all / Reject all**;
  per-row Accept/Reject retained.
- New `POST /api/transfers/batch-decision` `{ ids: [], decision }`:
  - All ids must be decidable by the caller (claims -> admin; transfers ->
    receiving coach), all pending, caller-consistent type.
  - Per-id re-checks (athlete still coach-consistent), `$transaction`, one audit
    entry, notify each affected coach once.
- Admin `AdminClaimsPanel`: same Accept all / Reject all grouping by requesting
  coach.
- Admin `TransferPanel` reuses the improved checklist component for consistency
  (admin reassign stays instant/no-approval).

### API additions

`POST /api/transfers/batch` (coach only, CSRF, rate-limited):
- Body `{ athleteIds: number[], toCoachId, type? }` (`"transfer"` | `"claim"`).
  `type` optional; derived per athlete (`coachId === null` -> claim).
- Cap `MAX_BATCH = 50`.
- Inside `prisma.$transaction`: dedupe ids, validate subject ownership /
  uncoached, active target, target != self, skip already-pending duplicates.
- Creates N pending `AthleteTransfer` rows; one audit entry (action
  `batch_transfer_request` / `batch_claim`) with counts; `notifyCoach` once to
  the target (transfer) or none (claim; admin sees via GET).
- Response `{ created: number, skipped: [{ athleteId, reason }] }`.
- Return 400 "Nothing to send" if zero valid ids.

### Selection list component

Extract a reusable `AthletePickList` (also used by admin `TransferPanel`):
checkbox rows + search + select-all + counter. **Rule: no `<select>`/dropdown
anywhere in this feature** — athlete selection is checklist rows, coach
selection is selectable cards/rows. CSS additions in `Dashboard.module.css`.

## Phase 2 (deferred, optional)

- `AthleteTransfer.batchKey` column (nullable) to group rows transactionally ->
  enables group-level retract ("Withdraw batch"), group notification, and
  group-level audit/reporting.
- "Withdraw request" for a whole sent batch.

## Verification

- ESLint on changed files (0 errors), `npm run build`, plain `prisma db push`
  (no schema change expected for Phase 1).
- Smoke: coach batch-transfer 3 athletes -> rows created; target coach
  batch-decision accepts 2/rejects 1; admin claims batch-approve; audit rows and
  single per-target notification verified.

## Files to touch

- `next-app/pages/athletes.js` (compose center, incoming grouping, panel wiring)
- `next-app/components/AthletePickList.js` (new)
- `next-app/pages/api/transfers/batch.js` (new)
- `next-app/pages/api/transfers/batch-decision.js` (new)
- `next-app/styles/Dashboard.module.css` (list/card/group styles)