# Full System Upgrade Plan — Maximum Potential per Feature
**Date:** October 18, 2026
**Grounded in:** live code audit (3 reports), Palarong Pambansa/DepEd research, sports-science research (periodization, load monitoring, overtraining prevention, fitness testing)
**Rule:** every upgrade must keep the current theme, pass build/lint, follow the backup → verify → deploy workflow

---

## How to read this plan (plain words)

For every feature you have, this document says:
1. **What it does today** — honest, no sugarcoating
2. **What research says it should do** — from Palaro rules, DepEd sports programs, and real sports-science practice
3. **The upgrade** — the maximum-potential version, what to display and what data it needs
4. **Effort** — small (hours), medium (1–2 days), large (3+ days)

Nothing here changes the look/theme. Upgrades add data, smarter displays, and better feedback.

---

# 🔵 TIER 1 — CORE FEATURES (the reason the system exists)

---

## 1. Dashboard
**Today:** Shows counts, recent activity, 8-week attendance buckets (computed slowly in JS), coach performance averages, unbounded audit count. Not cached. Loads a lot, shows little insight.

**Research says:** A coach's home screen should answer three questions in 5 seconds: *Who needs attention? How is training going? What's coming up?* Sports science monitoring (ACSM/NSCA practice) tracks: training load trend, wellness flags, attendance rate, and upcoming competition countdown.

**Upgrade — display these panels:**
| Panel | Data | Why |
|---|---|---|
| **Athletes needing attention** | List where healthStatus ≠ fit OR attendance < 70% last 2 weeks OR document expiring ≤ 30 days | The #1 job of a dashboard is triage |
| **Training load trend** (line chart) | Weekly total volume = Σ(sets × reps × load) per athlete/team over 8 weeks — already stored in `ExercisePerformance` | Research: progressive overload needs the trend visible; sudden spikes = injury risk (overtraining research) |
| **Attendance pulse** | % present this week vs last week, per sport | Instant team-status read |
| **Recovery flags** | Athletes with 2+ consecutive "fatigued" health logs or resting-HR trend up | Overtraining signs (Wikipedia: elevated resting HR, persistent fatigue) |
| **Competition countdown** | Next active event plan: days remaining, roster readiness % (docs complete / athletes confirmed) | Ties training to the actual goal |
| **Points race snapshot** | Top 3 per most-active sport from Standing | Motivation + ties features together |

**Data needed:** all exists already — just aggregate in SQL (fixes audit finding Q-M2 at the same time).
**Effort:** medium

---

## 2. Athletes (list)
**Today:** Fetches the **entire table** (2–3× for coaches), ships it all to the browser, filters client-side. Works with 50 athletes, breaks at 1,000 (audit Q-H2).

**Research says:** Rosters in real programs are managed by **school year / season**, filtered by sport and district, with eligibility status front and center (Palaro: athletes must qualify through Intramural→District→Provincial→Regional).

**Upgrade:**
- Server-side pagination + search + sort (use existing `paginatePrisma`) — ship 25 rows at a time
- **Season/School year field** on athlete (default SY 2025–2026) — Palaro is annual; without seasons, history muddles
- **Eligibility strip** per row: medical valid? dental valid? documents complete? age-eligible? → colored badge "Palaro-ready / Missing X"
- Columns: Photo, Name, Sport, Event, School, Coach, Health, **Points (Standing)**, Eligibility
- Filter chips: Sport, Health, Eligibility incomplete, Has upcoming event
- **CSV export** (already have the helper)
- Bulk selection → bulk actions (assign coach, export, mark attended)

**Data needed:** `schoolYear` column (migration), eligibility computed from existing document expiry data.
**Effort:** medium

---

## 3. Athlete Profile (`/athletes/[id]`) — the flagship page
**Today:** Identity, assessments, status/coach/health history, achievements, coaching notes (bug now fixed), participants, training plans, documents, photo. **866 lines**, 7 components, reloads entire page after every save (`router.reload()` ×7).

**Research says:** An athlete record in a school sports program is effectively a **sports file**: identity + eligibility paperwork + medical clearances + fitness test history + training history + competition record + growth/development tracking. Philippine DepEd requirements: PSA/birth certificate, Form 137/138, medical (3-month expiry), dental (6-month expiry), ID photo, school ID, consent — **all already implemented**. ✅

**Upgrade — tab structure (top of page):**
| Tab | Contents | Max-potential additions |
|---|---|---|
| **Overview** | Identity card, health badge, points + Standing rank, eligibility checklist, coach, school | QR-style athlete code (already have codes), print-one-page ID summary |
| **Fitness** | Assessment history, metric trends (line charts), **normative comparison** | Add standard DepEd/Palaro fitness test battery as preset metrics: strength (push-ups, sit-ups 1min), flexibility (sit-and-reach), speed (50m/100m), agility (shuttle run), endurance (beep test / 1km run). Show **percentile vs same sport/age band** |
| **Training** | Plans they're in, per-plan progress, session attendance history | Volume-load sparkline per week (progressive overload visibility) |
| **Competition** | Achievements (= Standing points source), event participations, **medal tally** | Medal breakdown chip (G-S-B), points total, district→city migration already handled |
| **Health** | Health logs, injury/illness timeline, recovery trend chart | Wellness quick-log (sleep quality, soreness, mood 1–5) — overtraining research: these are the leading indicators |
| **Documents** | All requirement docs with expiry countdown (3mo medical / 6mo dental) | Auto-highlight "renew now" ≤14 days; **eligibility score** (x/8 requirements) |
| **Notes** | Coaching notes timeline (now actually working) | @-mention coach, pin important notes |

**UX fixes bundled (audit U-H5/H6, Q-M10):** replace `router.reload()` with targeted state updates + clear "Saved ✓" / "Error ✗" messages that don't vanish.
**Effort:** large (but highest user value in the whole system)

---

## 4. Assessments (Fitness Testing)
**Today:** Record assessment → results per metric. Batch endpoint does 60 serial queries (Q-M12). Charts exist.

**Research says:** Fitness testing is the backbone of school sports programs. It must show **change over time** and **classification vs standards**, not raw numbers.

**Upgrade:**
- **Standard test batteries** as one-click templates (sprint, strength, endurance, flexibility) — admin already has Metrics; add "battery" grouping
- **Trend + target line per metric**: current value, previous value, Δ%, direction arrow (📈 improving)
- **Classification bands** (admin-configurable): e.g. 50m sprint "Excellent/Good/Average/Needs work" per age/sex — this is how DepEd actually scores fitness tests
- **Personal bests board** on the athlete's Fitness tab
- Fix N+1: batch-validate with two `findMany({id: {in: [...]}})` queries
- Export assessment as printable A4 (print stylesheet already exists)
**Effort:** medium

---

## 5. Training Plans (+ Activities + Per-athlete pages)
**Today:** Plans with weeks/days, activities, logs, evidence upload, comments, per-athlete progress views. The **largest files in the codebase** (1,291-line detail page). Activity logs fetched twice, one unbounded (Q-H4). No periodization concept.

**Research says (periodization):** Real programs are structured in **blocks** (preparation → competition → transition), with planned progression of volume and intensity. Session-RPE (Borg 6–20 or CR-10 scale) is the global standard for session load: **sRPU = duration × RPE**. Tracking this is how overtraining is prevented.

**Upgrade:**
| Add | Display | Data needed |
|---|---|---|
| **Plan phase** | Phase badge per week: Preparation / Competition / Transition (admin picks when creating plan) | `phase` enum on plan week or plan |
| **Session RPE** | After logging a session, coach picks RPE 1–10 → session load = minutes × RPE shown in log | `rpe Int?` + `durationMin` on `PlanActivityLog` |
| **Weekly load chart** | Bar chart of session loads across plan weeks — spike >30% vs previous week = red warning | Computed from logs (overtraining prevention!) |
| **Completion rate** | Per plan: % activities completed on time, % athletes at target | Existing status data |
| **Auto progression hint** | "Load increased 12% this week — good progression" or "Spike 45% — consider spreading" | Threshold logic in points/load engine style |
| **Fix perf** | Single capped log query (Q-H4), split the 1,291-line file | — |

**Effort:** medium for fixes, medium for RPE + charts
**Standing tie-in:** completed plan sessions could feed "consistency" micro-stats on Standing detail.

---

## 6. Standing (Achievements Moved) — the new feature
**Today:** Phases 1–4 done: points engine (7 levels, 5 medals, large-team ×0.5, record +20%), district→city migration, list with per-sport default + All Sports toggle, shared-rank ties, detail view. **Phase 5 pending** (verify detail vs profile, then remove old Achievements section).

**Research says (Palaro):** Since 2014 Palaro ranks by the **Olympic medal system** (gold-first); before that it used a point system. Our hybrid (medal-first tiebreak + points total) is defensible and already decided. Palaro has **39 sports disciplines**; progression is Intramural→District→Provincial→Regional→National.

**Upgrade after Phase 5:**
| Feature | Display | Data |
|---|---|---|
| **Medal table view** | Toggle: "By Points" / "By Medals (Olympic system)" — honors real Palaro practice | Existing achievement data |
| **Level column** | Show achievement level per row (Barangay/School/District-City/Regional/National/Palaro/International) | Existing |
| **Season filter** | "All-time" (current) + per school-year | Add `schoolYear` (shared with Athletes upgrade) |
| **Podium header** | Top 3 as podium cards on list page | Existing |
| **Team/school aggregate** | Secondary tab: standings **by school** (medal count) — Palaro ranks delegations this way | Group by schoolId |
| **CSV/print export** | Official-looking medal tally sheet (print stylesheet) | Existing helper |
| **Record badges** | Highlight achievements flagged as record (+20% already applied) | Existing |
**Effort:** small-medium (Phase 5 first, then these)
**➡ Do Phase 5 next:** verify every achievement appears in `/standings/[athleteId]`, then remove Achievements from `pages/athletes/[id].js` (lines 444–469).

---

# 🟢 TIER 2 — MANAGEMENT FEATURES

---

## 7. Events (Event Plans + Participants)
**Today:** Create events, rosters, applications (coach apply → admin review), participant status. Missing from middleware (fixed). Table unusable on phones (U-M3).

**Research says (Palaro):** Events mirror the real ladder — meet types should be **Intramurals, District/Cluster Meets, Division, Regional, National (Palaro)**. Eligibility checks happen at entry: medical validity, age/weight class, school enrollment.

**Upgrade:**
- **Event level field**: Intramural / District / Division / Regional / National (dropdown) → shows on every card
- **Readiness gate**: before confirming roster, show checklist — athlete docs valid? medical in date? duplicates in same event? → red/amber/green per athlete
- **Auto age/age-band check** against event rules (store min/max age or birth-year band on event)
- **Results entry**: placement + medal per participant → **auto-creates achievement → points update immediately** (this closes the loop: Event → Result → Achievement → Standing)
- Countdown + venue/travel info card
- Phone-responsive card layout instead of wide table
**Effort:** medium-large (results entry is the big win — it makes Standing semi-automatic)

---

## 8. Coaches / Evaluations / Approvals / Accounts (admin suite)
**Today:** Coach CRUD, registration with Turnstile + approval codes, performance evaluations, account management. Security of approval codes now CSPRNG ✅. Restore endpoint has a mass-assignment hole (**H-02 — fix first, Phase A**).

**Upgrade:**
- **Coach workload view**: athletes assigned, plans led, attendance rate of their team → informs evaluations with data
- **Evaluation history timeline** per coach + average trend
- **Approvals inbox**: pending coaches with elapsed wait time, one-click approve/reject with note (partially exists — add elapsed-time sort + bulk)
- **Workload alert**: coach with >N athletes flagged (good practice)
- Generic sign-in error (security M-05, Phase A)
**Effort:** small-medium

---

## 9. Reports
**Today:** **Fetches the whole database** per view (Q-H1 — will break at 1,000 athletes). Official A4 print stylesheet exists ✅. CSV exports uneven (U-M8).

**Upgrade:**
1. **First: rewrite the data layer** — SQL aggregates (`groupBy`/`count`), per-section lazy fetch. This is non-negotiable for scale.
2. **Report catalog** (max potential), each grounded in real program needs:
   | Report | Content |
   |---|---|
   | Masterlist of Athletes | Name, school, sport, eligibility, photo grid — the #1 DepEd request |
   | Fitness Test Summary | Per-sport averages, pass/fail vs standards, top improvers |
   | Attendance & Training Summary | Session completion, attendance %, missed sessions |
   | Medical/Document Compliance | Who's expiring/expired — 3mo medical, 6mo dental |
   | Medal Tally / Standing | Official medal table (Olympic-style) + points |
   | Event Delegation Report | Roster + readiness for a chosen event (Palaro delegation list) |
   | Coach Workload | Athletes, plans, evaluation scores |
   | Injury/Illness Log | Health events timeline for the school year |
3. **Scheduling**: "Email me monthly" (email lib exists) — cron already exists for backups
4. CSV export for every report (share one `downloadCsv`)
**Effort:** large (data-layer rewrite is the critical piece)

---

## 10. Analytics
**Today:** Charts of assessments/attendance/performance. Underpowered vs data available.

**Upgrade:**
- **Load & wellness dashboard**: weekly team volume trend, RPE distribution, flag weeks (spike detection)
- **Injury correlation view**: injuries vs load spikes (research: overload precedes injury)
- **Progress distributions**: histogram of metric change — who's improving, plateauing, declining
- **Attendance heatmap**: athletes × weeks grid (one glance shows reliability)
- **Standing trends**: points earned per week/sport
- **Sport comparison**: per-sport health, attendance, medal efficiency (points per athlete)
- All fed by SQL aggregation (shares engine with upgraded Reports/Dashboard)
**Effort:** large (but mostly reuses the same aggregate queries)

---

## 11. Metrics & Document Types (admin catalogs)
**Today:** CRUD for performance metrics and document requirement types. Metrics admin links fine; `/admin/training-metrics` is **orphaned** (U-M1).

**Upgrade:**
- **Units + direction + bands per metric**: unit (sec, cm, kg, reps), "higher is better" vs "lower is better", and classification bands → drives Assessments classification upgrade
- **Test batteries**: group metrics into named batteries (DepEd Fitness Test, sport-specific)
- Document types: show which are **required vs optional**, who must present them, default validity period (medical 90 days, dental 180 days — already coded; make it visible config)
- Adopt or remove orphan `/admin/training-metrics`
- Add default Palaro sport list (39 disciplines) to catalog seed
**Effort:** small

---

## 12. Documents (Athlete compliance)
**Today:** Upload with magic-byte validation ✅, expiry dates, required-by-default types ✅. Bytes stored in Postgres (Q-M3 — bloats DB and backups).

**Upgrade:**
- **Compliance dashboard**: overall % complete, expiring soon list, per-sport breakdown
- **Renewal reminders**: notification center entry (see §14) + banner on profile
- **Move file bytes → Vercel Blob** (metadata stays in DB) — follows existing `PlanEvidence` pattern
- **Eligibility API**: one endpoint `GET /api/athletes/:id/eligibility` returning `{complete, missing[], expiring[]}` — reused by Athletes strip, Events gate, Reports
**Effort:** medium (blob migration needs careful backup-first workflow)

---

# 🟡 TIER 3 — PLATFORM FEATURES

---

## 13. Notifications (currently silent)
**Today:** Email/SMS lib exists but **failures are swallowed** (Q-L10). No in-app notification center (UX U-M7). Users don't know things happened.

**Research says:** In any ops system, the difference between "has data" and "is used" is **pushing the right signal to the right person at the right time**.

**Upgrade — notification center (bell icon in AppShell):**
| Trigger | Who |
|---|---|
| Document expiring ≤ 14 days / expired | Coach + Admin |
| Health status set to injured/ill | Coach + Admin |
| Approval code requested | Admin approver |
| Coach application pending > 48h | Admin |
| Session logged / missed | Coach |
| Achievement saved → points changed | Athlete-side (future), Coach |
| Backup failed / rate-limit trip | Admin |
| Event readiness not green 7 days before | Coach + Admin |

- New `Notification` model (userId, type, link, readAt) — polling or 60s refresh
- Show unread count on bell; click → list with deep links
- Surface email/SMS failures as non-blocking warning banners (fixes silent failures)
- **Unify with existing audit log** — don't duplicate, notifications are "unread, actionable", audit is "historical record"
**Effort:** medium-large (model + delivery + UI)

---

## 14. Analytics-ready Data Layer (shared foundation)
Not a user-facing feature but **the thing that makes 7–12 possible** — bundle from audits:
- `getServerSession` helper for all 27 pages (Q-M1 — kills HTTP self-call)
- `withErrorHandling` API wrapper (Q-H6 — always JSON errors)
- Shared aggregates module (`lib/metrics.js`): load, attendance, compliance, points
- `gsspData` cache on Dashboard
**Effort:** medium, do once, benefits everything

---

## 15. Standing — closing the loop with Events
Once Events can record results (§7), achievements **auto-generate** from competition outcomes: place → medal → points. Today coaches enter achievements manually — fine, but auto-creation from event results removes double entry and makes Standing trustworthy.
**Effort:** small (once §7 results exist)

---

# 🔴 TIER 4 — AUDIT ITEMS STILL OWED (from SYSTEM-AUDIT-2026-10-18)

These aren't "features" but they gate the upgrades above:

**Phase A — security remainder (do first):**
1. **H-02**: column allowlist on backup restore (last real hole)
2. Rate limiting → DB-backed everywhere, fail-closed on auth (M-01/M-02)
3. Remove hardcoded test passwords from seed (M-04)
4. Generic login errors (M-05), no raw error details to clients (M-06)
5. Import row cap (M-08)

**Phase C — UX baseline (do alongside Tier 1):**
- Custom `404.js` / `500.js` / `_error.js` (themed — U-H1)
- Route progress bar in `_app.js` (U-H4)
- AppShell mobile nav state split + real modal behavior (U-H2/H3)
- Form success/error distinct styling + no instant reload wipe (U-H5/H6)
- Table accessibility: `scope="col"`, labeled search (U-M5/M6)

**Phase B — scale:** covered by §2 (athletes), §9 (reports), §14 (data layer), §5 (training logs), §10 (dashboard aggregates).

---

# 📅 RECOMMENDED SEQUENCE (honest effort sizing)

| Order | Work | Why first | Size |
|---|---|---|---|
| **1** | **Standing Phase 5** (verify + remove old panel) | Already started; build-then-remove discipline | small |
| **2** | **Phase A security** (H-02 etc.) | Last real vulnerability | small |
| **3** | **UX baseline** (404/500, progress bar, nav fix, form feedback) | Cheap, visible trust win | small-med |
| **4** | **Data layer foundation** (§14) | Unblocks everything else | medium |
| **5** | **Dashboard upgrade** (§1) | Most-visited page, uses new aggregates | medium |
| **6** | **Athletes list server-side** (§2) | Scale + eligibility strip | medium |
| **7** | **Documents compliance + eligibility API** (§12) | Powers 3 other features | medium |
| **8** | **Athlete Profile tabs** (§3) | Flagship, biggest UX gain | large |
| **9** | **Events results → auto achievements** (§7+§15) | Makes Standing automatic | medium |
| **10** | **Training RPE + load charts** (§5) | Injury prevention, research-backed | medium |
| **11** | **Reports rewrite + catalog** (§9) | Scale enabler + real deliverables | large |
| **12** | **Notification center** (§13) | Makes system proactive | medium-large |
| **13** | **Analytics deep dive** (§10) | Now cheap — reuses aggregates | medium |

Total: roughly **2–3 focused weeks** for everything, or pick tiers.

---

# 🎯 WHAT THE SYSTEM LOOKS LIKE WHEN DONE (honest vision)

**A coach opens the app and sees:** who's hurt, who's slipping on attendance, what's expiring, load trends with spike warnings, and days to the next meet. One click to any athlete's complete sports file — eligibility, fitness percentiles, training load, medal record, health timeline. Recording a meet result instantly updates the Standing points table, which exports as an official medal tally.

**An admin sees:** compliance percentages across all schools, a workloading view of coaches, delegation readiness before Palaro, and a report center that generates the masterlists DepEd actually asks for — in seconds, not timeouts.

**The system stops being a record-keeper and becomes a decision-maker.** Every number on screen maps to a real practice: progressive overload, overtraining prevention, eligibility rules, and the Palaro points model.

**Honest caveats:**
- The scale fixes (reports/athletes) are the least glamorous but most important — without them nothing else matters at growth
- Notification center needs careful scoping or it becomes noise
- Athlete-facing login (in the original brief) is still unimplemented — decide: build it or amend the brief
- Every schema change follows backup → migrate → verify → deploy (AGENTS.md), never `migrate dev` (shadow-replay bug)
- The 8 remaining npm audit vulns stay until nodemailer can be upgraded without `--force` — mitigated, not solved
