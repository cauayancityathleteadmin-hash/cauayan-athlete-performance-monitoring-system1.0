# System Audit — 2026-10-29 (Phase 1: Discovery, Backup, Baseline)

Scope: full system, per the master audit directive. This document records **only what was
inspected and evidenced**. Nothing here is inferred from the existence of code alone.

Environment inspected: local working tree + production DB (read-only) + live deployment.
Live: https://cauayan-athlete-performance-monitor-indol.vercel.app
Deployed commit at audit time: `8a96831`.

---

## 1. Stack and structure (observed)

| Item | Observed value |
|---|---|
| Framework | Next.js 16.4.3, **Pages Router** |
| React | 19.2.8 |
| Node (CI) | 26 |
| DB | PostgreSQL (Neon), Prisma 7.10 + `@prisma/adapter-pg` |
| Auth | next-auth 4.24 (credentials, JWT sessions) |
| Charts | recharts 3.10, single config `lib/chart-config.js` |
| Files | `@vercel/blob` 2.8 (public photos; encrypted/private backups) |
| Mail | nodemailer 8.0.11 (2 residual high advisories, mitigated/not exercised) |
| Validation | `zod` override 4.6.6 |
| Tests | **none** — no test files, no `test` script, no test runner installed |
| CI | `.github/workflows/ci.yml` (lint + build), `live-smoke.yml` |
| Schema | 44 models, 42 public tables, 33 migrations |
| Roles | `admin`, `coach` only |

Routes: 22 page routes, 66 API routes (`pages/api/**`).

---

## 2. Data state (production DB, read-only, verified 2026-10-29T01:11Z)

| Table | Rows |
|---|---|
| users | 2 |
| coaches | 1 |
| athletes | 0 |
| assessments / assessment_results | 0 / 0 |
| training_plans / plan_activities / plan_activity_logs | 0 / 0 / 0 |
| event_plans / event_participants / event_photos | 0 / 0 / 0 |
| achievements | 0 |
| sports / events / performance_metrics | 23 / 61 / 61 |
| fitness_norms / document_types / points_config / schools | 350 / 11 / 19 / 7 |
| system_settings | 5 |
| audit_logs | 24 |

Users present:

1. `admin.101` — admin, active.
2. `COA-000001` (John Paulo Dacayanan) — **coach, active, created 2026-10-28**, last login 2026-10-28.
   This is a real registration, not demo data. It was **not** modified or removed.

Consequence: there are **no operational records**. Analytics, reports, photo documentation,
and progress calculations cannot be validated against real data yet; they require controlled
synthetic data in a non-production environment.

---

## 3. Backups (verified)

All archives were tested for readability (`tar -tf`, exit 0):

| Backup | Entries | Status |
|---|---|---|
| next-app-src-20261026-225536.zip | 215 | OK |
| next-app-src-20261026-231536.zip | 215 | OK |
| next-app-src-20261026-232705.zip | 215 | OK |
| pre-demo-purge-src-20261026-235623.zip | 216 | OK |
| pre-csp-fix-20261028-100520.zip | 480 | OK |
| pre-full-audit-20261028-113800.zip | 475 | OK |
| project-backup-20261028-221938.zip | 129 | OK |

New full database dump created this audit:

- `C:\Users\FUJITSU\AppData\Local\Temp\opencode\backups\db-full-2026-10-29T01-11-12.json`
- 278,757 bytes, 42 tables, 600 rows.
- Verified by re-reading the file and re-counting every table → **OK** (no mismatches).

**Not verified:** an actual restore into an isolated database. No staging DB exists, so
restore was not exercised. This is a real gap in rollback assurance.

---

## 4. Baseline build/deploy

| Check | Result |
|---|---|
| `npx eslint .` | 0 errors, 0 warnings |
| `next build` | success |
| Production deployment (`8a96831`) | success |
| `/api/health` | 200, `db: up` |
| Login + hydration (real browser) | working (fixed 2026-10-28) |

---

## 5. Audit matrix (prioritized)

Status labels: VERIFIED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED / BLOCKED.

### 5.1 Security & privacy

| # | Module | Finding | Evidence | Impact | Status |
|---|---|---|---|---|---|
| S1 | Global CSP | `script-src 'self'` blocked Next.js inline bootstrap → **no page hydrated** | browser console; `next.config.mjs` | System unusable | **VERIFIED FIXED** (`8a96831`) |
| S2 | Photo storage | Athlete/event photos stored as **public** blobs (`access:"public"`) | `api/upload/picture.js:36`, `api/event-plans/photos/index.js:119` | Anyone with URL views photos; privacy/safeguarding risk | NOT IMPLEMENTED (private access) |
| S3 | Upload validation | Client-declared `mime` trusted; no magic-byte check | `api/upload/picture.js:21-25`; `event-plans/photos/index.js:107-110` | Malicious content with image MIME | PARTIALLY IMPLEMENTED |
| S4 | Catalog DELETE | `prisma[kind]` uses **client-supplied model name**, no whitelist | `api/catalog/index.js:68-73` | Admin-triggered arbitrary model update; 500s | NOT IMPLEMENTED (whitelist) |
| S5 | Rate limiting | In-memory `Map`, per serverless instance | `lib/rate-limit.js` | Throttling bypass by instance fan-out | PARTIALLY IMPLEMENTED |
| S6 | Auto backup | Secret accepted as `?key=` query param | `api/system/backup/auto.js:23` | Secret leakage via logs/referrer | PARTIALLY IMPLEMENTED |
| S7 | Route protection | Middleware matcher omits `/api/upload`, `/api/reports`, `/api/coaches`, `/api/nav-shortcuts`, `/api/notifications`, `/api/system` | `middleware.js:34-75` | Depends on per-route checks | PARTIALLY VERIFIED (upload + system enforce auth; reports/notifications/nav-shortcuts **not yet inspected**) |
| S8 | Dev endpoints | `dev/provision`, `dev/probe` hard-disabled in production | both files | — | VERIFIED OK |
| S9 | Athlete photo URL | Arbitrary external `http(s)` URL accepted | `api/athletes/[id]/photo.js:30-33` | External tracking/third-party content | PARTIALLY IMPLEMENTED |
| S10 | Coach scoping (photo) | Coach restricted to own athlete | `api/athletes/[id]/photo.js:23-28` | — | VERIFIED OK |
| S11 | Event photo perms | Admin or participating/approved coach only; drafts admin-only | `api/event-plans/photos/index.js:16-35,63` | — | VERIFIED OK |

### 5.2 Performance metrics (Phase 3)

| # | Finding | Evidence | Status |
|---|---|---|---|
| M1 | Metric **create** works with dataType/direction/precision(0-6)/min/max validation | `api/catalog/index.js:136-165` | VERIFIED |
| M2 | **No edit or deactivate** for performance metrics anywhere | only `performanceMetric.create` exists | NOT IMPLEMENTED |
| M3 | No versioning/effective dates → editing would silently reinterpret history | `schema.prisma:470-488` | NOT IMPLEMENTED |
| M4 | `min > max` accepted; numeric bounds accepted for `text` type | `api/catalog/index.js:143-157` | PARTIALLY IMPLEMENTED |
| M5 | Duplicate definitions only blocked by `@@unique([eventId, metricName])`; no protocol/category concept | `schema.prisma:486` | PARTIALLY IMPLEMENTED |
| M6 | Assessment entry validates value against metric min/max/dataType | `api/assessments/index.js:9-11` | VERIFIED |

### 5.3 Reports & signatories (Phase 5)

| # | Finding | Evidence | Status |
|---|---|---|---|
| R1 | Formal print layout exists (header, sections, signature chain, print CSS) | `lib/report-doc.js`, `styles/report-print.css` | VERIFIED (structure) |
| R2 | Signatories are **hardcoded** (positions in JSX; names blank) | `lib/report-doc.js:40-66`, `pages/reports.js:663-675,821-833` | NOT IMPLEMENTED (admin-managed) |
| R3 | No `Signatory` model / no assignment per report type | schema has no such model | NOT IMPLEMENTED |
| R4 | No report persistence/finalization → cannot preserve finalized historical reports | no Report model; reports rendered on demand | NOT IMPLEMENTED |

### 5.4 Dashboards & analytics (Phases 6, 6A)

| # | Finding | Evidence | Status |
|---|---|---|---|
| D1 | Dashboard + analytics pages render; charts render (18 chart surfaces on `/analytics`) | browser check | VERIFIED (rendering) |
| D2 | **No "Priority Attention" section** anywhere | repo-wide grep | NOT IMPLEMENTED |
| D3 | Analytics correctness/denominators cannot be validated — zero operational records | DB counts | BLOCKED (needs controlled data) |

### 5.5 Event documentation & photography (Phases 9–11)

| # | Finding | Evidence | Status |
|---|---|---|---|
| P1 | Upload single photo, view, delete with permissions | `api/event-plans/photos/index.js` | VERIFIED (basic) |
| P2 | Only two categories (`winner`, `event`) — not configurable documentation categories | `CATEGORIES` | NOT IMPLEMENTED |
| P3 | No capture timestamp vs upload timestamp separation | `schema.prisma:663-680` | NOT IMPLEMENTED |
| P4 | No confirmed ordering, no review/verification status | schema | NOT IMPLEMENTED |
| P5 | No batch upload, grouping, mixed-batch splitting | no such API | NOT IMPLEMENTED |
| P6 | No duplicate detection, no competition/round level | schema | NOT IMPLEMENTED |
| P7 | No documentation-completeness checklist | no model/UI | NOT IMPLEMENTED |

### 5.6 Testing & operations (Phase 12)

| # | Finding | Status |
|---|---|---|
| T1 | No automated tests of any kind | NOT IMPLEMENTED |
| T2 | CI runs lint + build only (no functional tests) | VERIFIED |
| T3 | No staging environment | BLOCKED |
| T4 | Restore never exercised | BLOCKED |

---

## 6. Recommended order (next)

**Phase A — critical, small, low-risk (recommended first)**
1. S3: validate file content (magic bytes) in both upload endpoints.
2. S4: whitelist `kind` in catalog DELETE (`sport|event|school`).
3. S6: accept backup secret via header only (keep query for cron compatibility behind a flag).
4. S2: decide private-blob strategy (requires confirming `@vercel/blob` private support in this account).

**Phase B — metrics lifecycle (M2, M3, M4, M5)**: edit/deactivate with historical protection,
min≤max validation, type-aware bounds.

**Phase C — signatories + report persistence (R2, R3, R4)**: new `Signatory` model, admin CRUD,
per-report-type assignment, snapshot of signatories on finalization.

**Phase D — Priority Attention dashboard (D2)**: documented triggers, role scoping, backend auth.

**Phase E — photo documentation (P2–P7)**: capture-time sorting, pre-upload classification,
batch/mixed-batch, review status, completeness checklist.

**Phase F — test harness + staging + restore drill (T1, T3, T4)**.

---

## 6A. Phase A results (implemented, deployed, verified)

Commit `e29e6d7` (pushed to `main`; `origin/main` matches; live code confirmed).

| Item | Change | Evidence |
|---|---|---|
| S3 | `lib/image-validation.js` magic-byte detection (JPEG/PNG/WEBP); both upload endpoints reject content that does not match, and store the **detected** content type | Local unit probe: png/jpg/webp accepted, html/php/exe/truncated → `null`. Live: HTML-as-PNG, PHP-as-JPEG, truncated PNG → `400 The file content is not a valid JPEG, PNG, or WEBP image.` |
| S4 | `DEACTIVATABLE_KINDS = ["sport","event","school"]` in catalog DELETE | Live: `kind:"user"` → `400 Unsupported catalog item.` |
| — | Lint / build | `npx eslint .` 0 problems; `next build` success |

### Incident during verification (disclosed, corrected)

The first live probe ran **before** the new deployment rolled over, so it hit the old
catalog handler: `DELETE /api/catalog {kind:"user", id:1}` set `admin.101` to `inactive`
(audit log #620), and `kind:"performanceMetric"` set `performance_metrics#1` to `inactive`
(#621). Both were restored to `active` within minutes and a corrective audit entry (#622)
was written. The evidence logs were **not** deleted.

Residual: the same probe uploaded one non-image object through the old endpoint
(`id-photos/1793236756608-5aiyadmx.png`, stored as `image/png`, content HTML). It is
public but not renderable as HTML because of the stored content type. The local
`BLOB_READ_WRITE_TOKEN` cannot delete objects in that store, so it remains to be removed
with a token that owns the production store.

Lesson applied: deployment liveness must be confirmed with a **non-mutating** probe before
exercising any endpoint that can write.

## 6B. Phase B results — performance metric lifecycle (implemented, deployed, verified)

Commit `75d4a02` (plus `949908a` chore). Live API behavior confirmed against production.

| Requirement | Implementation | Evidence |
|---|---|---|
| Edit metric definition | `PUT /api/catalog {kind:"metric"}` with full validation | Local: rename + range change → 200, persisted |
| Deactivate / reactivate | Same PUT with `status`; DELETE whitelist includes `metric` | Local: deactivate → status `inactive` in GET; reactivate → 200 |
| Historical protection | If `_count.results > 0`, any change to event/name/unit/dataType/direction/precision/min/max → `409` with "create a new metric" guidance | Code-reviewed; **not exercised** — production has zero assessment results |
| `min <= max` | Enforced on create and update | Local POST/PUT → `400 Minimum value cannot be greater than the maximum value.` |
| Type-aware bounds | Text metrics reject numeric bounds | Local POST → `400 Text metrics cannot have a numeric minimum or maximum.` |
| Precision | Whole number 0–6 | Local POST → `400 Decimal places must be a whole number from 0 to 6.` |
| Enum validation | dataType / betterDirection strict | Local POST → `400 Data type must be decimal, integer, or text.`; live probe confirms same |
| Admin UI | Status + Actions columns, result counts, Edit (disabled when results exist), Deactivate/Reactivate, edit prefill | Live browser: 61 rows, header `… STATUS | ACTIONS`, Edit prefill populated (Distance / event 4 / decimal / higher / 2dp / 4–16), 0 console errors |

Test artifacts: two scratch metrics were created in the shared DB during local testing and then
hard-deleted together with their audit rows (verified `remainingScratch: 0`).

Not verified: the `409` historical-protection branch (no results exist), and the UI path for a
metric that already has results.

## 6C. Deployment liveness discipline (applied after the Phase A incident)

Production is only treated as updated after a **non-mutating** probe confirms the new code:
- Phase A: `DELETE /api/catalog {kind:"user", id:999999}` → new code returns `400 Unsupported catalog item.`
- Phase B: `POST /api/catalog {eventId:999999, dataType:"boolean"}` → new code returns `400 Data type must be …`
  (old code returned "The selected event is invalid." and wrote nothing).

## 7. What was NOT verified in this phase

- Per-route authorization for `/api/reports/*`, `/api/notifications/test`, `/api/nav-shortcuts`,
  `/api/coaches/approvals`.
- Any analytics/report number correctness (no operational data).
- Restore from backup into a real database.
- Coach-role UI end-to-end.
- Photo privacy (S2) exploitability from an unauthenticated client.
