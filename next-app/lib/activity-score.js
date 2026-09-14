export const METRIC_TYPES = ["none", "time", "distance", "load", "reps", "sets", "quantity"];

export const METRIC_LABELS = {
  none: "None (done count)",
  time: "Time (how fast)",
  distance: "Distance",
  load: "Load",
  reps: "Reps",
  sets: "Sets",
  quantity: "Quantity",
};

export function resultFieldFor(metricType) {
  switch (metricType) {
    case "time": return "timeSec";
    case "distance": return "distanceDone";
    case "load": return "loadUsed";
    case "reps": return "repsDone";
    case "sets": return "setsDone";
    default: return "quantityDone";
  }
}

export function resultUnitFor(metricType) {
  switch (metricType) {
    case "time": return "sec";
    case "distance": return "m";
    case "load": return "kg";
    case "reps": return "reps";
    case "sets": return "sets";
    default: return "amt";
  }
}

export function targetValueFor(activity) {
  if (!activity) return null;
  switch (activity.metricType) {
    case "time": return activity.targetTimeSec == null ? null : Number(activity.targetTimeSec);
    case "distance": return activity.targetDistance == null ? null : Number(activity.targetDistance);
    case "load": return activity.targetLoad == null ? null : Number(activity.targetLoad);
    case "reps": return activity.targetReps == null ? null : Number(activity.targetReps);
    case "sets": return activity.targetSets == null ? null : Number(activity.targetSets);
    case "quantity": return activity.targetQuantity == null ? null : Number(activity.targetQuantity);
    default: return null;
  }
}

export function resultValueOf(log, metricType) {
  if (!log) return null;
  switch (metricType) {
    case "time": return log.timeSec == null ? null : Number(log.timeSec);
    case "distance": return log.distanceDone == null ? null : Number(log.distanceDone);
    case "load": return log.loadUsed == null ? null : Number(log.loadUsed);
    case "reps": return log.repsDone == null ? null : Number(log.repsDone);
    case "sets": return log.setsDone == null ? null : Number(log.setsDone);
    case "quantity": return log.quantityDone == null ? null : Number(log.quantityDone);
    default: return null;
  }
}

export function computeAutoScore(metricType, result, target) {
  if (metricType === "none" || result == null || result === "") return null;
  const r = Number(result);
  const t = Number(target);
  if (!Number.isFinite(r) || r < 0) return null;
  if (!Number.isFinite(t) || t <= 0) return null;
  let ratio;
  if (metricType === "time") {
    if (r <= 0) return null;
    ratio = t / r;
  } else {
    ratio = r / t;
  }
  if (ratio < 0) ratio = 0;
  const score = Math.round(Math.min(10, ratio * 10) * 10) / 10;
  return Math.min(10, Math.max(0, score));
}