# Phase 1 Research — DepEd PFT Mapping & Starter Norms

**Source:** DepEd Order No. 34, s. 2019 — "Revised Physical Fitness Tests Manual"
**Status:** Framework documented — **actual norm values need to be transcribed from the official manual**

---

## 1. Fitness Type → DepEd PFT Battery Mapping

| System Fitness Type | DepEd PFT Test | Primary Metric | Notes |
|---|---|---|---|
| `endurance` | 3-Minute Step Test | time (recovery HR) / quantity | Cardiovascular endurance |
| `strength` | Push-Up / Basic Plank | reps / time | Muscular strength |
| `power` | Standing Long Jump | distance | Explosive leg power |
| `speed_agility` | 40-Meter Sprint / Hexagon Agility Test | time | Speed & agility |
| `skill_technique` | Paper Juggling / Coordination tests | reps / quantity | Sport-specific — no direct DepEd general test |
| `mobility` | Sit and Reach / Zipper Test | distance / score (1-5) | Flexibility |
| `recovery` | (Not in general PFT) — HR recovery after step test | quantity (bpm drop) | Derived from 3-min step test recovery |

**Gaps to address:**
- `skill_technique` — No general DepEd test; check PSC/NSA sport-specific standards
- `recovery` — Not a standalone PFT test; can use HR recovery from 3-min step test

---

## 2. DepEd PFT Norm Table Structure

The official manual provides classification bands by **age group** and **sex** (Male/Female). Typical age bands:
- 6-7, 8-9, 10-11, 12-13, 14-15, 16-17, 18+
- Or: Elementary (6-12), Junior HS (13-15), Senior HS (16-18), Adult (18+)

Classification tiers (per DepEd PFT Manual):
- **Excellent** (5)
- **Very Good** (4)
- **Good** (3)
- **Fair** (2)
- **Needs Improvement** (1)

---

## 3. Starter Norms Data Structure (for Phase 2)

```javascript
// lib/starter-metrics.js (new file)
export const STARTER_NORMS = {
  // endurance → 3-Minute Step Test (recovery heart rate, bpm after 1 min)
  endurance: {
    metric: "time",           // primary metric is time, but starter is HR recovery
    test: "3-Minute Step Test",
    unit: "bpm",
    betterDirection: "lower", // lower recovery HR = better fitness
    norms: {
      male: {
        "10-11": { excellent: 80, veryGood: 90, good: 100, fair: 110, needsImprovement: 120 },
        "12-13": { ... },
        "14-15": { ... },
        "16-17": { ... },
        "18+":   { ... },
      },
      female: {
        "10-11": { ... },
        "12-13": { ... },
        "14-15": { ... },
        "16-17": { ... },
        "18+":   { ... },
      },
    },
  },

  // strength → Push-Up (reps in 30 sec or max)
  strength: {
    metric: "reps",
    test: "Push-Up",
    unit: "reps",
    betterDirection: "higher",
    norms: {
      male: { "10-11": { excellent: 25, veryGood: 20, good: 15, fair: 10, needsImprovement: 5 }, ... },
      female: { "10-11": { excellent: 20, veryGood: 15, good: 10, fair: 5, needsImprovement: 2 }, ... },
    },
  },

  // power → Standing Long Jump (cm)
  power: {
    metric: "distance",
    test: "Standing Long Jump",
    unit: "cm",
    betterDirection: "higher",
    norms: {
      male: { "10-11": { excellent: 180, veryGood: 160, good: 140, fair: 120, needsImprovement: 100 }, ... },
      female: { "10-11": { excellent: 160, veryGood: 140, good: 120, fair: 100, needsImprovement: 80 }, ... },
    },
  },

  // speed_agility → 40-Meter Sprint (seconds)
  speed_agility: {
    metric: "time",
    test: "40-Meter Sprint",
    unit: "sec",
    betterDirection: "lower",
    norms: {
      male: { "10-11": { excellent: 6.5, veryGood: 7.0, good: 7.5, fair: 8.0, needsImprovement: 8.5 }, ... },
      female: { "10-11": { excellent: 7.0, veryGood: 7.5, good: 8.0, fair: 8.5, needsImprovement: 9.0 }, ... },
    },
  },

  // skill_technique → Paper Juggling / Coordination (reps)
  skill_technique: {
    metric: "reps",
    test: "Paper Juggling",
    unit: "reps",
    betterDirection: "higher",
    norms: {
      male: { "10-11": { excellent: 50, veryGood: 40, good: 30, fair: 20, needsImprovement: 10 }, ... },
      female: { "10-11": { ... }, ... },
    },
    source: "DepEd PFT Manual — Coordination subtest",
  },

  // mobility → Sit and Reach (cm) — uses 1-5 score in DepEd
  mobility: {
    metric: "distance",
    test: "Sit and Reach",
    unit: "cm",
    betterDirection: "higher",
    norms: {
      male: { "10-11": { excellent: 30, veryGood: 25, good: 20, fair: 15, needsImprovement: 10 }, ... },
      female: { "10-11": { excellent: 35, veryGood: 30, good: 25, fair: 20, needsImprovement: 15 }, ... },
    },
  },

  // recovery → HR Recovery after 3-min step test (bpm drop in 1 min)
  recovery: {
    metric: "quantity",
    test: "3-Minute Step Test (Recovery)",
    unit: "bpm",
    betterDirection: "higher", // bigger drop = better recovery
    norms: {
      male: { "10-11": { excellent: 40, veryGood: 35, good: 30, fair: 25, needsImprovement: 20 }, ... },
      female: { "10-11": { ... }, ... },
    },
  },
};
```

---

## 4. Age Group Helper

```javascript
export function ageGroupFor(birthdate) {
  const age = Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  if (age <= 7) return "6-7";
  if (age <= 9) return "8-9";
  if (age <= 11) return "10-11";
  if (age <= 13) return "12-13";
  if (age <= 15) return "14-15";
  if (age <= 17) return "16-17";
  return "18+";
}

export function sexFor(gender) {
  // AthleteGender: male, female, other, prefer_not_to_say
  if (gender === "male") return "male";
  if (gender === "female") return "female";
  return "male"; // fallback to male norms for other/prefer_not_to_say
}

export function getStarterNorm(fitnessType, gender, birthdate) {
  const ageGroup = ageGroupFor(birthdate);
  const sex = sexFor(gender);
  const norm = STARTER_NORMS[fitnessType]?.norms?.[sex]?.[ageGroup];
  if (!norm) return null;
  // Return the "Good" (middle) band as default starter target
  return {
    value: norm.good,
    unit: STARTER_NORMS[fitnessType].unit,
    band: "good",
    ageGroup,
    sex,
    test: STARTER_NORMS[fitnessType].test,
  };
}
```

---

## 5. Source Citations (to fill in)

| Fitness Type | DepEd Test | Manual Page/Section | Notes |
|---|---|---|---|
| endurance | 3-Minute Step Test | [TODO: page] | Recovery HR at 1 min post-exercise |
| strength | Push-Up | [TODO: page] | Max reps in 30 seconds |
| power | Standing Long Jump | [TODO: page] | Best of 3 attempts in cm |
| speed_agility | 40-Meter Sprint | [TODO: page] | Time in seconds, 2 trials best |
| speed_agility | Hexagon Agility Test | [TODO: page] | Alternative agility measure |
| skill_technique | Paper Juggling | [TODO: page] | Coordination |
| mobility | Sit and Reach | [TODO: page] | cm, uses 1-5 classification |
| mobility | Zipper Test | [TODO: page] | Alternative shoulder flexibility |
| recovery | HR Recovery (Step Test) | [TODO: page] | Derived from step test |

---

## 6. Next Steps

1. **Transcribe actual norm values** from DepEd Order No. 34, s. 2019 (PDF available from DepEd website)
2. **Verify age bands** match the manual's exact groupings
3. **Fill in all `norms` tables** above with real numbers
4. **Add source citations** (page numbers) for each
5. For `skill_technique` and sport-specific gaps: check PSC/NSA standards or mark "no official Philippine benchmark found — needs coach input"

---

**Phase 1 Gate:** All norm tables transcribed with source citations → proceed to Phase 2.