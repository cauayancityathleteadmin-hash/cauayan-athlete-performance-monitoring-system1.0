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