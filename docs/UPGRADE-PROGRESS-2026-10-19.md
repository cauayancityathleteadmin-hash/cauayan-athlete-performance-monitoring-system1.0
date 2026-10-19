# Upgrade progress — 2026-10-19 (session log)

Baseline before this session: `e705add` (Dashboard triage: "Needs attention" + "Next event").
Every item below was linted (0 errors), build-verified, committed to `main`, deployed by
Vercel, and confirmed via live `GET /api/health` 200 + the 46-check live regression suite
(46 passed / 0 failed). A full snapshot + git tag was taken before and after the batch.

## Done in this session

| Commit | Plan item | What shipped |
|---|---|---|
| `2bbb67c` | §6 Standing | “By Points” / “By Medals” (Olympic gold-first) toggle; competition-level column (best level reached); top-3 podium cards; “By School” delegation tally (Palaro-style); record-holder ★ badges. New rank engine `rankByMedals` + `bestLevel`/`LEVEL_LABELS` in `lib/points.js` (single source). |
| `3f7606a` | §3 Athlete Profile | In-page section tabs via `PageSectionTabs` (Overview, Health, Progress, Trends, Assessments, Training, Events, Documents, Status, Notes) with scroll-spy + `#hash` deep links. AGENTS.md tab list updated. |
| `8c4997f` | §12 Eligibility | New `GET /api/athletes/:id/eligibility` returning `{required, validUploaded, missing[], expiring[], expired[], complete, percent}` from the shared `lib/compliance.js` rule. Athletes roster now shows an **Eligibility** column per athlete (Clear / missing / expired / expiring). |
| `dac76f8` | §11 Small wins | Retired the orphan `/admin/training-metrics` (in-memory editor that never persisted) → redirects to `/admin/metrics`. Document types now display their default validity period. |

Phase 5 of §6 was confirmed already complete: achievements live only under Standing;
`/standings/[athleteId]` lists every achievement; the old Achievements panel is gone from
the athlete profile (no duplicate).

## Still open (not started this session)

- §2 Athletes: full server-side pagination/sort via URL (partly present), `schoolYear`
  season field + Season filter (needs migration).
- §4 Assessments: standard test batteries, per-metric trend + target line, admin
  classification bands, Personal bests board, N+1 batch fix (Q-M12), A4 export.
- §5 Training: plan phase (Preparation/Competition/Transition), Session RPE + weekly load
  chart + spike warning, completion rate, split the 1,291-line plan page (Q-H4). Needs migration.
- §6 remaining: Season filter (needs `schoolYear`), CSV/print medal-tally export.
- §7 + §15 Events: event level field, readiness gate, age-band check, **results entry →
  auto-achievement → Standing points** (needs migration).
- §8 Coach workload view + evaluation timeline/trends.
- §9 Reports rewrite + report catalog (large).
- §10 Analytics deep dive (attendance heatmap, injury vs load, distributions, sport compare).
- §13 Notification center (bell, `Notification` model — needs migration; unify with audit log).
- §14 Data layer: `getServerSession` helper for all pages, `withErrorHandling` API wrapper,
  shared `lib/metrics.js` aggregates.
- Known open items: athlete-facing login role (original brief) unbuilt; 8 npm audit vulns
  (nodemailer via next-auth) intentionally not force-fixed; live DB admin password still
  the old seed value (rotation recommended, not done to avoid lockout).

## Health
`main` HEAD `dac76f8` → live `https://cauayan-athlete-performance-monitor-indol.vercel.app`
`/api/health` = 200 `{"status":"ok","db":"up"}`; regression 46/46.
