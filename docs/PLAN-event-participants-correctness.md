# Event participation correctness (output scan fix)

## Problem
The Event Plans participation UI showed wrong numbers and names:

1. **Count was raw row count, not people.** `count={(plan.participants || []).length}` counted participant *rows*.
   - A coach-approved-for-N-sports creates one delegation row per sport (e.g. Coach Santiago = 3 rows on the Festival) so one person could be counted 3× as a "participant".
   - An athlete enrolled in 2 sports under one plan was counted twice.
2. **Names omitted coaches who have athletes but no delegation row.** The roster built coach groups only from `participantType === "coach"` rows. Coaches whose athletes were enrolled but who had no explicit delegation row (and all their athletes' *names*) never appeared, while still being counted in the headline number (Festival: 13 counted, only 8 athletes + 3 coaches listed; Closing: 2 counted, 0 names shown).
3. **Coach's own delegation row counted but invisible** in the coach view.
4. **Analytics counted removed participants** (`eventParticipant.findMany` had no `status` filter), so "Event participants by type" included rows that were later removed.
5. **Reports listed removed participants** on athlete/coach report cards and in coach `_count.participants`.
6. **Coaches could add athletes of sports outside the plan's sport list** (picker had no filter, API had no guard).

## Fixes

### `pages/event-plans.js`
- New `groupParticipation(participants)` helper: groups all active rows by `coachId` (both delegation rows and athlete rows), one athlete entry per `athleteId` with sports joined, one delegation-sports list per coach.
- `participationCount(participants)` renders the toggle as `"N athletes · M coaches"` (distinct people), which always equals what the roster renders.
- `ParticipantRoster`/`CoachRow` rewritten on the grouped model: every coach with any active row appears (delegation chip shown when they have a delegation row, `No athletes enrolled` otherwise); coach view shows `My athletes (K)` + delegation note + `Other coaches (M)`.
- Picker (`available`) restricted to the coach's active athletes whose sport is in the plan's sports; empty-state copy updated.
- gSSP adds `sportId` to the coach's athletes select for the filter.

### `pages/api/event-plans/participants.js`
- POST now rejects athletes whose sport is not part of the plan's sports (`400`).

### `pages/analytics.js`
- `eventParticipant.findMany` filtered to `status: "active"`.
- `participantsAgg` computed over distinct people: athletes by `athleteId`, coach delegations by `coachId` (multi-sport delegation rows collapse to one coach).

### `pages/reports.js`
- Both participant includes (athlete report + coach report) filtered to `status: "active"`.
- Coach `_count.participants` filtered to `status: "active"` (Prisma filtered relation count).

### `pages/change-password.js`
- Added the missing convention `<h1>` page title (top-level page compliance; `pages/index.js` is a redirect and needs none).

## Verification (live DB, read-only)

Per plan, after fix (Festival open 2026-10-10):
| Event | Old count | Old names shown | New button | New roster |
|---|---|---|---|---|
| Festival 2026 | 13 (rows) | 8 athletes + 3 coaches (2 coaches' athletes missing) | `8 athletes · 4 coaches` | all 8 athletes under 4 coach groups incl. previously-invisible coach; Santiago delegation = Athletics, Basketball, Volleyball (one group) |
| Closing | 2 | none | `2 athletes · 1 coach` | Cruz group with 2 athletes |
| Swimming | 5 | — | `4 athletes · 1 coach` | Santos + 4 athletes |
| PRISAA | 3 | — | `2 athletes · 1 coach` | Ramos + 2 athletes |

Coach view (Elena Reyes, approved on Festival): `My athletes (2)` + `You're enrolled as delegation (Basketball).` + `Other coaches (3)`.

Analytics: participants total now 21 (16 distinct active athletes + 5 distinct coaches; removed row excluded; Santiago's 3 delegation rows → 1 coach).

Sync scan: top-level `<h1>` present on all pages except `index.js` (redirect); inline container styling on-token; no off-theme colors found in pages/components; reports/analytics hidden stale rows.