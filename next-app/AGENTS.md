<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PROJECT RULES (Cauayan City Athlete Performance Monitoring System)

These are standing, always-on rules for this project. Follow them on every change, without asking.

## Repo & deployment wiring
- GitHub repo (the ONE and ONLY deploy source for Vercel): `https://github.com/cauayancityathleteadmin-hash/cauayan-athlete-performance-monitoring-system1.0.git` (branch `main`).
- Working tree: `C:\Users\FUJITSU\Documents\Default Project\cauayan-athlete-performance-monitoring-system1.0` (`next-app/` is the active Next.js system; root PHP is legacy/deprecated).
- Vercel auto-deploys whatever is `main` HEAD — do NOT deploy to any specific pinned commit. Vercel project for the live site: `cauayan-athlete-performance-monitoring-system1-0`.
- Stable live URL: `https://cauayan-athlete-performance-monitor-indol.vercel.app` (auto-generated Vercel subdomain). The `...-l69igo14x` URL is a stale/throwaway alias and is NOT the live site.
- `7ec6ae5` and `1a63d7c` are historical commits, NOT deploy targets. The best/latest version is always the current `main` HEAD. Never pin a deploy to an old commit.

## Mandatory workflow after EVERY code update/upgrade
1. BACKUP FIRST: clone/snapshot the working tree to `C:\Users\FUJITSU\AppData\Local\Temp\opencode\backups\` (timestamped) before changing anything.
2. Verify locally: `postinstall` (prisma generate), lint (0 errors), `next build` compiles.
3. Commit + push to `main` (the repo above).
4. Confirm the Vercel production deployment for the new commit = SUCCESS (via GitHub deployments API).
5. Verify live: `GET https://cauayan-athlete-performance-monitor-indol.vercel.app/api/health` returns HTTP 200 `{"status":"ok","db":"up",...}`.

## Safety constraints
- Never run `npm audit fix --force` on this repo: it would downgrade Prisma 7->6 and/or force nodemailer 9.x (both breaking). The remaining audit flags (deepmerge-ts via Prisma; nodemailer raw-option advisory) are mitigated/not-exercised in this app and must NOT be force-fixed.
- Never remove or break the core purpose (athlete/assessment/event-plan monitoring, coach registration + admin approval).
- Always keep the best working version backed up for rollback.

