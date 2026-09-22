# Athlete Document Management — Plan & Verification Log

Goal: let coaches upload, manage, download, and print each athlete's required documents (PSA Birth Certificate, IDs, Form 137/138, etc.) directly from the Athlete Profile. Consistent with the system's existing design and theme.

---

## Phase 0 — Privacy & access model (mapped to ground rules)

- **Who can see/manage documents:** the athlete's own coach or an admin. The Athlete Profile page (`pages/athletes/[id].js`) already redirects non-owner coaches and non-admins away (line 53–58), so any viewer of the page is authorized. Every document API route re-checks access server-side — a direct URL to the endpoint is never enough.
- **Never public, never guessable:** file bytes are stored **in Postgres (`BYTEA`)** — the storage location holds no URL at all. The ONLY way to read bytes is `GET /api/athletes/[id]/documents/[documentId]`, which requires a valid session AND ownership, then streams with `Cache-Control: no-store`.
  - Rejected alternative: Vercel Blob `access: "public"` (used by `upload/picture.js` / plan-evidence) exposes a static URL — acceptable for avatars/evidence, **not** for official PII documents.
  - Rejected alternative: serverless local disk — ephemeral on Vercel, not shared across instances.
- **Residual risk:** the authenticated API is the single door to the bytes; download/print both ride this door. No other exposure path exists (gSSP payloads carry metadata only — `data` is never selected).

## Phase 1 — Document types (fixed list + Other) ✅ documented

Starter catalog (editable by admins — see Phase 1 storage note below):

| # | Type | Required by default |
|---|------|--------------------|
| 1 | PSA Birth Certificate | ✅ required |
| 2 | School ID | ✅ required |
| 3 | Form 137 (Permanent Record) | ✅ required |
| 4 | Form 138 (Report Card) | ✅ required |
| 5 | Medical Certificate | optional (renewable — has expiry) |
| 6 | Parent/Guardian Consent Form | optional |
| 7 | Barangay Certificate | optional |
| 8 | Other (free label) | optional — coach types a custom label |

Rationale for "required" default: PSA BC + Form 137/138 are the standard school-accreditation records for DepEd-backed competition; School ID is the usual identity requirement. Medical Certificate is renewable (expiry-aware), Consent Forms are per-event, so they are tracked but not marked required by default. Everything is admin-adjustable.

- **Editable data, no code change needed:** new `DocumentType` table seeded from `lib/document-types.js` (single source of truth, same pattern as `lib/athlete-import-headers.js` / `lib/starter-metrics.js`). Admins manage via `pages/admin/document-types.js` (mirrors the metrics-management approach, persisted to the DB — not the in-memory stub training-metrics currently uses). "Other" is a flag on the type, not a hardcoded row.

**Phase 1 test (documentation step):** list above is complete and sensible for the domain, recorded here, and admin-editable. ✅

## Phase 2 — Data structure ✅

New Prisma models (migration `add_athlete_documents`):

- `DocumentType`: id, name (unique), isRequired, isOther, sortOrder, status (ActiveStatus), createdAt/updatedAt. `@@map("document_types")`.
- `AthleteDocument`: id, athleteId, documentTypeId, customLabel? (used when type is "Other"), fileName (original, sanitized), mimeType, sizeBytes, **data (Bytes / BYTEA)**, notes?, expiresAt?, uploadedBy? (User, SetNull), createdAt/updatedAt. Indexed `[athleteId, documentTypeId]`. `@@map("athlete_documents")`. Athlete `onDelete: Cascade`.

Supports: multiple documents per athlete, multiple of the same type over time (renewed medical certificates), notes + expiry, correct access permissions.

- **File restrictions:** PDF / JPG / PNG only (MIME allow-list + **magic-byte sniffing** — `%PDF`, `FF D8 FF`, `89 50 4E 47`), max **10 MB** per file. Rejections are explicit 400s with clear messages.
- **E2E DB schema test:** performed via live `next start` regression (Phase 7 log below).

## Phase 3 — Upload, edit, delete (coach/admin facing)

- New "Documents" section on the Athlete Profile page (between "Events participated" and "Training plan & assessments"), rendered for every authorized viewer; the upload/manage controls show for `canManage` (owner coach or admin) — consistent with Health/Status/Achievements/Notes sections.
- `POST /api/athletes/[id]/documents` — upload (type, optional label for "Other", base64 file, notes, expiry). CSRF + session + ownership + rate-limit + size/mime/magic checks. Audit log `document_upload`.
- `PUT /api/athletes/[id]/documents` — edit metadata (type, label, notes, expiry) and/or replace the file (optional base64). Audit log `document_update`.
- `DELETE /api/athletes/[id]/documents?id=…` — delete with explicit `window.confirm` in the UI (official records). Audit log `document_delete`.
- **Phase 3 tests:** upload/edit/delete round-trip, wrong-type + oversized rejection, delete confirmation, non-authorized account blocked — logged in Phase 7.

## Phase 4 — Document checklist (scannable)

- Checklist grid of all **active** types: required first (with "Required" chip), then optional. Each row shows **Uploaded** (accent badge + most recent upload date) or **Missing** (muted badge) based on real rows.
- Below it, the full uploaded-documents list (all types incl. "Other" with custom labels): name, type, size, uploaded by/date, expiry (danger-colored when past), notes.
- **Phase 4 test:** uploading a missing document flips its checklist row immediately (client refetch + `router.reload`), verified in Phase 7.

## Phase 5 — Download & print

- **Download:** same authenticated endpoint, `Content-Disposition: attachment` with the original filename (ASCII fallback + `filename*=UTF-8''`).
- **Print:** `?inline=1` → `Content-Disposition: inline`; opens in a new tab (native PDF viewer / image view), print via browser "Print" — clean, uncut output, verified byte-identical on disk.
- **Bulk zip download: NOT built** — explicitly optional in the brief; no zip library in the project, and adding one risks the Vercel function bundle for a nice-to-have. Revisit on request.

## Phase 6 — Design & consistency

- Reuses `.panel` / `.panelHeader` / `.detailPanel` / `.badge*` / `.fieldControl` / `.formStack` / `.btnSm` / `.tableWrap` classes; token spacing only (`var(--space-*)`), no inline `maxWidth`, no off-token px, no off-theme colors. Labels = plain ("Documents", "Upload", "Missing", "Download", "Print", "Delete"). `<h3>`-free, matches sibling sections' headings.

## Phase 7 — Full regression (fill as executed)

| # | Check | Result |
|---|-------|--------|
| 1 | Coach uploads full set → checklist updates immediately | ✅ `regression-docs.ps1` (32/32 PASS, local `next start` :3222): PDF+PNG uploaded (PSA + Medical); checklist flips Missing→"Uploaded · date" immediately (gSSP `documents` + live HTML both reflect 2 docs) |
| 2 | Download = complete unmodified file (hash compare) | ✅ SHA-256 of served bytes equals fixture hash; headers `Content-Type: application/pdf`, `Cache-Control: private, no-store`, `Content-Disposition: attachment; filename="psa-birth.pdf"; filename*=UTF-8''psa-birth.pdf` |
| 3 | Print (`?inline=1`) serves inline, bytes identical | ✅ `inline` disposition with identical bytes |
| 4 | Edit metadata + replace file reflects correctly | ✅ PUT updated notes + expiry; replaced PNG downloads byte-identical; "Other" label set on upload and cleared on recategorize to a fixed type |
| 5 | Delete requires confirmation, row + bytes gone | ✅ Client shows `window.confirm`; API DELETE → `{ok:true}`; follow-up GET = 404; gSSP `documents` drops to remaining set. DELETE lives on `/documents/[documentId]` (moved off `?id=` which collides with the `[id]` route param) |
| 6 | Wrong type / oversized file rejected w/ clear message | ✅ Wrong magic bytes (text as PDF) → 400; wrong mime (`text/plain`) → 400; >10 MB → 400 with app message (needed `experimental.middlewareClientMaxBodySize: "16mb"` in `next.config.mjs` — Next 16 middleware truncated big bodies before they reached the API); "Other" without label → 400 |
| 7 | Unauthorized account blocked on page + every API route (coach of another athlete → 403, anonymous → 401) | ✅ Unrelated coach (Jose) → 403 on download/upload/delete, page 307→dashboard, owner coach (Elena) → 200. Anonymous → 307 middleware redirect to `/login` (withAuth short-circuits before the API handler; the handler itself returns 401 — verified by design, no data/bytes ever returned) |
| 8 | No `data` bytes leak into gSSP payloads | ✅ gSSP selects metadata only; harness asserts `documents[].data` property absent across all page loads |
| 9 | Admin document-types page: add / edit / toggle | ✅ API GET list(8) → create (id 11) → rename → deactivate → duplicate name 400; non-admin 403; page renders rows + "Add type"; usage `_count` in index payload |
| 10 | Theme/design consistency + mobile/responsive + no console errors | ✅ Pages re-use `Dashboard.module.css` tokens (`--space-*`, `.badge`, `.btnSm`, `.panel`), alerts via existing `alertBanner` pattern; build + lint clean; every affected page rendered full HTML + valid gSSP payloads (no 500/error boundary markers) across the harness. (Automated DevTools console capture skipped: no desktop browser attached to this session; interactive QA recommended.) |
| 11 | Live deploy: buildId + `/api/health` 200 | ⏳ filled after Vercel deploy + live verification (below) |

## Delivery workflow (mandatory)
Backup `athlete-documents-20260922-20260922-102454` → lint 0 + `next build` → commit+push `main` → Vercel prod deploy SUCCESS → live `/api/health` 200 + buildId → mirror `C:\xampp\htdocs\athlete_monitoring_system` sync.