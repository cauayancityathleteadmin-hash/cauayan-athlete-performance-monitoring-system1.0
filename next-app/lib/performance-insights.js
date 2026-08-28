export function computeInsights(assessments) {
  const metricPool = {};
  const latest = {};

  for (const assessment of assessments) {
    for (const result of assessment.results) {
      const value = result.valueDecimal != null ? Number(result.valueDecimal) : null;
      if (value == null) continue;
      const mkey = result.metric.metricName;
      if (!metricPool[mkey]) metricPool[mkey] = [];
      metricPool[mkey].push(value);
      const akey = `${assessment.athlete.id}:${mkey}`;
      if (!latest[akey] || new Date(assessment.assessmentDate) >= new Date(latest[akey].date)) {
        latest[akey] = { athlete: assessment.athlete, metric: result.metric, value, date: assessment.assessmentDate, betterDirection: result.metric.betterDirection };
      }
    }
  }

  const sorted = {};
  for (const key of Object.keys(metricPool)) sorted[key] = [...metricPool[key]].sort((a, b) => a - b);

  function percentile(value, values) {
    if (values.length <= 1) return 100;
    let below = 0;
    for (const v of values) if (v < value) below += 1;
    return Math.round((below / values.length) * 100);
  }

  const athletes = {};
  const rows = Object.values(latest).map((entry) => {
    if (!athletes[entry.athlete.id]) athletes[entry.athlete.id] = {};
    const band = percentile(entry.value, sorted[entry.metric.metricName]);
    let trend = null;
    if (athletes[entry.athlete.id][entry.metric.metricName]) {
      trend = compareTrend(athletes[entry.athlete.id][entry.metric.metricName], entry.value, entry.betterDirection);
    }
    athletes[entry.athlete.id][entry.metric.metricName] = entry.value;
    return { athleteId: entry.athlete.id, athleteName: `${entry.athlete.firstName} ${entry.athlete.lastName}`, metricName: entry.metric.metricName, unit: entry.metric.unit || "", value: entry.value, date: entry.date, band, trend, betterDirection: entry.betterDirection };
  });

  rows.sort((a, b) => a.athleteName.localeCompare(b.athleteName) || a.metricName.localeCompare(b.metricName));
  return rows;
}

export function compareTrend(prev, current, betterDirection) {
  if (prev == null || current == null) return null;
  if (prev === current) return "same";
  const better = betterDirection === "higher" ? current > prev : betterDirection === "lower" ? current < prev : null;
  if (better == null) return "neutral";
  return better ? "up" : "down";
}

export function toCsvRows(insights) {
  const header = ["Athlete", "Metric", "Latest Value", "Unit", "Date", "Percentile", "Better Direction", "Trend"];
  const body = insights.map((row) => [
    row.athleteName,
    row.metricName,
    row.value,
    row.unit,
    row.date,
    `${row.band}%`,
    row.betterDirection,
    row.trend || "",
  ]);
  return [
    header,
    ...body,
  ].map((cols) => cols.map(escapeCsv).join(",")).join("\r\n");
}

function escapeCsv(value) {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
