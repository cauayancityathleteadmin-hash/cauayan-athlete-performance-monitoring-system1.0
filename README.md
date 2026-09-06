# Cauayan City Athlete Performance Monitoring System

A web-based system for tracking and managing athlete performance in Cauayan City,
Isabela. Coaches and administrators monitor progress, record performance data, and
analyze results through a dashboard.

## Repository structure

```
.
├── next-app/    ACTIVE production system (Next.js, deployed to Vercel)
├── archive/     Legacy and offline versions — read-only, not deployed
├── docs/        Project documentation including the full runbook and upgrade plan
├── .github/     CI and live-smoke workflows
└── README.md
```

## Active system — `next-app/`

The **only** deploy source. A modern Next.js (Pages Router) application backed by a
Neon cloud PostgreSQL database. See:

- [`next-app/README.md`](next-app/README.md) — full runbook: env vars, migrations,
  backups, security, health checks, CI/CD, deploy checklist.
- [`docs/PLAN-NOTES.md`](docs/PLAN-NOTES.md) — working notes and roadmap.
- [`docs/UPGRADE-PLAN.md`](docs/UPGRADE-PLAN.md) — upgrade history.

### Quick start

```bash
cd next-app
npm install
npm run dev        # http://localhost:3000
```

### Live

```text
GET /api/health
```

## Archive — `archive/`

Everything that is no longer in production, preserved for historical reference and
rollback. Includes the original PHP system, an early Next.js rewrite, and a master
ZIP with the original git history. **Do not deploy or modify it.**

See [`archive/ARCHIVE-README.md`](archive/ARCHIVE-README.md).

## Deployment

- Repository: `https://github.com/cauayancityathleteadmin-hash/cauayan-athlete-performance-monitoring-system1.0`
- Branch `main` auto-deploys to Vercel (project root directory: `next-app`).
- CI runs lint + build on every push to `main` via `.github/workflows/ci.yml`.