# Phase 2: Confirm/Complete Training Detail's Scope

## Current State
Training Detail (`/training-plans/[id]`) has:
- **Overview** - Charts + Monitoring grid + Assessment
- **Trends & Charts** - Charts only
- **Athletes** - Roster table with "See Progress" → `/training-plans/[id]/athletes/[athleteId]`

Athlete Drill Page (`/training-plans/[id]/athletes/[athleteId]`) has:
- **Overview** - Stat grid + Activity table with history + comments
- **Activities** - Activity management
- **Trends & charts** - Completion trend, Metric trend, Radar, Activity completion
- **Distribution** - Activities by fitness dimension

## Gaps to Fill (from Phase 1)

### Add to Athlete Drill Page:
1. **Training Assessments** tab - Training rating trend per fitness dimension
2. **Exercise Performance** tab - Exercise scores, RPE, trends
3. **Attendance** tab - Training attendance logs
4. **Achievements** tab - Achievements list
5. **Health/Wellness** tab - Recent health logs

### Add to Training Detail:
- Optional: Cross-plan roster view (enhancement for admin/coach overview)

---

## Implementation Plan

### Step 1: Extend Athlete Drill Page Sections
Update `ATHLETE_SECTIONS` to include new tabs:
```javascript
const ATHLETE_SECTIONS = [
  { label: "Overview", sectionId: "overview" },
  { label: "Activities", sectionId: "activities" },
  { label: "Trends & charts", sectionId: "trends" },
  { label: "Distribution", sectionId: "distribution" },
  { label: "Assessments", sectionId: "assessments" },      // NEW
  { label: "Exercise Performance", sectionId: "performance" }, // NEW
  { label: "Attendance", sectionId: "attendance" },          // NEW
  { label: "Achievements", sectionId: "achievements" },      // NEW
  { label: "Health", sectionId: "health" },                  // NEW
];
```

### Step 2: Fetch Additional Data in gSSP
Add to `getServerSideProps`:
- `trainingAssessment` for this plan + athlete
- `exercisePerformance` for this athlete
- `trainingAttendance` for this athlete
- `achievement` for this athlete
- `healthLog` for this athlete

### Step 3: Implement New Section Components
Each new section renders charts/tables similar to the standalone Progress page but scoped to the training plan.

### Step 4: Test
Verify all new tabs show data correctly for a real athlete with data.

---

## Phase 2 Test Criteria
- [ ] Training Detail tabs unchanged and working
- [ ] Athlete Drill Page has 9 tabs (4 original + 5 new)
- [ ] Each new tab shows accurate, scoped data
- [ ] Charts render without errors
- [ ] Mobile responsive
- [ ] No console errors