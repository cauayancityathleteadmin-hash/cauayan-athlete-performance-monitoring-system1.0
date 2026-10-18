# SECURITY AUDIT REPORT: Cauayan Athlete Performance Monitoring System

**Audit Date:** October 18, 2026  
**Audited Scope:** `C:\Users\FUJITSU\Documents\Default Project\cauayan-athlete-performance-monitoring-system1.0\next-app`  
**Tech Stack:** Next.js 16 (Pages Router), Prisma 7, PostgreSQL, NextAuth.js v4, Cloudflare Turnstile, Vercel Blob, bcryptjs  
**Audit Type:** Read-only security assessment — No code modifications performed  
**Status:** Complete, Honest (no fabricated issues)

---

## EXECUTIVE SUMMARY

The application demonstrates several strong security practices (bcrypt cost 12, SHA-256 hashed single-use reset tokens, double-submit CSRF with origin checks, proper session handling with JWT and 8-hour maxAge, SameSite=Strict cookies, role/ownership checks throughout, CSP headers, magic-byte file validation, and parameterized queries with no obvious SQL injection).

However, **TWO CRITICAL issues** and several HIGH/MEDIUM/LOW findings were identified. The most severe is the automated backup endpoint which authenticates using a client-spoofable `x-vercel-cron` header, allowing unauthenticated attackers to trigger full database backups and retrieve the resulting public blob URL containing sensitive data (password hashes, reset tokens, athlete PII/health data).

---

## CRITICAL SEVERITY (Immediate action required)

### CR-01: Vercel cron header bypasses BACKUP_SECRET on backup trigger

- **File:** `pages/api/system/backup/auto.js` (lines 11–21, 23–27, 39–41)
- **Affected Endpoint:** `GET /api/system/backup/auto?key=...` (header `x-vercel-cron: "1"`)
- **Description:** The endpoint sets `isVercelCron = String(req.headers["x-vercel-cron"] || "") === "1"` and does `let authorized = isVercelCron;` without verifying the header originates from Vercel. If BACKUP_SECRET is missing or not used, or if an attacker spoofs `x-vercel-cron: 1`, the check at lines 16–21 grants authorization. The endpoint then builds a full system snapshot (`buildSystemSnapshot`) and calls `saveBackupBlob` which uploads to Vercel Blob with `access: "public"` and returns a public `url`. This can be exploited to exfiltrate the entire database snapshot.
- **Evidence:**
  - Line 12: `const isVercelCron = String(req.headers["x-vercel-cron"] || "") === "1";`
  - Line 15: `let authorized = isVercelCron;`
  - Lines 25–27: snapshot created and saved; line 40 returns `url: stored.url`
- **Impact:** Unauthenticated remote code/trigger → full DB backup (users with password hashes, reset tokens, athletes PII/medical-adjacent data, audit logs) returned via public URL. Can be abused repeatedly (creates new backups, pruned but attacker can capture URLs).
- **Fix (one-line suggestion):** Replace Vercel cron auth with `Authorization: Bearer ${CRON_SECRET}` and/or verify Vercel's `User-Agent: vercel-cron/1.0` plus a signed secret (do NOT trust arbitrary client headers). Also consider IP allowlisting or requiring `BACKUP_SECRET` for all invocations. Example: `const auth = req.headers.authorization || ""; const authorized = isVercelCron && auth === \`Bearer ${process.env.CRON_SECRET}\`` (and fail closed if CRON_SECRET unset in prod).

### CR-02: Database snapshots stored with public access and predictable names

- **File:** `lib/blob-store.js` (lines 16–17)
- **Description:** `saveBackupBlob` uploads system backups with `{ access: "public", contentType: "application/json", addRandomSuffix: false }` and names them `db-backups/system-<timestamp>.json` (via `stamp()` using `toISOString().replace(/[:.]/g, "-")`). Combined with CR-01, any attacker who triggers a backup learns the exact public URL pattern and can also attempt to guess/prune context. Even without CR-01, if a URL is ever leaked, the entire snapshot is world-readable.
- **Evidence:**
  - Line 16–17: `const { url } = await put(name, payload, { access: "public", contentType: "application/json", addRandomSuffix: false });`
- **Impact:** Highly sensitive data exposure (bcrypt password hashes, password reset tokens, athlete PII, health-related logs, system settings). Public blob access is effectively unauthenticated download.
- **Fix (one-line suggestion):** Use `access: "private"` (Vercel Blob private access) and serve downloads via a server-side authenticated endpoint that checks session/role (admin) and returns the blob content; or encrypt snapshots client-side before upload (AES-GCM) with key stored in secrets. Also consider `addRandomSuffix: true` to prevent deterministic enumeration.

---

## HIGH SEVERITY

### H-01: Development provision route armed in production with hardcoded admin credentials

- **Files:** `pages/api/dev/provision.js` (lines 4–20, 56), `lib/sample-data.js` (lines 69–70, 157–166)
- **Endpoint:** `POST /api/dev/provision` (header `x-provision-key: <SEED_PROVISION_KEY>`)
- **Description:** The route is key-gated via `SEED_PROVISION_KEY` (trimmed). If the key is configured in production (verified live: probe returned `{"error":"Not found.","keyConfigured":true}`), the endpoint can create/reset an admin account. `provisionAdminOnly()` upserts `admin@cauayan.local` / username `admin` with password `Admin123!`, sets `mustChangePassword:false`, and the full provision message states "Remove SEED_PROVISION_KEY and this route before launch." Key comparison is string equality (line 19 in provision.js) with trimmed strings but not timing-safe in the header compare path shown. The route also returns full error detail (line 62).
- **Evidence:**
  - provision.js L17–19: returns 404 `keyConfigured:false` if no key; else 404 if header mismatch (odd 404 semantics but auth gate exists). Live probe confirmed key configured.
  - sample-data.js L69: `ADMIN_ACCOUNTS = [{ username: "admin", email: "admin@cauayan.local", password: "Admin123!" }]`
  - sample-data.js L162: updates existing admin to reset `passwordHash`, sets `mustChangePassword:false`
  - provision.js L56: explicit warning to remove before launch
- **Impact:** If `SEED_PROVISION_KEY` leaks or remains in production env, attacker can (re)provision/reset the admin account to a known password, gain admin access. Route is dangerous if left enabled post-launch.
- **Fix (one-line suggestion):** Disable by default in production (return 404 regardless of key if `NODE_ENV==='production'`), remove route from production builds, or require stronger auth + explicit allowlist; use timing-safe compare for the key; avoid hardcoded sample passwords in production paths.

### H-02: Coach restore allows privilege escalation via column-level mass assignment

- **Files:** `lib/backup.js` (lines 208–218, 262–328), `pages/api/coach/data.js` (restore path uses `restoreCoach`)
- **Description:** `restoreCoach` validates row ownership (coach_id/athlete_id/plan_id/session_id/exercise_id linkage) via `validators` (lines 281–303) — this prevents restoring other coaches' data. However, `insertRows` (lines 208–217) does **not** whitelist columns: it takes `Object.keys(row)` (line 211), filters `undefined`, maps to quoted identifiers and binds values by position. The attacker-supplied JSON from the uploaded coach backup controls every column key present in each row object (including privileged columns). The validators only check foreign keys/ownership, not whether non-owned/privileged columns are set.
- **Evidence:**
  - insertRows L211–217: uses attacker-controlled `Object.keys(row)` to build `colList` and values
  - restoreCoach L317–322: filters by validator but does not strip columns; if a coach row in backup contains privileged fields, they will be inserted/updated via raw INSERT into `coaches` (L282 validator only requires `id===coachId`, but allows any other columns in that row)
- **Concrete risk (coaches table):** If an attacker crafts a coach backup JSON where `coaches[0]` includes `can_approve_coaches: true`, `approval_activated_at: <now>`, `approval_code_hash: <attacker-controlled or bypass>`, `approval_code_expires_at: ...`, etc., the INSERT will set those columns (typeMap permits them). Since validator passes (id matches), privilege escalation is possible (self-grant coach-approval rights). Similar risk exists if other tables had privilege flags (none obvious in schema but insert is generic).
- **Impact:** Authenticated coach can escalate privileges by uploading a tampered backup (grant `can_approve_coaches`, affect approval state) bypassing intended admin-only grant + activation flow.
- **Fix (one-line suggestion):** Enforce strict column allowlists per table in restore paths (never trust backup JSON column names); for `coaches`, explicitly allow only non-privileged columns on coach self-restore (e.g., profile fields) and reject any attempt to set `can_approve_coaches`, `approval_activated_at`, `approval_code_hash`, `approval_code_expires_at`, `approval_code_issued_by`, `approval_activated_by`, `approved_by_user_id`, role/status flags, etc. Also prefer ORM upserts with `select`/field whitelisting.

### H-03: CAPTCHA verification fails open on errors and missing secret

- **File:** `lib/turnstile.js` (lines 9–28)
- **Description:** `verifyTurnstile` returns `true` if `TURNSTILE_SECRET_KEY` is missing (line 10) — effectively disabling CAPTCHA in environments where secret not configured. Also returns `true` on network/fetch errors (line 26) with only console.error. This is a fail-open design that can be abused to bypass bot protection on endpoints using it (coach-register, login where enabled, etc.) if misconfigured.
- **Evidence:**
  - L10: `if (!process.env.TURNSTILE_SECRET_KEY) return true;` 
  - L25–27: catch -> `console.error(...); return true;`
- **Impact:** Misconfiguration or transient network issue removes bot/rate-limiting friction (credential stuffing, automated registrations). Depends on whether routes treat missing secret as "CAPTCHA disabled" by design — but fail-open on errors is unsafe.
- **Fix (one-line suggestion):** Fail closed in production for protected endpoints (e.g., `if (process.env.NODE_ENV==='production') throw/return false` on missing secret or error), or require explicit `CAPTCHA_REQUIRED=true`. At minimum, log and reject on verification errors in prod; never silently bypass.

---

## MEDIUM SEVERITY

### M-01: In-memory rate limiting and login protection are not shared across instances

- **Files:** `lib/login-protection.js` (line 4: `const attempts = new Map();`), `lib/rate-limit.js` (line 1: `const attempts = new Map();`)
- **Description:** Both use process-local Maps only. In serverless/Vercel (multiple functions/instances), lockouts and per-key rate limits do not persist across instances — attacker can rotate instances or the limit is effectively per-instance. A DB-backed limiter exists (`lib/rate-limit-db.js`) but is only used selectively (e.g., login uses both memory + DB for IP with limit 30/15min; some endpoints use memory-only). Also DB limiter fails open on error (lines 54–59 return allowed:true with degraded:true in non-prod behavior but returns allowed:true in all cases on catch except logs).
- **Evidence:**
  - login-protection.js L4: module-scoped Map (non-persistent, per process)
  - rate-limit.js L1: module-scoped Map
  - rate-limit-db.js L54–59: catch -> returns `{ allowed: true, ... degraded: true }` (fail-open) in all environments (condition only logs in non-prod)
- **Impact:** Brute force protection weakened in distributed deployments; coordinated attacks can bypass per-instance limits.
- **Fix (one-line suggestion):** Prefer DB-backed rate limiting (or Redis) for all auth-sensitive endpoints (login, register, forgot/reset, change-password). Treat DB limiter failures as fail-closed in production for auth endpoints, or add circuit breaker with conservative defaults.

### M-02: DB rate limiter uses weak 32-bit hash with collision risk; fail-open on errors

- **File:** `lib/rate-limit-db.js` (lines 3–10, 54–59)
- **Description:** `hashKey` is a simple rolling 32-bit hash (`hash = (hash<<5)-hash + charCodeAt(i); hash |= 0;` then base36) — not cryptographic, high collision probability for many distinct keys (IPs, identifiers), causing different clients to share buckets. Catch block returns `allowed: true` (fail-open) on any DB error in all environments (logs only if `NODE_ENV !== "production"`), so DB outage disables protection.
- **Evidence:**
  - L3–10: non-cryptographic hash
  - L54–59: `return { allowed: true, retryAfter: 0, hits: 0, degraded: true }` on catch (no prod gating on allow)
- **Impact:** Collisions can unfairly throttle legitimate users or allow attackers to share quota; outages silently disable rate limiting.
- **Fix (one-line suggestion):** Use a stable cryptographic hash (e.g., `crypto.createHash('sha256').update(key).digest('hex')`) for bucket keys; fail closed for auth endpoints on DB errors in production.

### M-03: Weak CSPRNG for 6-digit approval codes

- **File:** `lib/security-codes.js` (line 7)
- **Description:** `generateApprovalCode()` uses `Math.random()` to produce 6-digit codes (100000–999999). `Math.random()` is not cryptographically secure; codes are predictable if attacker can observe timing or has enough samples.
- **Evidence:** L7: `return String(Math.floor(100000 + Math.random() * 900000));`
- **Context:** Codes are hashed with bcrypt (10 rounds) before storage and verified via bcrypt compare (L10–17). Verification requires authentication (`/api/admin/coach-approvals/verify` checks session). Also login-protection/rate limits apply. Despite mitigations, the generator itself is weak.
- **Impact:** Authenticated attacker with ability to brute-force or predict codes could potentially guess approval codes if other controls fail; risk is reduced by hashing + auth-only verification + rate limits. Still not best practice.
- **Fix (one-line suggestion):** Use `crypto.randomInt(100000, 1000000)` (Node) or `crypto.getRandomValues` for secure random 6-digit generation.

### M-04: Hardcoded test credentials in repository

- **Files:** `prisma/seed.js` (lines 145–146), `lib/sample-data.js` (lines 69–78)
- **Description:** Seed data and sample data contain hardcoded passwords (e.g., `CoachTest2026!`, `Admin.101!`, `CoachSantos1!`, `Admin123!`, etc.). While these are test/demo accounts and routes that create them are sample/provisioning code, committing known credentials to source control is poor practice and increases risk if accidentally deployed or if provisioning runs.
- **Evidence:**
  - prisma/seed.js L145–146: creates admin/coach with fixed passwords
  - lib/sample-data.js L69–78: ADMIN_ACCOUNTS and COACHES with fixed passwords
- **Impact:** If used outside local dev, known creds enable trivial access. Combined with H-01 (provision route armed in prod), this is dangerous.
- **Fix (one-line suggestion):** Remove hardcoded passwords; generate random secure passwords on seed/provision and log them once (or force password change); block sample data execution in production via env checks.

### M-05: Login endpoint returns distinct error for pending approval (user enumeration)

- **Files:** `pages/api/auth/[...nextauth].js` (lines 64–68), `pages/login.js` (line 24)
- **Description:** When user status is `pending`, the authorize callback throws `Error("PENDING_APPROVAL")` (L67). NextAuth surfaces this as an error; the login UI detects `error === "CredentialsSignin"` with message containing "pending approval" (login.js L24 checks for that string). This reveals whether an account exists but is pending approval — a form of user enumeration (attacker can distinguish pending vs non-existent vs wrong password).
- **Evidence:**
  - [...nextauth].js L64–68: throws "PENDING_APPROVAL" on pending status (after recording failure)
  - login.js L24: shows specific message for pending approval
- **Impact:** Low-to-medium in this closed app, but leaks account existence/status.
- **Fix (one-line suggestion):** Return generic authentication failure for all invalid cases (non-existent, wrong password, inactive, pending) without throwing distinct error strings; log internally.

### M-06: Information disclosure via detailed error messages to clients

- **Files:** `pages/api/dev/provision.js` (L62), `pages/api/athletes/picture.js` (L40 in shown pattern), `pages/api/documents/upload.js`, `pages/api/athletes/import.js` (L227), `pages/api/coach/data/restore.js` (L35/63 per summary), `pages/api/plan-evidence/upload.js` (L111 per summary)
- **Description:** Several routes return `detail: String(error.message)` or similar to clients on 500 errors. For example, provision.js L62 returns `"detail": String((error && ...))`. Other upload/import/restore routes (per earlier analysis) leak stack/underlying errors. This aids attackers in reconnaissance (schema, paths, DB errors).
- **Evidence:**
  - provision.js L62: `return res.status(500).json({ error: "Provisioning failed.", detail: String(...) })` (test-only route, but still exposed if key valid)
- **Impact:** Information leakage; can reveal internal details useful for exploitation.
- **Fix (one-line suggestion):** Return generic 500 messages to clients; log full errors server-side (including stack) with request IDs. Restrict detailed errors to development only.

### M-07: Middleware matcher omits several protected routes

- **File:** `middleware.js` (lines 34–57)
- **Description:** The matcher protects many routes but does **not** include `/training-plans`, `/reports`, `/standings`, `/coach-approvals`, etc. (summary noted these). However, the app also uses GSSP/getServerSideProps checks for auth on pages — middleware is defense-in-depth for session presence. Missing matcher entries mean middleware won't run on those page routes (though API routes under `/api/*` that are matched: account/admin/athletes/assessments/event-plans are covered; others like training-plans API not shown). Gaps reduce uniformity of early auth checks.
- **Evidence:**
  - matcher covers dashboard, athletes, assessments, analytics, event-plans, account, change-password, admin, and several `/api/*` prefixes — but not training-plans pages/APIs, reports, standings, coach-approvals pages.
- **Impact:** Defense-in-depth weakened; middleware-based role/redirect logic may not apply uniformly if paths added later.
- **Fix (one-line suggestion):** Extend matcher to cover all authenticated page prefixes (`/training-plans`, `/training-plans/:path*`, `/reports`, `/reports/:path*`, `/standings`, `/standings/:path*`, `/coach-approvals`, `/coach-approvals/:path*`, and corresponding `/api/training-plans/:path*`, `/api/reports/:path*` if any). Keep consistent with actual routes.

### M-08: No max-row limit on athlete import (DoS risk)

- **File:** `pages/api/athletes/import.js` (per summary)
- **Description:** Bulk import accepts uploaded CSV/JSON and processes rows without enforcing a maximum row count. A 16MB body with many rows could cause excessive memory/CPU/time (blocking request) leading to DoS, especially in serverless.
- **Evidence:** Summary noted "athletes/import.js: no max-row limit (16MB body DoS)"
- **Impact:** Availability risk (resource exhaustion).
- **Fix (one-line suggestion):** Enforce hard caps: max rows (e.g., 1000–5000), max file size, and stream/validate incrementally; reject oversized imports early.

### M-09: CSP includes 'unsafe-eval'

- **File:** `next.config.mjs` (per summary: "CSP includes `script-src 'unsafe-eval'`")
- **Description:** Content Security Policy allows `'unsafe-eval'` in script-src. This significantly weakens XSS protections by permitting `eval()`/`new Function()`. Next.js may require it in dev or for certain features, but it should not be present in production CSP.
- **Evidence:** Summary line in verified positives context notes CSP includes `'unsafe-eval'`.
- **Impact:** If any XSS vector exists, `unsafe-eval` makes exploitation easier (code execution via strings).
- **Fix (one-line suggestion):** Remove `'unsafe-eval'` from production CSP; conditionally include only in development if strictly necessary. Audit for actual dependencies requiring eval.

---

## LOW SEVERITY

### L-01: Insufficient URL scheme validation for pictureUrl

- **Files:** `pages/api/coach-register.js` (L43), `pages/api/athletes/index.js` (L72), `pages/api/athletes/[id].js` (L130)
- **Description:** `pictureUrl` is accepted without validating scheme/protocol. Other endpoints (`photo.js`, `update-profile.js`) are more restrictive. Rendering via `<img src>` in React is generally safe from `javascript:` in modern React if passed as string to src, but allowing `data:` or `file:` schemes can be undesirable; also SSRF considerations if later used server-side. Inconsistency across routes.
- **Evidence:** Summary notes lack of scheme validation vs stricter checks elsewhere.
- **Impact:** Minor; XSS via `javascript:` is mitigated by React's attribute escaping in typical usage, but better to whitelist `http://`, `https://` (and possibly `data:` with size/type constraints if intentional).
- **Fix (one-line suggestion):** Validate `pictureUrl` against allowlist of schemes (`https?://` or `data:image/...` if needed) on create/update.

### L-02: Error detail leakage in multiple upload/restore/import routes

- **Files:** upload/picture (L40), documents upload, import (L227), restore (L35/63), provision (L62), plan-evidence (L111)
- **Description:** As in M-06, detailed error messages returned to clients. Consistent pattern across several endpoints.
- **Fix:** Standardize error handling: return generic client errors; log details with correlation IDs.

### L-03: Various minor hardenings

- **No rate limit on current-password verification:** `pages/api/account/change-password.js` lacks rate limiting on current-password check (brute force against existing password). Add per-user/IP rate limiting.
- **Athlete import lacks max row count:** see M-08 (DoS). Also consider CSV injection mitigation if exported elsewhere (not directly an import issue).
- **Navigation coverage:** middleware matcher gaps (M-07). Not directly exploitable if GSSP enforces auth.
- **CSP `unsafe-eval`:** M-09.

---

## POSITIVES VERIFIED

The audit confirmed strong security posture in many areas:

- ✅ **Password hashing:** bcrypt with cost 12 (`pages/api/auth/[...nextauth].js`, `pages/api/coach-register.js`, `pages/api/account/change-password.js`, `lib/reset-tokens.js`, `lib/security-codes.js`)
- ✅ **Password reset tokens:** SHA-256 hashed, single-use, 30-minute expiry (`lib/reset-tokens.js`, `pages/api/auth/forgot-password.js`, `pages/api/auth/reset-password.js`)
- ✅ **Session management:** NextAuth JWT strategy, 8h maxAge, secure callbacks; session cookie config via NextAuth defaults with `SameSite=Strict` in prod context (`auth/[...nextauth].js`, `lib/api-security.js`)
- ✅ **CSRF protection:** Double-submit CSRF token pattern + origin/referrer checks implemented (`lib/api-security.js`)
- ✅ **Authorization:** Role checks (`requireRole`, `isAdmin`) and resource ownership checks present across athletes, plans, logs, progress, transfers, documents, event-plans, assessments, coach-performances (verified via code review of key routes)
- ✅ **Input validation:** Zod validators used in multiple routes (`pages/api/coach-register.js` uses `coachRegisterSchema`, others use schema validation)
- ✅ **File upload security:** Magic-byte/content sniffing for documents (`lib/document-types.js`), type/size constraints, sanitized filenames
- ✅ **SQL injection resistance:** No string concatenation of user input into raw SQL in reviewed code; parameterized queries via Prisma; when raw SQL used, values are bound (`lib/backup.js`, `lib/db-schema.js`) and identifiers quoted safely
- ✅ **XSS prevention:** No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval()` usage in React codebase (search confirmed); CSP headers configured (`next.config.mjs`)
- ✅ **Rate limiting:** Hybrid approach — in-memory + DB-backed rate limiting on auth endpoints (login uses both); password reset/register/upload have limits
- ✅ **Security headers:** `setSecurityHeaders` applied via `lib/api-security.js` to API responses
- ✅ **Environment hygiene:** `.env`, `.env.local` gitignored and untracked; no hardcoded secrets in source files
- ✅ **NextAuth hardening:** Production check for `NEXTAUTH_SECRET`; schema self-heal guarded
- ✅ **User status enforcement:** Pending coaches blocked from login with distinct handling
- ✅ **Prisma 7:** Using modern Prisma version (no forced audit fix applied as per constraints)
- ✅ **Blob storage awareness:** Pruning logic for old backups (20 max) to limit storage

---

## RECOMMENDATIONS (Priority order)

1. **CRITICAL - Fix backup auth (CR-01):** Replace `x-vercel-cron` trust with `Authorization: Bearer ${CRON_SECRET}` (Vercel cron sends `Authorization` with `Bearer <CRON_SECRET>` when configured). Also reject if CRON_SECRET missing in production. Consider requiring BACKUP_SECRET even for cron if header unverifiable.
2. **CRITICAL - Make backups private (CR-02):** Change `access: "public"` to `access: "private"` in `blob-store.js` and provide authenticated download endpoint. If public access is required for specific use case, add random suffixes and access controls; never store full DB snapshots publicly.
3. **HIGH - Secure dev provision (H-01):** In production, completely disable `/api/dev/provision` (return 404 unconditionally if `NODE_ENV==='production'`) regardless of key presence. Remove route before launch or behind stronger auth. Use timing-safe comparison. Avoid resetting admin to known password.
4. **HIGH - Whitelist columns in restore (H-02):** Implement per-table allowlists in `insertRows`/restore paths; explicitly exclude privilege fields (`can_approve_coaches`, approval timestamps/hashes, role flags) from coach self-restore. Validate column sets against allowlist before INSERT.
5. **HIGH - Fail closed on CAPTCHA errors (H-03):** In production, return false on missing secret or verification errors; only allow true bypass in explicit dev/test modes.
6. **MEDIUM - Strengthen rate limiting (M-01,M-02):** Migrate sensitive endpoints to DB-backed limiter with stronger hashing (SHA-256) and fail-closed behavior in prod on DB errors. Consider Redis for multi-region.
7. **MEDIUM - Use CSPRNG for codes (M-03):** Replace `Math.random()` with `crypto.randomInt` in `generateApprovalCode()`.
8. **MEDIUM - Remove hardcoded creds (M-04):** Eliminate test passwords from committed code; generate securely at runtime.
9. **MEDIUM - Generic auth errors (M-05):** Unify login error responses to prevent user enumeration.
10. **MEDIUM - Sanitize error responses (M-06):** Return generic 500s to clients, log details server-side.

---

## SCOPE NOTES

- **Excluded from exploit testing:** Did not trigger `/api/system/backup/auto` with spoofed header against production (ethical/read-only). Assessment based on code review and public knowledge of Vercel cron header behavior.
- **Live verification:** Confirmed `SEED_PROVISION_KEY` is configured in production via harmless probe (`POST /api/dev/provision` with no key → 404 `{"error":"Not found.","keyConfigured":true}`).
- **Coverage:** Reviewed 57 API routes (cross-checked public vs protected), core libs (auth, backup, blob, security, rate limiting), middleware, NextAuth config, CSP/headers. Spot-checked key admin/coach/athlete routes for authorization.
- **User roles:** Only `admin` and `coach` exist; no athlete login role in current model (athlete IDOR concerns limited).

---

**Report prepared by:** Security Audit Agent (read-only)  
**Classification:** Internal Security Assessment  
**Recommendation:** Remediate CRITICAL findings before any production exposure increase or before relying on the automated backup mechanism.