# PLANNING NOTES — Cauayan Athlete Performance Monitoring System

Last updated: 2026-09-04. Status: **All three queued features (camera capture, bulk
add activities, bulk per-athlete assessment) are BUILT and DEPLOYED** (see below).
Blob upload now working with the new public store `store_kD9QHCbt1Ht5TQBJ`.

---

## 0. Context / what already exists (verified by code exploration)

- Training happens around **TrainingPlan → PlanActivity → athlete**, linked via a
  join table `TrainingPlanAthlete`. An activity is ONE shared row for all athletes
  in the plan.
- **Per-athlete targets (qty, sets, reps, distance, load) ALREADY exist** as
  per-athlete overrides via `PlanActivityTarget` (`pages/api/plan-activities/index.js`
  `create` accepts a `targets[]` array). API exists; friendly bulk UI is mostly missing.
- **Activity progress logging ALREADY exists** per athlete per activity
  (`PlanActivityLog` with `status` planned/done/partial/missed + quantityDone /
  setsDone / repsDone), but it is **created one row at a time** (no batch, no update).
- **Assessments** exist as a single rating (1–10) per athlete, optionally tied to a
  plan/fitness dimension (`training-assessments`). NOT batched, NOT per-activity.
- `ExercisePerformance` (sessions) has `score`/`scoreBreakdown` but **no API** to
  read/write it (essentially unused).
- Separate metrics-based assessment system (`/api/assessments`) IS batched (≤30 in
  one payload) but is about event metrics, not training activities.
- Login is fixed; ID-photo upload (required→optional) is deployed; blob upload works
  once the store is switched to **public** access (currently private → 500).
- **NEW public Blob store created by user:** `store_jSiYqYGn8LVjGHso`
  (public access). **ACTION PENDING (user):** update `BLOB_READ_WRITE_TOKEN` env var
  in Vercel to the new store's token, then Redeploy. Token value deliberately NOT
  written here (secret). After that, I verify uploads end-to-end.

---

## 1. Camera capture for ID photo (agreed direction, WAIT for go)

**✅ BUILT & DEPLOYED.** Added to `components/IdPhotoUpload.jsx`:
- A "Take photo" button beside "Choose photo" that opens the device camera via
  `navigator.mediaDevices.getUserMedia`, shows a live preview with Capture/Cancel.
- Captured frame is drawn to a square canvas, then runs the same crop/resize/upload
  path (2x2 square → 600×600 → JPEG → Vercel Blob).
- Graceful fallback message if camera is unavailable/usupported/permission denied.

**Plan in simple words:** Let coaches/athletes use their device camera to take their
ID photo directly, as an alternative to choosing a file.

**Tech:**
- Reuse the existing `components/IdPhotoUpload.jsx`.
- Add a second "Take photo" button beside "Choose photo".
- Opening the camera via `navigator.mediaDevices.getUserMedia({ video: true })`
  showing a live preview with a **Capture** + **Cancel** button (optional fallback to
  `<input type="file" accept="image/*" capture>` for phones).
- After capture, run the SAME existing crop/resize/upload path (2x2 square → 600×600
  → JPEG → Vercel Blob) and show the final preview.
- No DB/API/form changes — it all lives in the one component.

**Honest caveats:** Only works on devices with a camera + browser permission. Desktop
without a webcam silently lacks the option (Choose photo still works).

---

## 2. "Add all activities for all athletes at once" (under discussion)

**✅ BUILT & DEPLOYED.**
- New `bulk` action in `pages/api/plan-activities/index.js`: accepts an array of
  activities (each with shared plan target + optional `athleteTargets[]` overrides)
  and creates them all in ONE transaction. Shared target lives on the activity row
  (applies to all plan athletes); per-athlete overrides go to `PlanActivityTarget`.
  No duplicate activity rows per athlete. Cap of 50 activities per request.
- New "Bulk add" UI in `pages/training-plans/[id].js` (`BulkAddActivitiesForm`):
  add/remove several activity rows at once, each with name + fitness + shared target,
  plus per-athlete target overrides entered once (applies to all listed activities).

**What already exists:** functions at plan level — add an activity to a plan and all
plan athletes get it; per-athlete target overrides via `PlanActivityTarget`.

**Real gap the user wants:** a friendlier **bulk workflow** where a coach, when adding
an activity, sets a single shared target (qty, sets, reps...) and can tweak per-athlete
values, and add multiple activities across athletes quickly.

**Direction (if user confirms):** improve the Add-Activity UI / add a bulk screen so
coaches add several activities at once with shared + per-athlete targets. Reuse
`PlanActivityTarget`; do NOT duplicate activity rows per athlete.

**Honesty:** the data model already supports this; the work is UI/UX + maybe one more
bulk endpoint. Medium effort.

---

## 3. Coach assesses/scored each athlete on ALL their activities in ONE screen (agreed, WAIT for go)

**✅ BUILT & DEPLOYED.** Confirmed approach (open question #1): completion/effort +
optional comment per activity (writes to `PlanActivityLog`), NOT a forced numeric score
per row. An optional overall rating (1–10) + summary comment writes a single
`TrainingAssessment` per athlete (kept separate, avoids grade inflation).
Scope per user clarification: per **athlete** across activities, ONE screen, save once.
- New API `pages/api/plan-activity-logs/bulk-assess.js` (POST):
  `{ planId, athleteId, performedAt, rows: [{activityId, status, quantityDone, setsDone,
  repsDone, notes}], summaryRating?, summaryFitness?, summaryComments? }`.
  Replaces the athlete's existing logs for the plan's activities (delete + recreate) so
  re-saving overwrites rather than duplicating; optionally writes the summary assessment.
  Plan-ownership + on-plan checks enforced.
- New "Bulk assess athlete" panel in `pages/training-plans/[id].js` (`BulkAssessForm`):
  pick a plan athlete → see all their activities → set status (done/partial/missed),
  qty/sets/reps done, note for each → one Save. Pre-fills from any existing logs.

**User clarification:** NOT one assessment per activity. A coach opens ONE screen showing
an athlete's FULL set of training activities and fills a score/completion for all of them
at once, saving once.

**What does NOT exist today (this is the real gap):**
- `PlanActivityLog` is created one-at-a-time; there is NO batch-create and NO update.
- `TrainingAssessment` is one rating per athlete, not per activity, not batched.

**Proposed design (build on existing models, prefer logs over new scoring):**
- New UI: "Assess athlete" → shows all the athlete's current plan activities.
- For each activity the coach sets a status/completion + effort (e.g. quantity/sets done,
  and/or a simple score).
- **ONE submit** → batch-create (or update) `PlanActivityLog` rows for all activities.
- Optionally also write a batched `TrainingAssessment` summary per athlete (single overall
  rating) — kept separate, not per-activity, to avoid grade inflation.
- Progress rolls up from logs into the athlete's progress page (done % over time).

**Honesty / recommendation:**
- Recommend **completion + effort + optional comment** per activity rather than a numeric
  score on every single activity — a "score every activity" habit tends to inflate and
  become a data-entry chore with little insight.
- This feature is **genuinely new** and valuable; it is non-trivial (1 new/extended API +
  1 screen + progress rollup) but well within reach.

---

## Open questions for the user
1. Confirm the "assess all activities in one screen" should write to `PlanActivityLog`
   (completion/effort) and NOT force a numeric score on every row. (Recommended.)
2. Should the same bulk-assessment screen also be usable per **activity across athletes**
   (all athletes on one activity) — or only per **athlete across activities** (as stated)?
3. For the camera feature, prefer live-preview capture (nicer) vs. simple OS-camera
   (simplest)? Recommend live-preview capture.
