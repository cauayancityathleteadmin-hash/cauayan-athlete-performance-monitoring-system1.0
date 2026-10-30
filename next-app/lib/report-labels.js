// Pure formatting helpers and enum label maps shared by the official report
// cards and the reports page. No React, no Prisma — safe on the server (gSSP)
// and in the browser bundle.

export function formatDate(value) {
  const date = new Date(value);
  return isNaN(date) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value) {
  const date = new Date(value);
  return isNaN(date) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function computeAge(value) {
  const d = new Date(value);
  if (isNaN(d)) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

export function bmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal weight";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

export const GENDER_LABEL = { male: "Male", female: "Female", other: "Other", prefer_not_to_say: "Prefer not to say" };
export const STATUS_LABEL = { active: "Active", inactive: "Inactive", pending: "Pending", draft: "Draft", open: "Open", closed: "Closed", cancelled: "Cancelled", approved: "Approved", rejected: "Rejected" };
export const HEALTH_LABEL = { healthy: "Healthy", injured: "Injured", recovering: "Recovering", sick: "Sick", inactive: "Inactive" };
export const SESSION_TYPE_LABEL = {
  regular: "Regular",
  conditioning: "Conditioning",
  technical: "Technical",
  tactical: "Tactical",
  recovery: "Recovery",
  competition_simulation: "Competition Simulation",
  tryout: "Tryout",
};
export const FITNESS_LABEL = {
  endurance: "Endurance",
  strength: "Strength",
  power: "Power",
  speed_agility: "Speed / Agility",
  skill_technique: "Skill / Technique",
  mobility: "Mobility",
  recovery: "Recovery",
  general: "General",
};
export const EXERCISE_CATEGORY_LABEL = {
  warmup: "Warm-up",
  mobility: "Mobility",
  strength: "Strength",
  power: "Power",
  speed_agility: "Speed / Agility",
  endurance: "Endurance",
  skill_technique: "Skill / Technique",
  tactical: "Tactical",
  cooldown: "Cool-down",
  recovery: "Recovery",
};
