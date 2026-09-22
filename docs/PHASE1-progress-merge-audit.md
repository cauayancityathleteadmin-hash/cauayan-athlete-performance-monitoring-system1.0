# Phase 1 Audit: Standalone Progress Feature → Training Merge

## 1. Current "Progress" Features

### A. Training Plans Page - "Progress" Tab (`/training-plans` → "Progress" tab)
**Component:** `RosterProgress` (defined in `pages/training-plans.js`)
**Data source:** `/api/progress?roster=1`
**Shows:**
- Bar chart: Latest completion % per athlete across all coach's plans (admin: all plans)
- Table: Athlete | Plan | Planned | Done | Partial | Missed | Completion% | Rating | View button
- Scope: All athletes on coach's plans (admin: all)

### B. Standalone Athlete Progress Page (`/athletes/[id]/progress`)
**File:** `pages/athletes/[id]/progress.js`
**Data sources (gSSP):**
- `trainingAssessment` (ratings by fitness dimension)
- `exercisePerformance` (exercise scores, RPE)
- `trainingAttendance` (session attendance)
- `planActivityLog` (plan activity logs)
- `achievement` (achievements)
- `healthLog` (health history)

**Tabs & Content:**
1. **Overview** - Live stats cards: Latest training rating, Best/avg performance score, Sessions present
2. **Training**
   - Training rating trend (MiniTrend chart + table of last 10 assessments)
   - Exercise score trend (MiniTrend chart + table of last 10 performances)
   - Strengths by fitness dimension (avg rating, latest rating, count per dimension)
3. **Performance**
   - Effort overview: Attendance counts (present/late/excused/absent), Activity logs (done/partial/missed), Completion rate, Attendance rate
   - Achievements: Full list with medals, levels, types, orgs, descriptions
4. **Recognition** (Wellness)
   - Recent health history (health logs with status badge, description, date)

### C. Training Detail - Athlete "See Progress" (`/training-plans/[id]/athletes/[athleteId]`)
**File:** `pages/training-plans/[id]/athletes/[athleteId].js`
**Data sources (client fetch):** `/api/progress?planId=X&athleteId=Y`, `/api/plan-activity-logs`, `/api/plan-activities`

**Tabs & Content:**
1. **Overview** - Stat grid (Planned, Completion%, Missed, Coach rating) + Activity table with expandable history + comments
2. **Activities** - Same as Overview but focused on activity management (add/edit/remove via `AthleteActivitiesBlock`)
3. **Trends & charts** - Completion trend (day/week/month), Metric trend (with target reference line), Radar chart (fitness balance), Activity completion bar chart
4. **Distribution** - Activities by fitness dimension (bar chart)

---

## 2. Gap Analysis: What's in Progress but NOT in Training

### From Standalone Athlete Progress (`/athletes/[id]/progress`) → Missing in Training Athlete Drill Page:

| Feature | In Standalone Progress | In Training Athlete Drill | Status |
|---|---|---|---|
| **Training rating trend per fitness dimension** | ✅ Strengths by area panel | ❌ | **MISSING** |
| **Exercise performance scores** (`exercisePerformance` model) | ✅ Best/avg score, score trend | ❌ Only plan activities | **MISSING** |
| **Training attendance** (`trainingAttendance` model) | ✅ Effort overview panel | ❌ Only plan activity logs | **MISSING** |
| **Achievements** | ✅ Full achievements panel | ❌ | **MISSING** |
| **Health history** (`healthLog` model) | ✅ Recent health panel | ❌ | **MISSING** |
| **Overall performance score trend** (all exercises) | ✅ MiniTrend chart | ❌ | **MISSING** |

### From Training Plans "Progress" Tab (`RosterProgress`) → In Training Detail:

| Feature | In Training Plans Progress Tab | In Training Detail | Status |
|---|---|---|---|
| **Roster-wide completion across ALL plans** | ✅ Bar chart of all athletes on coach's plans | ❌ Training Detail only shows athletes on THIS plan | **PARTIAL GAP** |
| **Per-athlete rating per plan** | ✅ Table with Rating column | ❌ Training Detail roster shows latest rating per athlete on THIS plan only | **PARTIAL GAP** |
| **View button → Athlete progress** | ✅ Links to `/training-plans/[id]/athletes/[athleteId]` | ✅ Already exists | ✅ COVERED |

---

## 3. Decision: What to Merge Where

### Merge into Training Athlete Drill Page (`/training-plans/[id]/athletes/[athleteId]`):
Add new sections/tabs for:
- **Training Assessments** tab: Show training rating trend per fitness dimension (strengths by area)
- **Exercise Performance** tab: Show exercise scores, RPE, trends (from `exercisePerformance` model)
- **Attendance** tab: Show training attendance (from `trainingAttendance` model)
- **Achievements** tab: Show achievements
- **Health/Wellness** tab: Show recent health logs

### Merge into Training Detail (`/training-plans/[id]`):
- Enhance "Athletes" tab to optionally show cross-plan roster view (or add a new "Roster" tab that mirrors the Progress tab's RosterProgress)

### Remove:
- Standalone `/athletes/[id]/progress` page (after merge verified)
- Keep `/api/progress` endpoint (used by both Training Detail and Athlete Drill)

---

## 4. Phase 1 Test Complete ✅

**Gap list documented above. Ready for Phase 2.**