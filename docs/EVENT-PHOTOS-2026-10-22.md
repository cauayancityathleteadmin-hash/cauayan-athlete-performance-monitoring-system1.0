# Event photo documentation (Phase 1)

Date: 2026-10-22
Status: implemented, pending live verification

## What it does

Event plans now carry photo documentation. Two kinds of photos, on purpose:

| Category | Meaning | Sport | Athlete |
|---|---|---|---|
| `winner` | Winning moment for a sport (e.g. Gold — 100m Boys) | required | optional |
| `event` | Whole-event documentation (venue, program, crowd, team) | optional | — |

The gallery lives inside the existing event detail panel on `/event-plans`:
filter chips (All / Winners / Whole event), thumbnail grid, click to enlarge,
and delete. Nothing is replaced or overwritten — photos are additive.

## Permissions

- **Upload / delete:** admin, plus coaches attached to that event
  (a participant, or an approved applicant).
- **View:** any signed-in user, except photos of a `draft` event plan,
  which stay admin-only.
- Every upload and delete writes an `audit_logs` row
  (`event_photo_upload` / `event_photo_delete`).

## Files

- `prisma/schema.prisma` — `EventPhoto` model, `event_photos` table, relations on
  `EventPlan`, `Sport`, `Athlete`, `User` (`EventPhotoUploader`).
- `prisma/migrations/20261022173000_add_event_photos/migration.sql` — additive only
  (one new table, index, foreign keys), generated with `migrate diff`
  (`--from-config-datasource --to-schema`) and applied with `migrate deploy`.
- `pages/api/event-plans/photos/index.js` — `GET` (list by event), `POST` (upload),
  `DELETE` (remove). Session + CSRF + rate limit; Vercel Blob storage; 2.5 MB max;
  JPEG/PNG/WEBP only.
- `pages/event-plans.js` — `EventPhotos` component and its section in the
  event detail panel.

## Why it is not an athlete-model change

`EventPhoto` is event documentation. It does not touch athlete fields, so
`lib/athlete-import-headers.js` and the CSV import round-trip are unchanged.

## Verification checklist

- [ ] Admin can open an event, upload a winner photo (sport + optional athlete).
- [ ] Admin can upload a whole-event photo without a sport.
- [ ] Attached coach can upload and delete; unattached coach gets 403.
- [ ] Signed-in non-admin can view photos of a published (non-draft) event.
- [ ] Draft event photos are hidden from non-admins.
- [ ] Delete removes the row and the blob; audit log has both actions.
- [ ] Regression suite 46/46 and panel verification 12/12 still pass.
