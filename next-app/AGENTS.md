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

## Navigation: Plain Sidebar + Tabs Per Feature (standing convention)
- Sidebar = main features only (Dashboard, Training, Athletes, Coaches, Settings, Admin). No nested sub-items, no sub-feature links, no scroll-shortcuts.
- Tabs = sections inside a feature. Any feature page long/complex enough to need in-page navigation gets tabs (reuse `components/PageSectionTabs.js`), not sidebar nesting and not a scroll-anchor shortcut bar.
- Qualifying checklist for tabs (same as before):
  1. The page has 3+ distinct stacked sections.
  2. It requires meaningful scrolling to reach later sections.
  3. The sections belong to one page/feature (not separate routes).
- Exclude: Dashboard, Athletes (list), Coaches (list) — these don't need tabs.
- Tabs live inside the page component only; sidebar is never modified for sub-feature navigation.
- Sections must have stable `id` anchors; the tabs component handles URL hash deep-linking (`#sectionId`).
- Current pages with tabs: `/analytics`, `/athletes/[id]/progress`, `/training-plans/[id]`, `/training-plans/[id]/athletes/[athleteId]`, `/admin/catalog`.

## Layout, spacing & copy standard (standing convention)
Only ONE value per use case; all values come from the token scale (`--space-1..8`, `--radius-*`, defined in globals.css AND Dashboard.module.css `:root`). NEVER hardcode off-token px (18/20/22/26/28px…).
- Section gap between stacked panels/sections: `var(--space-6)` (32px) — shared `.content` rule covers `section+section`, `section+div`, `div+section`; don't add per-page overrides that fight it.
- Panel padding: `var(--space-7)` (48px) desktop; `var(--space-4)` (16px) at ≤700px (single rule, no duplicate breakpoints).
- Nested detail panels: `var(--space-5)` (24px) via `.detailPanel` — never inline `padding` on it.
- Stat-card row gap: `var(--space-4)` (16px). Content grid items: `var(--space-5)` (24px).
- Auth cards: one width `var(--auth-card-width)` (420px), padding `var(--space-6)`.
- Settings/AppShell forms: `.formStack` (max-width 560px); never cap panels with inline `maxWidth`.
- Container standard (single source of truth, duplicated as a comment in Dashboard.module.css above `.panel`): default box recipe = `border:1px solid var(--border)`, radius `var(--radius-xl)`, bg `rgba(10,50,40,.93)`; panel padding `var(--space-7)`/`var(--space-4)` mobile; small boxes/kpi/stat cards padding `var(--space-4)` gap `var(--space-3)`; chips/badges/micro-gaps keep their compact sizes; all inline container styles must use tokens, never raw px (10/14/18/22…).
- Page title: `.pageTitle h1` `clamp(24px,3.5vw,32px)` — LARGER than panel h2 `clamp(22px,3vw,28px)`. Every top-level page has a real in-content `<h1>` page title; sidebar span alone doesn't count.
- Buttons: `.primary/.secondary` (12px/24px padding); row/table controls `.btnSm`; panel-header action = 13px text link or `.btnSm`. Never hand-roll `padding: 3-4px 8px` inline.
- Copy/terms: "Rating" = 1–10 coach/training rating; "Score" = assessment performance scores; "Completion" = done/partial % of planned activities. "Training plans", "Event plans", "Assessments". Verbs: "Approve" (never "Reapprove"), "Delete" (never "Remove"), no redundant suffixes (drop "coach" on a coach page). Labels ≤ 3 words where possible.
- Charts & graphs: single source of truth = `lib/chart-config.js` (heights, margins, tooltip, grid, axes, legend, colors; import it, never re-declare). All chart color/label values come from the theme tokens (`--accent` #2dd4a8, `--muted` #86efac, `--warning` #fbbf24, `--danger` #f87171; `muted` neutral series = #428763 = muted at 45% over panel). No off-theme slates (#64748b/#9db6c7/#94a3b8/#ffc107) or arbitrary oranges/purples on charts, chips, meters, or badges. Same data kind = same color everywhere (done=accent, partial=warning, missed=danger, open/inactive=muted).

