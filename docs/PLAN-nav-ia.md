# Sidebar Navigation Plan (revised 2026-09-14)

Status: planned (not started)
Owner: plan revision approved — waiting for go

## Goal

Replace the flat, scrolling menu with a feature-grouped sidebar that stops
forcing users to scroll: features with multiple screens get collapsible
sub-menus, the group in use auto-opens, single-screen features stay one-click,
and deep content (Training > Trainings > Training A > Athletes > Athlete X) is
navigated with pages + breadcrumbs — NOT sidebar folders.

## Current state (facts from code)

- `next-app/components/AppShell.js:136-198` — `NAV_GROUPS` defines the nav; all
  items render flat (`AppShell.js:251-268`). No sub-menus.
- `Training` group has exactly one link today: `Training` -> `/training-plans`.
- Sidebar icons-only state in localStorage `apms.sidebarCollapsed`
  (`AppShell.js:240-249`).
- Mobile drawer reuses the same nav markup (`AppShell.js:305`).

## Sidebar philosophy (approved rules)

1. **1-screen feature -> plain link, always visible.** Dashboard, Athletes,
   Reports, Account. Never hide a single-screen feature behind a click.
2. **2-6 screens -> collapsible sub-menu.** Coaches (4), Analytics (2),
   Events & Program (2), System (3, admin), Training (2 soon).
3. **Auto-expand in use.** The group whose screen you're on is always expanded
   (you never get lost in a collapsed menu). Other groups stay closed.
4. **Length rule (future).** Only if a sub-menu exceeds ~6-7 items, divide it
   again with collapsible sub-groups inside. Never deeper than 2-3 levels; past
   that, redesign the feature or add menu search. Not built today — no group
   needs it.
5. **Sidebars hold fixed features, not live data.** Plans/athletes belong on
   pages (see drill-down below), never as sidebar folders.

### Data model

- `NAV_GROUPS` entries get optional `children: [{ href, label, icon }]`.
- An item with `children` renders as an expandable parent (icon + label +
  chevron; `aria-expanded` + `aria-controls`, keyboard operable).
- Open/closed state remembered in localStorage beside `apms.sidebarCollapsed`.

## Training first — drill-down (pages + breadcrumbs)

- Parent **Training**, children: **Trainings** -> `/training-plans`.
- Below a plan (navigated ON SCREENS with breadcrumbs:
  `Training > Trainings > Training A > Athletes > Athlete X`):
  - Plan page **default tab: Squad view** — today's monitoring grid (kept as the
    primary assess/record screen; zero extra clicks for the weekly routine).
  - Plan page second tab: **Athletes under this training** — enrolled athletes
    list (name, code, sport, completion %, avg score), click to drill.
  - **Athlete's progress & activities** at
    `/training-plans/[planId]/athletes/[athleteId]` — activities across weeks +
    scores, attempts, time trend, progress charts.
- Later children once built: **Progress overview** -> `/progress` (roster-wide
  "who's slipping").
- Other groups stay flat; they gain sub-menus when they gain sub-pages,
  per the rules above.

## Permissions & safety

- Children filtered by existing `adminOnly` / `coachApproveOnly`
  (`AppShell.js:254`); drop the parent entirely if nothing remains.
- `isActive` (`AppShell.js:215`) matches children hrefs; active child
  highlighted, its parent shown active + expanded.

## Icons-only collapsed sidebar

- Collapsed mode: a parent behaves as a plain nav item to its first child
  (nothing unreachable); children aren't listed in tiny mode.

## Mobile drawer

- Same markup; parents/children full-width tap targets; chevron rotates;
  no hover-only behavior.

## CSS

- `.navParent` (button), `.navChevron`, `.navChildren` (indent),
  `.navChildLink`, active/hover variants matching `.navLinkActive` (:231).

## Verification

- ESLint on changed files (0 errors), `npm run build`.
- Smoke: admin + coach see Training expand/collapse; active Training page
  auto-opens the group; icons-only mode reaches Training; mobile toggle works.

## Config / deploy notes

- Deploy source: `main` @ cauayan-athlete-performance-monitoring-system1.0
  -> Vercel project `cauayan-athlete-performance-monitoring-system1-0` (live
  `https://cauayan-athlete-performance-monitor-indol.vercel.app`).
- Prisma 7: plain `prisma db push` (no `--skip-generate`). No schema change
  expected for this task.