# PLAN: Training drill-down IA, static sidebar, comments on athletes & activities

Status: Approved (2026-09-14) — decisions locked via Q&A.
Scope: Pure IA / UX / data-model change for the Training feature. No new admin screens. No auth changes.

## Why
- The Training feature is a flat "Trainings" nav item + chevron submenu, which fights the actual
  information hierarchy: Training → Trainings → Training A → Athletes → Athlete X → activities & progress.
- Admin comments today live on the whole training (`TrainingNote`, "Notes & guidance" tab). The admin
  should talk directly to an athlete and/or a specific exercise instead of broadcasting to the plan.

## Approved decisions
1. Sidebar children under Training = STATIC (Trainings + Progress overview). No live plan list in the nav.
2. Plan detail page lands on the ATHLETES LIST by default (level 3 of the drill), Squad grid stays as a tab.
3. Activity comments support BOTH scopes: a general activity note (all athletes) and a per-athlete note.
4. Training-level notes are REMOVED entirely (tab + `TrainingNote` model).

---

## Target hierarchy (what the user confirmed)
```
Training                          ← sidebar feature (auto-reveals children while in use)
├─ Trainings                       ← /training-plans (level 2: list of trainings)
│  └─ Training A                   ← /training-plans/[id] (level 3: ITS ATHLETES by default)
│     └─ Athlete X                 ← /training-plans/[id]/athletes/[athleteId] (level 4)
│        └─ activities & progress  ← per-activity: status, completion, score, attempts, HISTORY, comments
└─ Progress overview               ← /progress (roster across all plans)
```
Every level is "a list that opens the next level." Breadcrumbs already narrate this; we make it
structural (default tab + richer drill page) and visible in the nav.

---

## 1. Sidebar: static children, no dropdown
File: `next-app/components/AppShell.js`

- REMOVE the chevron accordion: the `submenu` key on the Training link, `subOpen` state, and the
  conditional renderer with `▶`/child `<Link>` map.
- REPLACE with flat rendering of the Training group:
  - Parent `Training` = a plain `Link` to `/training-plans` (still navigates).
  - When the Training section is in use (`currentPath` is `/progress`, `/training-plans`,
    `/training-plans/...`), render the two static children beneath it as plain links:
    `Trainings` (/training-plans) and `Progress` (/progress).
  - When not in use, only the parent shows. No manual open/close state at all — purely
    `isActiveHref()`-driven. Active children get `navLinkActive`; parent gets it too while in section.
- Keep `matchesPath`-style prefix matching so drill pages keep the section expanded.

## 2. Plan detail: Athletes list is the default landing
File: `next-app/pages/training-plans/[id]/index.js`

- Change default `useState("squad")` to the athletes list.
- Tab bar becomes: `Athletes` (default) | `Squad view`. Remove the `Notes & guidance` tab.
- ATHLETES TAB (level 3 = list of athletes):
  - Compact roster table: athlete name / code / sport / healthStatus, per-plan latest completion
    (done · partial · missed · %), a per-athlete `Guidance (n)` inline comment thread
    (`AthletePlanComment`, already has GET/POST admin-only API), and `View progress →`
    to the drill page.
  - The heavy `AthleteActivitiesBlock` per-athlete edit grids move to a third tab
    `Plan activities` (same content, quieter default) so the roster stays a real list.
- SQUAD TAB (unchanged): Progress overview (TrainingCharts) + Daily training monitoring
  (MonitoringGrid) + coach AssessStudio.
- REMOVE notes machinery: `notes` state, `initialNotes` gSSP prop, `postNote`/`deleteNote`
  handlers, `prisma.trainingNote.findMany` in gSSP, the `notes` tab JSX, and the
  `/api/training-notes` route file (confirm no other callers) plus the `TrainingNote` model.

## 3. Drill page (level 4) = activities & progress, with history and comments
File: `next-app/pages/training-plans/[id]/athletes/[athleteId].js`

- Keep summary cards + score chart + fitness distribution.
- ACTIVITIES TABLE:
  - Keep columns: Activity, Fitness, Target, Latest status, Completion, Score, Attempts.
  - Make each row expandable (`<tr><td colSpan>…</td></tr>`) showing:
    - Full HISTORY of every `PlanActivityLog` for this activity+athlete (all, or latest 10),
      newest first: date, status, measured result (sec/m/kg/reps/sets/qty+unit via existing
      `logResultText` logic), score, attempts.
    - ACTIVITY COMMENT THREAD with a scope toggle: `This athlete` (athleteId set) vs
      `Everyone` (athleteId null). Admin posts; coach reads. General notes render a
      "Everyone" badge; per-athlete ones show the athlete name if viewing as admin.
- ATHLETE-LEVEL GUIDANCE on the page (between summary and activities): the same
  `AthletePlanComment` thread (reuse component) so the athlete level has its comments too.

## 4. Activity comments: model + API
File: `next-app/prisma/schema.prisma` (already-synced workflow: edit schema → `prisma db push`).

```prisma
model ActivityPlanComment {
  id         Int           @id @default(autoincrement())
  planId     Int           @map("plan_id")
  activityId Int           @map("activity_id")
  athleteId  Int?          @map("athlete_id") // null = general note for the activity
  authorId   Int           @map("author_id")
  body       String        @map("body")
  createdAt  DateTime      @default(now()) @map("created_at")
  plan       TrainingPlan  @relation(fields: [planId], references: [id], onDelete: Cascade)
  activity   PlanActivity  @relation(fields: [activityId], references: [id], onDelete: Cascade)
  athlete    Athlete?      @relation("ActivityPlanCommentAthlete", fields: [athleteId], references: [id], onDelete: Cascade)
  author     User          @relation("ActivityPlanCommentAuthor", fields: [authorId], references: [id])
  @@map("activity_plan_comments")
  @@index([activityId, athleteId])
}
```
Note: this adds 3 relations to existing models (PlanActivity, Athlete, User) — verify side
relation names don't collide (pattern: `AthletePlanComment` used `AthletePlanCommentAuthor`).

New route: `next-app/pages/api/training-plans/[id]/activities/[activityId]/comments.js`
- Security: mirror `athlete/[athleteId]/comments.js` (requireSession, CSRF on POST, rate
  limit, `setSecurityHeaders`).
- GET: admin or plan coach (plan owner) — returns all comments for the activity grouped by
  scope (`{ comments: [...] }` with `athlete` and `author` included).
- POST: admin only, body = `{ body, athleteId? }`; validate activity belongs to the plan;
  validate athlete belongs to the plan when scope is per-athlete.
- DELETE: admin only, author matches (mirrors deleteNote pattern used for plan notes).
Remove `TrainingNote` (model) — schema `prisma db push` handles Neon.

## 5. Files touched (summary)
- `next-app/components/AppShell.js` — flat Training children, no chevron.
- `next-app/pages/training-plans/[id]/index.js` — default athletes tab, roster list, remove notes.
- `next-app/pages/training-plans/[id]/athletes/[athleteId].js` — history rows + activity comments.
- `next-app/pages/api/training-plans/[id]/activities/[activityId]/comments.js` — NEW.
- `next-app/pages/api/training-notes/*` — deleted.
- `next-app/prisma/schema.prisma` — remove TrainingNote, add ActivityPlanComment.

## 6. Verification (standing workflow)
1. Backup snapshot to `C:\Users\FUJITSU\AppData\Local\Temp\opencode\backups\`.
2. ESLint changed files → 0 errors; `npm run build` compiles.
3. `prisma db push` (NO `--skip-generate`) to sync Neon.
4. Commit + push `main` → confirm prod deployment Ready.
5. `/api/health` 200; smoke: admin + coach on `/training-plans`, `/training-plans/[id]`,
   drill page, `/progress`; verify notes removal (no 404 references to `/api/training-notes`).

## 7. Risks / notes
- Removing `TrainingNote` discards any existing plan-level notes (approved). No archive step.
- Rushing the roster default could hide the AssessStudio; the Squad tab is one click away and
  keeps the coach workflow intact.
- Existing `AthletePlanComment` UI already ships; we relocate (not rebuild) its surface.