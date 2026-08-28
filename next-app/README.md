# Cauayan Athlete Performance Monitoring System (Next.js)

Production-grade athlete performance tracking for the coaches and administrators of
**Cauayan City, Isabela**. This `next-app/` directory contains the modern Next.js
(16, Pages Router) application backed by a Neon cloud PostgreSQL database. The legacy
PHP system at the repository root is deprecated and should not be modified.

Stack: Next.js 16.3.2 (Pages Router + SSR) · Prisma 7.10 (`@prisma/adapter-pg` + `PrismaPg`) ·
NextAuth v4 · bcryptjs · nodemailer · resend · pg · Neon PostgreSQL.

---

## Configuration (environment)

Secrets are **never committed** (`.env*` is gitignored). Set these in your host
(locally copy `.env.local.example` to `.env.local`; on Vercel set them per-environment in the Dashboard):

| Variable          | Required | Purpose                                                        |
|-------------------|----------|----------------------------------------------------------------|
| `DATABASE_URL`    | yes      | **Pooled** URL (runtime reads). Use the `-pooler` host.        |
| `DIRECT_URL`      | yes      | **Direct** URL (used only for migrations/DDL, see `prisma.config.ts`). |
| `NEXTAUTH_URL`    | yes      | Public app URL (e.g. `https://...vercel.app`).                 |
| `NEXTAUTH_SECRET` | yes      | Random secret for signing NextAuth JWT sessions.               |
| `RESEND_API_KEY`  | no*      | For transactional email (coach registration).                  |
| `SMTP_*` / nodemailer vars | no* | Alternative email transport.                           |

> Use the **pooled** URL at runtime (`DATABASE_URL`) and the **direct** URL for
> migrations (`DIRECT_URL`). Avoid DDL/advisory-lock operations on pooled connections.

---

## Local development

```bash
cd next-app
npm install          # postinstall runs `prisma generate`
npm run dev          # http://localhost:3000
npm run lint         # eslint
npm run build        # next build (verify before any deploy)
```

### Local database

The hosted Neon DB is the source of truth. For a local sandbox, point `DATABASE_URL` /
`DIRECT_URL` at a local PostgreSQL 16+ instance, then:

```bash
npm run db:seed      # idempotent upserts
```

---

## Database & migrations

- Schema: `prisma/schema.prisma`
- Migrations: `prisma/migrations/`
- `prisma.config.ts` routes migrations to `DIRECT_URL`.

```bash
npx prisma migrate dev                 # dev: create + apply
npx prisma migrate deploy              # CI/prod: apply pending without re-creating
npm run db:seed                        # idempotent seed
```

Indexes on hot paths exist via migration `20260828064817_add_performance_indexes`
(assessments, results, achievements, event applications/participants) for scalable
queries. List pages are paginated (50/page) via `lib/pagination.js` + `components/Pagination.js`.

### Backups

Take a backup/clone **before every upgrade or deploy**:

```bash
# SQL dump (if a local/remote psql is available against the direct URL)
pg_dump "$DIRECT_URL" -F c -f backup_$(date +%Y%m%d_%H%M%S).dump
# Always also git clone the repo as a full snapshot
git clone <remote> backup_clone_$(date +%Y%m%d_%H%M%S)
```

---

## Security

- Account **lockout**: 5 failed logins locks an identifier for 15 min (`lib/login-protection.js`), layered on top of per-IP rate limiting (`lib/rate-limit.js`).
- JWT sessions: 8h max age; cookies `HttpOnly` + `SameSite=Lax` + `Secure` in production.
- Security headers on all routes (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, no-store for `/api/*`).
- CSRF enforcement on all state-changing API routes (`lib/api-security.js`).
- Input validation/sanitization on all API inputs; role-based authorization.

---

## Health check

```text
GET /api/health
```

Returns `200 { status: "ok", db: "up", ... }` when the database is reachable, else
`503 { status: "degraded", db: "down" }`. Use this in uptime monitors and Vercel
cron/checks.

---

## CI / CD

- GitHub Actions (`.github/workflows/ci.yml`): on push to `main` and PRs — install,
  generate the Prisma client, lint, and build.
- Deployment is via Vercel (`vercel.json`): the build command runs
  `prisma migrate deploy && node prisma/seed.js && next build`, so pending migrations
  and the idempotent seed apply automatically before the app builds.

### Deploy checklist

1. Backup/clone the repo + DB (see above).
2. Ensure Vercel env has **both** `DATABASE_URL` (pooled) and `DIRECT_URL` (direct)
   for production, preview, and development.
3. `npm run lint` and `npm run build` pass locally.
4. Push to `main` (triggers CI + Vercel deploy).
5. Verify `GET /api/health` returns `ok`, and spot-check `/coach-register`,
   `/dashboard`, `/athletes`.
