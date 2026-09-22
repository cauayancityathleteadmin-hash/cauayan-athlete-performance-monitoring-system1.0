# Standing (Achievements) — Plan & Verification Log

Goal: promote athlete achievements out of the Athlete Profile into a dedicated **Standing** feature — a flat, top-level sidebar item → a ranked list of athletes (per-sport default, All-Sports toggle) → per-athlete achievement detail view (achievements only). The ranking uses a real Philippine points model (DepEd Palarong Pambansa incentives + PSC athlete-classification tiers), documented before any code is written.

---

## Phase 0 — Ground rules (from request)

- **Build first, remove second.** Do NOT touch the Athlete Profile's Achievements section until the Standing feature fully replaces it (list + detail view) and is verified.
- **Theme unchanged.** No new colors, no off-token spacing, no logo/branding changes.
- **Sidebar rule:** Standing is a new, **flat, top-level** sidebar item — no nesting, no sub-items (matches the standing navigation convention: sidebar = main features only).
- Work phase by phase; verify each phase before moving to the next.

---

## Phase 1 — Ranking method (locked decisions)

### Following real Philippine sports precedent
- **DepEd Palarong Pambansa incentive structure**: individual/small-team medalists are paid more per person (₱3,000 / ₱2,000 / ₱1,000 for Gold/Silver/Bronze) than large-team medalists (₱1,500 / ₱1,000 / ₱500) — an individual medal represents more personal achievement than one member's share of a team win. We mirror this as a **roughly 2× weight** (large teams ×0.5).
- **PSC athlete classification tiers**: International (SEA/Asian/Olympics) → National (Palarong Pambansa / Batang Pinoy / Philippine National Games) → Regional → Provincial → City/Municipal → Barangay → School. The ranking ladder follows this real tiering.
- **4th place scores, not zero**: the real Palaro model gives points down to 4th place; we keep a small 4th-place value, and Participation (no placement) scores 0–2 points below national level.
- **Record bonus**: mirrors DepEd's record-holder incentive — **+20% of the achievement's base points** (rounded).

### Locked decision summary (confirmed with user, 2026-09-22)
1. ✅ Point table below approved **as proposed**.
2. ✅ Level migration: existing `district` achievements map to **`city`**; `intramural` stays as the school-level tier.
3. ✅ Record-breaking bonus: **+20% of base points**.
4. ✅ Ranking scope: **per-sport default + an "All Sports" combined view**.
5. ✅ Ranking period: **all-time**.
6. ✅ Tie handling: **shared rank + tiebreak** (same points = same rank number, e.g. 1, 2, 2, 4; row order within the tie: gold count → silver count → bronze count → most recent achievement → last name asc).
7. ✅ Naming: label/heading becomes **"Standing"**, **route stays `/standings`** (no redirects, dashboard links keep working).

### Point table — individual / small-team (≤3 players), ×1
| Level | Gold | Silver | Bronze | 4th | Participation |
|---|---|---|---|---|---|
| Intramural (school) | 4 | 3 | 2 | 1 | 0 |
| Barangay | 6 | 4 | 3 | 2 | 1 |
| City/Municipal (was "district") | 10 | 7 | 5 | 3 | 2 |
| Provincial | 15 | 11 | 8 | 5 | 3 |
| Regional | 22 | 16 | 11 | 7 | 4 |
| National (Palarong Pambansa / Batang Pinoy / PNG) | 30 | 22 | 15 | 10 | 5 |
| International (SEA / Asian / Olympics) | 40 | 30 | 20 | 13 | 6 |

**Event-type factor**: individual & small-team (≤3 players) = **×1**; large team (≥4 players) = **×0.5**.
**Record bonus**: +20% of that achievement's base points (round to nearest int).
**Final per-achievement points** = round( base(level,medal) × eventFactor × (1 + (isRecord ? 0.2 : 0)) ).

Standard "medal" sheet: gold, silver, bronze, fourth, participation. (Event type per event — admin-editable in the Sports & Events catalog; new `eventCategory` on `Event`.)

**Phase 1 test (decision step):** table is complete and covers every level/medal the system tracks (intramural→international, gold→participation, 4th included), modeled on the sources above — locked before any code. ✅

---

## Phase 2 — Audit current achievement data ✅ (audit complete)

### Where achievements currently live
- **Data**: `Achievement` Prisma model (schema.prisma ~line 488): `achievementTitle`, `achievementType` (Medal/Qualification/MVP/Champion), `achievementDate`, `organization`, `description`, `medal`, `level`, `sportId`, `eventId`, `certificateUrl`. Fully populated via the Athlete Profile form.
- **UI (old location)**: Athlete Profile `/athletes/[id].js` — "Recognition → Achievements" panel (add form `AchievementForm` + read-only list). This is the **only** place achievements can be added today.
- **Existing standings**: `/standings` already exists (nested in the sidebar "Analytics" group, label "Standings") with a static medal×level `PointsConfig` table — but it has NO event-type weighting, NO 4th place, NO record bonus, NO per-athlete detail view, and rows link to the full athlete profile.
- **Live data (Neon)**: 11 achievements, 6 sports. Levels in use: `intramural`, `district`, `regional`, `national`. Medals: gold/silver/bronze/participation. `Event` table has **no team-type field**.
- **PointsConfig** is read by BOTH `pages/standings.js` AND `pages/reports.js` (Performance Summary) — the new formula must become the single source of truth for both.

### Data structure verdict
Everything needed for ranking + detail view exists (title, level, medal, date, sport, event). Missing/small additions required:

| Change | Model | Why |
|---|---|---|
| `eventCategory` (enum: `individual`/`smallTeam`/`largeTeam`, default `individual`) | `Event` | event-type weighting (≤3 players ×1, ≥4 players ×0.5). Admin-editable in catalog. |
| `isRecord` (Boolean, default false) | `Achievement` | +20% record bonus. |
| medal value `fourth` (4th place) | `Achievement` (string) | Palaro-style 4th-place points. |
| level migration `district` → `city` | `Achievement.level` | map to the locked City tier (existing data only). |
| Level vocabulary: Intramural, Barangay, City, Provincial, Regional, National, International | form + seed + sample-data | full ladder. |

**Phase 2 test (audit step):** confirmed the data is complete enough to build ranking + detail view; the five additions above are the only gaps. ✅

---

## Phase 3 — Build the Standing list

- **Sidebar**: move `/standings` out of the "Analytics" group → new **flat top-level** group "Standing" (trophy icon). Label "Standing". Dashboard card text updated to "Standing".
- **Points engine** (`lib/points.js` rewrite): export the point table constants, `eventFactor`, `computeAchievementPoints(achievement, event)`, `computeTotalPoints`, `medalCounts` (now incl. 4th place), and a `rank(entries)` helper implementing the locked tiebreak. **Single source of truth** — also used by `pages/reports.js` and the detail view.
- **gSSP** (`pages/standings.js`): load athletes + achievements (with `sport`, `event` incl. `eventCategory`, `coach`, `school`); compute scores server-side; default view = per-sport (first active sport), with an "All sports" option. Scope filter for coaches stays (own athletes only).
- **List UI**: Rank (shared ranks per locking), Athlete (links to new detail view), Sport, Coach, School, Achievements, Medals chips (gold/silver/bronze), Points. Zero-achievement athletes shown at the bottom (ranked after scorers, still visible).
- Rows link to `/standings/[athleteId]` (the new detail page — NOT the profile).

**Phase 3 tests**: (1) ranks match hand-computed palaro points for seeded athletes; (2) per-sport vs all-sports switch works; (3) tie = shared rank with gold→silver→bronze→recency→name order; (4) zero-achievement athletes render at bottom, not broken.

---

## Phase 4 — Athlete achievement detail view

- **New page** `pages/standings/[athleteId].js`: achievements ONLY (title, type, level, medal, placement, date, sport/event, organization, description, record flag, points per achievement + total). Most recent first. No training progress, no activity data, no unrelated charts.
- **Access control**: admin or the athlete's own coach (same rule as the profile) — else 307/403.
- Clean, consistent container/spacing (`.panel`, `.detailPanel`, tokens); back link to `/standings`.

**Phase 4 tests**: detail shows complete accurate data for the selected athlete and nothing else; unauthorized coach is blocked.

---

## Phase 5 — Migrate/remove from the old location (only after Phases 3–4 verified)

- Side-by-side check first: every achievement visible on `/athletes/[id]` appears in the new Standing detail view.
- **Move the add-achievement form** from the profile into the Standing detail view (so achievements can still be recorded — the profile was the only add path). The profile's Achievement form receives the new medal (4th), level ladder, and record checkbox.
- **Remove** the "Recognition → Achievements" panel from `/athletes/[id].js` (delete `AchievementForm` + panel; keep the page's other panels untouched) — per lock: no data lost, nothing broken, no dead links.

**Phase 5 tests**: full side-by-side diff (no achievement missing/mutated); no broken links to the old location; achievements still addable via the new detail view.

---

## Phase 6 — Full regression pass

- Ranks accurate + update when a new achievement is added (add one live, confirm point/rank change).
- Detail views complete for several athletes.
- Old profile Achievements panel gone, nothing else broken on the profile page.
- Sidebar correct: "Standing" flat + top-level, no nesting; theme unchanged.
- Responsive (mobile) Standing list + detail view; console clean (no hydration/API errors).
- Poor-data-path checks: achievement with missing level/medal scores 0 (shown, not crashed); team event without an event link defaults to individual ×1 (documented).

---

## Delivery workflow (repeated after every code phase)
1. Timestamped backup of the working tree → `C:\Users\FUJITSU\AppData\Local\Temp\opencode\backups\`.
2. `npm run lint` → 0 errors; `next build` compiles.
3. Commit + push to `main` (cauayancityathleteadmin-hash repo).
4. Vercel production deploy SUCCESS (ignore the 3 pre-existing dead-project failures per commit).
5. Live `/api/health` 200 + new buildId; mirror `C:\xampp\htdocs\athlete_monitoring_system` (next-app + github_source) reset to new HEAD with hash verification.
6. Never `npm audit fix --force`. Leave pre-existing scratch scripts alone.

---

## Verification log

| Phase | Result |
|---|---|
| 1 — Ranking method | ✅ locked 2026-09-22 (decisions above; research complete) |
| 2 — Data audit | ✅ audit complete (11 live achievements; POINTS_CONFIG read sites mapped) |
| 2 — Data model + engine | ✅ schema (EventCategory enum, eventCategory, isRecord); migration (district→city, team categories); points engine (lib/points.js); consumers updated (standings, reports, API, form, catalog); seeds updated; lint 0, build OK; live /api/health 200; mirrors synced |
| 3 — Standing list | ⏳ pending |
| 4 — Detail view | ⏳ pending |
| 5 — Migration/removal | ⏳ pending |
| 6 — Full regression | ⏳ pending |