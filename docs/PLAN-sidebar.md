# PLAN: Sidebar sub-features (deferred — for later)

Status: planned (not started) — future work; parked by request.
Owner: deferred 2026-09-15 — user asked to focus on feature fixes first,
deal with sidebar sub-features later, then plan the sidebar.

## What we already did (shipped, commit `c1d7f75`)

- Removed the auto-reveal sub-feature under the Training nav item
  (`children: [Trainings, Progress]` in `next-app/components/AppShell.js`).
- **Progress** was promoted from a nested child to a plain top-level item
  (Training group now = `Training` + `Progress`), because `/progress` had no
  other entry point in the app — deleting it outright would have orphaned the
  page.
- Removed the now-dead `<Link>` children renderer branch and added a
  `trendingUp` nav icon. The sidebar is now fully flat (no nesting anywhere).

## Why deferred

The user wants to focus on fixing all features first; sidebar structure is
cosmetic and can wait. This doc exists so the future sidebar decision is not
lost.

## Open questions for later (nothing decided yet)

1. Should any nav item regain an expandable submenu (e.g. Trainings vs
   Training detail vs Progress), and if so via a real chevron now that the
   auto-reveal behavior is gone?
2. Where does **Progress** belong long-term: its own top-level item (current),
   or bundled back under Training?
3. Coach vs admin nav differences: currently role-gated links are filtered
   per item; is that enough, or should whole groups appear/disappear by role?
4. Mobile nav and the collapsed sidebar: any fixes needed now that nesting is
   gone (e.g. search, group sections)?
5. Icons/labels consistency across all groups (e.g. "My account" vs "Account").

## Scope guard

Keep this OUT of feature-fix plans (`PLAN-training-consistency.md` and
friends) so sidebar work is decoupled. Nothing here is scheduled.