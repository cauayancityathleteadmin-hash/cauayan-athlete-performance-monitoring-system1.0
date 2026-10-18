# System Audit Report & Update Plan
**Date:** October 18, 2026
**Repo:** `main` @ `7ce1b7d` — deployed, live healthy, mirrors synced
**Method:** 3 parallel audits (security, code-quality/scalability, UX) + direct verification of every critical finding
**Backup:** `Temp\opencode\backups\backup-20261018-180223` + git tag `backup-audit-20261018`

---

## 1. The honest one-minute summary

The system is **fundamentally sound** — good auth, good schema indexes, no SQL injection, no XSS, strong headers, zero `console.log` litter, zero commented-out cruft. But three real problems were found:

1. **Two critical security holes around backups** — anyone could trigger a full database download (passwords hashes, athlete data) with a spoofed header, and the download link itself was public. **Both fixed and deployed today.**
2. **The big pages will not scale past a few hundred athletes** — `reports`, `athletes`, and `dashboard` fetch far too much data per page view. Not broken now, but will break with growth. Needs a planned refactor.
3. **Small user-visible bugs** — coaching notes never showed on athlete profiles (fixed today), no custom 404/500 pages, mobile menu glitches, success messages disappear too fast.

---

## 2. What was scanned

| Area | Coverage |
|---|---|
| Security | 57 API routes, auth config, middleware, CSP/headers, rate limiting, file uploads, backup/restore, secrets |
| Code quality | Data-fetching patterns, schema indexes, error handling, largest page components, dead code, API consistency |
| UX/features | Navigation, loading/empty/error states, mobile responsiveness, forms, accessibility, feedback, exports |
| Dependencies | `npm audit` (18 → 8 vulns), unused packages |
| Live site | All public pages + health endpoint, Vercel deployment, mirrors |

---

## 3. FIXED TODAY (committed, deployed, verified)

### Security fixes
| ID | Severity | Issue | Fix |
|---|---|---|---|
| CR-01 | 🔴 Critical | Backup endpoint trusted the spoofable `x-vercel-cron` header → unauthenticated full DB backup | Cron path now requires `Authorization: Bearer <CRON_SECRET>`; spoofed header alone gets 401 |
| CR-02 | 🔴 Critical | DB snapshots stored as **public** blobs with predictable names | `access: "private"` + random suffix; downloads go through authenticated server path |
| H-01 | 🟠 High | Dev provision route (creates admin `Admin123!`) was **armed in production** (verified live) | Hard-disabled in production — always 404 regardless of key |
| H-03 | 🟠 High | CAPTCHA failed **open** on network errors | Now fails closed: verification error → reject |
| M-03 | 🟡 Med | Approval codes from `Math.random()` (predictable) | Now `crypto.randomInt()` (CSPRNG) |
| M-07 | 🟡 Med | Middleware missed `/training-plans`, `/standings`, `/reports`, `/coach-approvals` + several APIs | Matcher extended to all authenticated routes |
| M-09 | 🟡 Med | `unsafe-eval` in production CSP | Dev-only now; production CSP is clean |
| — | 🧹 | `pages/api/dev/probe.js` in production | Disabled in production |

### Bug fixes
| ID | Issue | Fix |
|---|---|---|
| Q-H3 | **Coaching notes never displayed** — GSSP never fetched the `notes` relation, so profiles always said "No coaching notes yet" even after saving | Added the missing relation include |

### Performance (schema)
6 new indexes matching real query shapes: attendance by athlete, audit by action/entity, applications by coach+status, document & reset-token expiry scans. **Migration applied to production DB.**

### Hygiene
- 17 leftover diagnostic scripts deleted (`check_*.cjs`, `fix_*.js`, `find_env_keys.ps1`, etc.)
- Unused `resend` package removed
- `npm audit`: **18 → 8** vulnerabilities (remaining 8 are nodemailer-via-next-auth — **must not** be force-fixed per project rules; they're mitigated/not exercised here)
- Full security audit report committed: `next-app/security-audit-report.md`

### Verification
- ✅ Build passes, lint 0 errors
- ✅ Migration `20261018120000_audit_missing_indexes` applied
- ✅ Pushed `7ce1b7d` → Vercel production **SUCCESS**
- ✅ Live `/api/health` 200 OK, mirrors synced

---

## 4. THE UPDATE PLAN

### Phase A — Remaining security hardening (next, ~half day)
| ID | Issue (plain words) | Work |
|---|---|---|
| H-02 | A coach could upload a **tampered backup file** to give themselves admin-like approval rights, because restore inserts whatever columns the file contains | Add a per-table column allowlist in `lib/backup.js` restore; strip privileged fields (`can_approve_coaches`, approval hashes/timestamps) from coach self-restore |
| M-01/M-02 | Rate limits live in server memory → **reset on every serverless cold start**; DB fallback fails open and uses a weak hash | Use the existing DB limiter everywhere (SHA-256 keys), fail closed in production for auth endpoints |
| M-04 | Test passwords (`Admin123!`, `CoachTest2026!`) committed in source | Generate random passwords at seed time; block sample-data paths in production |
| M-05 | Login says "pending approval" → tells attackers an account exists | One generic sign-in error for all failures |
| M-06/L-02 | Several routes return raw error `detail` to browsers | Generic 500s to clients, full detail to server logs only |
| M-08 | Athlete CSV import has **no row cap** (16 MB body → DoS) | Hard cap (e.g. 2 000 rows) + early reject |
| L-03 | Change-password has no rate limit on current-password checks | Add per-user limiter |

### Phase B — Make it scale (the big one, ~2–3 days)
| ID | Issue (plain words) | Work |
|---|---|---|
| Q-H1 | `/reports` ships **the whole database** into the page (up to 1M rows at 1 000 athletes) | Compute aggregates server-side (`groupBy`/`count`); fetch detail per section; or make exports async |
| Q-H2 | `/athletes` fetches everyone **2–3 times** and serializes it all to the browser; search runs client-side over megabytes | Use existing `paginatePrisma`; push search/sort/filters into SQL; ship only the current 25 rows |
| Q-H5 | `GET /api/athletes` returns the entire table | Add `skip`/`take` with max 100 + `{items,total,page}` |
| Q-M1 | Every page does an HTTP self-call (`getSession`) for the session | Shared `getServerSession(context.req, context.res)` helper for all 27 pages |
| Q-M2 | Dashboard scans 8 weeks of logs and averages in JS on the hottest page | SQL `groupBy` + wrap GSSP in existing `gsspData` cache |
| Q-H4 | Training-plan page fetches activity logs **twice**, one unbounded | Single capped query, derive latest from it |
| Q-H6 | API POST handlers re-throw unexpected errors → HTML-ish 500s break the JSON contract | Shared `withErrorHandling` wrapper → always `{error}` JSON |
| Q-M12 | Batch assessment endpoint does up to 60 serial queries | Two `findMany({id: {in}})` + validate in memory |

### Phase C — User experience (~1–2 days)
| ID | Issue (plain words) | Work |
|---|---|---|
| U-H1 | No custom **404 / 500** pages → users get Next's white default (theme broken) | Themed `pages/404.js`, `pages/500.js`, `pages/_error.js` with helpful copy |
| U-H2/U-H3 | Mobile hamburger corrupts the saved desktop-collapse preference; menu isn't a real dialog (no focus trap, no scroll lock) | Split mobile `open` vs desktop `collapsed` state; proper modal behavior |
| U-H4 | No progress bar → clicking to `/reports` looks frozen | Add `nprogress` wired to `router.events` in `_app.js` |
| U-H5/U-H6 | Success messages wiped by instant `router.reload()`; success and failure look identical | Delay reload / optimistic update; use `formSuccess` vs `formError` + explicit words |
| U-M1 | `/admin/training-metrics` is unreachable (no link anywhere) | Link it from admin nav/catalog — or delete |
| U-M2 | Two tables show bare headers when empty | Add contextual empty rows |
| U-M3 | Report selection table breaks on phones | Standard card-collapse / `overflow-x` |
| U-M5/U-M6 | Unlabeled search input; missing `scope="col"` on table headers | A11y pass |
| U-M8 | No CSV export for standings / athlete roster | Reuse `downloadCsv` helper |

### Phase D — Debt & structure (opportunistic)
- Extract shared components: `StatusBadge`/`HealthBadge` (copied verbatim ×2), date formatters (×6), `useApi()` CSRF hook (×15 duplicate fetch dances)
- Split oversized pages (1 291-line training-plan detail, 1 046-line reports, 1 021-line athletes)
- Optimistic updates instead of `router.reload()` ×7 on athlete profile
- Move `AthleteDocument.data` bytes from Postgres → blob store (DB bloat + backup bloat)
- Replace runtime DDL "schema self-heal" with real `prisma migrate deploy` in the Vercel build
- Retention job for `AuditLog` / `RateLimitBucket` / old logs
- 404-aware error boundary in `_app.js`
- Decide: **athlete login role** exists in the brief but not in the system — either schedule the athlete portal or amend the brief

### Still pending from before
- **Standing Phase 5**: verify every achievement from Athlete Profile appears in `/standings/[athleteId]`, then remove the Achievements section from `pages/athletes/[id].js` (build-then-remove discipline)

---

## 5. What is genuinely good (credit)

- **Auth**: bcrypt cost 12, SHA-256 single-use reset tokens (30 min), 8-hour JWT, dual rate limiting + lockout + audit trail on login, CSRF double-submit with `timingSafeEqual`, origin checks
- **Headers**: CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy all set
- **Schema**: 40+ thoughtfully matched composite indexes; profile queries exclude document bytes
- **Code hygiene**: zero `console.log`, zero commented-out code, no `dangerouslySetInnerHTML`, no user input in raw SQL
- **UX**: 106 real empty states, proper A4 print stylesheet for official reports, role-filtered sidebar with no dead links, skip link + focus outlines + ARIA live regions
- **The codebase knows the right patterns** — `Promise.all`, cancellation flags, pagination helper, shared security lib — they're just not applied to the biggest pages yet

---

## 6. Recommended order

1. **Phase A** (security remainder) — H-02 first, it's the last real hole
2. **Standing Phase 5** — finish what's started
3. **Phase B** — Q-H6 + Q-H2 + Q-M1 first (biggest real-world win for least risk), Q-H1 (reports) as its own focused effort
4. **Phase C** — U-H1 + U-H4 first (visible, cheap), then mobile nav (one coherent fix), then form feedback
5. **Phase D** — opportunistic, alongside other work
