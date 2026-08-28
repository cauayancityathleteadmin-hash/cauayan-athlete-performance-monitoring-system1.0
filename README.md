# Cauayan City Athlete Performance Monitoring System

A web-based system for tracking and managing athlete performance in Cauayan City,
Isabela. Coaches and administrators monitor progress, record performance data,
and analyze results through an easy-to-use dashboard.

This repository is a monorepo containing two implementations:

- **`next-app/` — ACTIVE production system.** A modern Next.js 16 (Pages Router)
  application with a Neon cloud PostgreSQL database. This is the system you deploy
  and maintain. See [`next-app/README.md`](next-app/README.md) for the full runbook
  (env vars, migrations, backups, security, health checks, CI/CD, deploy checklist).
- **Legacy PHP system** (root-level PHP files, `admin/`, `coach/`, `includes/`,
  `database/schema.sql`). Deprecated; retained for historical reference. **Do not
  run or modify these in production.**

## Quick start (active system)

```bash
cd next-app
npm install
npm run dev        # http://localhost:3000
```

Production is deployed to Vercel with Neon PostgreSQL. Live app and health check:

```text
GET /api/health
```

## Repository layout

- `next-app/` — active Next.js application (see its README)
- `.github/workflows/ci.yml` — CI (lint + build) on push to `main` and PRs
- `admin/`, `coach/`, `includes/`, `database/` — legacy PHP (deprecated)

## Originating docs (legacy)

The legacy system's setup and role documentation are preserved in the original
repository. For the modern system, follow `next-app/README.md`.
