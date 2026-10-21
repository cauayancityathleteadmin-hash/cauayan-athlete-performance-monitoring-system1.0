import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";
import { TIER_META, CLASSIFICATION_TIERS } from "../../lib/starter-metrics";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };
  const [events, metrics] = await Promise.all([
    prisma.event.findMany({ where: { status: "active" }, orderBy: { eventName: "asc" }, include: { sport: true } }),
    prisma.performanceMetric.findMany({ orderBy: { metricName: "asc" }, include: { event: { include: { sport: true } } } }),
  ]);
  return { props: { session, events: JSON.parse(JSON.stringify(events)), metrics: JSON.parse(JSON.stringify(metrics)) } };
}

const DATA_TYPES = { decimal: "Decimal", integer: "Integer", text: "Text" };
const BETTER = { higher: "Higher is better", lower: "Lower is better", neutral: "Neutral" };

async function postNorm(body) {
  const csrf = await fetch("/api/csrf").then((r) => r.json());
  const response = await fetch("/api/admin/fitness-norms", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
    body: JSON.stringify(body),
  }).catch(() => null);
  const result = response ? await response.json().catch(() => ({})) : {};
  return { ok: !!(response && response.ok && !result.error), error: result.error, data: result };
}

function FitnessNormsEditor() {
  const [rows, setRows] = React.useState([]);
  const [fitnessTypes, setFitnessTypes] = React.useState([]);
  const [seeded, setSeeded] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState({ kind: "", text: "" });
  const [activeType, setActiveType] = React.useState("");
  const [draft, setDraft] = React.useState({}); // `${sex}|${ageGroup}|${tier}` -> string

  const load = React.useCallback(async () => {
    setLoading(true);
    const data = await fetch("/api/admin/fitness-norms").then((r) => r.json()).catch(() => null);
    if (data) {
      setRows(data.rows || []);
      setFitnessTypes(data.fitnessTypes || []);
      setSeeded(data.seeded || 0);
      setActiveType((prev) => prev || data.fitnessTypes?.[0]?.key || "");
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetch("/api/admin/fitness-norms").then((r) => r.json()).catch(() => null);
      if (cancelled) return;
      if (data) {
        setRows(data.rows || []);
        setFitnessTypes(data.fitnessTypes || []);
        setSeeded(data.seeded || 0);
        setActiveType((prev) => prev || data.fitnessTypes?.[0]?.key || "");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const typeRows = rows.filter((r) => r.fitnessType === activeType);
  const sexes = [...new Set(typeRows.map((r) => r.sex))];
  const ageGroups = [...new Set(typeRows.map((r) => r.ageGroup))];
  const activeMeta = fitnessTypes.find((f) => f.key === activeType) || {};
  const anyVerified = typeRows.some((r) => r.verified);

  const draftKey = (sex, ageGroup, tier) => `${sex}|${ageGroup}|${tier}`;
  const cellValue = (row, tier) => {
    const k = draftKey(row.sex, row.ageGroup, tier);
    return k in draft ? draft[k] : (row.tiers[tier] ?? "");
  };

  async function saveCell(row, tier) {
    const k = draftKey(row.sex, row.ageGroup, tier);
    if (!(k in draft)) return;
    const value = Number(draft[k]);
    if (!Number.isFinite(value)) { setMessage({ kind: "danger", text: "Value must be a number." }); return; }
    setBusy(true);
    const res = await postNorm({ action: "set", fitnessType: activeType, sex: row.sex, ageGroup: row.ageGroup, tier, value });
    if (res.ok) {
      setDraft((d) => { const n = { ...d }; delete n[k]; return n; });
      setRows((rs) => rs.map((r) => (r.sex === row.sex && r.ageGroup === row.ageGroup && r.fitnessType === activeType) ? { ...r, tiers: { ...r.tiers, [tier]: value } } : r));
      setMessage({ kind: "success", text: `Saved ${activeMeta.label || activeType} · ${row.sex} · ${row.ageGroup} · ${TIER_META[tier]?.label || tier} = ${value}` });
    } else {
      setMessage({ kind: "danger", text: res.error || "Could not save." });
    }
    setBusy(false);
  }

  async function toggleVerified(row) {
    setBusy(true);
    const res = await postNorm({ action: "set", fitnessType: activeType, sex: row.sex, ageGroup: row.ageGroup, tier: CLASSIFICATION_TIERS[2], value: cellValue(row, CLASSIFICATION_TIERS[2]), verified: !row.verified });
    if (res.ok) {
      setRows((rs) => rs.map((r) => (r.fitnessType === activeType && r.sex === row.sex && r.ageGroup === row.ageGroup) ? { ...r, verified: !row.verified } : r));
      setMessage({ kind: "success", text: `Marked ${row.sex} · ${row.ageGroup} ${!row.verified ? "verified" : "unverified"}.` });
    } else {
      setMessage({ kind: "danger", text: res.error || "Could not update." });
    }
    setBusy(false);
  }

  async function resetType() {
    if (typeof window !== "undefined" && !window.confirm(`Reset ${activeMeta.label || activeType} to the built-in reference bands? Admin edits for this fitness type are removed.`)) return;
    setBusy(true);
    const res = await postNorm({ action: "reset", fitnessType: activeType });
    if (res.ok) { setDraft({}); setMessage({ kind: "success", text: `Reset ${res.data?.deleted ?? 0} rows. Refresh to reload the defaults.` }); await load(); }
    else setMessage({ kind: "danger", text: res.error || "Could not reset." });
    setBusy(false);
  }

  async function seedAll() {
    setBusy(true);
    const res = await postNorm({ action: "seed" });
    if (res.ok) { setMessage({ kind: "success", text: `Seeded ${res.data?.created ?? 0} rows. Refresh the list to see them.` }); await load(); }
    else setMessage({ kind: "danger", text: res.error || "Could not seed." });
    setBusy(false);
  }

  return (
    <section className={styles.panel}>
      <div className={styles.sectionHeading}>
        <div>
          <h2>Fitness reference bands</h2>
          <small className={styles.small}>
            Bands used to classify athlete results. Tier wording follows DepEd PFT; the numbers are locally-set Cauayan reference bands (not DepEd-published). Mark a band verified once Cauayan has validated it.
          </small>
        </div>
        <span className={styles.countBadge}>{seeded} rows</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "flex-end", marginBottom: "var(--space-4)" }}>
        <label style={{ minWidth: 240, fontSize: 13 }}>Fitness quality
          <select className={styles.fieldControl} value={activeType} onChange={(e) => { setActiveType(e.target.value); setDraft({}); }}>
            {fitnessTypes.map((f) => <option key={f.key} value={f.key}>{f.label} — {f.test}</option>)}
          </select>
        </label>
        <button type="button" className={styles.btnSm} onClick={resetType} disabled={busy || loading}>Reset to default</button>
        <button type="button" className={styles.btnSm} onClick={seedAll} disabled={busy || loading}>Seed missing rows</button>
      </div>

      {message.text && <p role="status" className={`${styles.fullField} ${message.kind === "success" ? styles.formSuccess : styles.formError}`} style={{ marginBottom: "var(--space-3)" }}>{message.text}</p>}

      {loading ? (
        <p className={styles.empty}>Loading reference bands…</p>
      ) : typeRows.length === 0 ? (
        <p className={styles.empty}>No bands yet. Click “Seed missing rows” to load the built-in defaults.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th scope="col">Sex</th>
                <th scope="col">Age</th>
                {CLASSIFICATION_TIERS.map((tier) => <th scope="col" key={tier} style={{ textAlign: "center" }}>{TIER_META[tier]?.label || tier}</th>)}
                <th scope="col">Verified</th>
              </tr>
            </thead>
            <tbody>
              {typeRows.map((row) => (
                <tr key={`${row.sex}-${row.ageGroup}`}>
                  <td data-label="Sex" style={{ textTransform: "capitalize" }}>{row.sex}</td>
                  <td data-label="Age">{row.ageGroup}</td>
                  {CLASSIFICATION_TIERS.map((tier) => (
                    <td data-label={TIER_META[tier]?.label || tier} key={tier} style={{ textAlign: "center" }}>
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        aria-label={`${row.sex} ${row.ageGroup} ${tier}`}
                        value={cellValue(row, tier)}
                        onChange={(e) => setDraft((d) => ({ ...d, [draftKey(row.sex, row.ageGroup, tier)]: e.target.value }))}
                        onBlur={() => saveCell(row, tier)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        disabled={busy}
                        style={{ width: 72, textAlign: "center" }}
                      />
                    </td>
                  ))}
                  <td data-label="Verified">
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: 13, color: "var(--muted)" }}>
                      <input type="checkbox" checked={!!row.verified} onChange={() => toggleVerified(row)} disabled={busy} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
                      {row.verified ? "Verified" : "Ref."}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {anyVerified ? null : (
        <p style={{ margin: "var(--space-3) 0 0", color: "var(--muted)", fontSize: 13 }}>
          Currently these are <strong>reference bands</strong> — they are not DepEd-published norm values. The activity badges show “ref.” until a band is marked verified.
        </p>
      )}
    </section>
  );
}

export default function Metrics({ session, events, metrics }) {
  const [message, setMessage] = React.useState({ kind: "", text: "" });
  const [busy, setBusy] = React.useState(false);

  async function addMetric(event) {
    event.preventDefault();
    setBusy(true);
    setMessage({ kind: "", text: "" });
    const form = new FormData(event.currentTarget);
    const body = {
      kind: "metric",
      eventId: Number(form.get("eventId")),
      metricName: form.get("metricName"),
      unit: form.get("unit"),
      dataType: form.get("dataType"),
      betterDirection: form.get("betterDirection"),
      decimalPlaces: form.get("decimalPlaces") || 0,
      isRequired: form.get("isRequired") === "on",
      minimumValue: form.get("minimumValue"),
      maximumValue: form.get("maximumValue"),
    };
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch("/api/catalog", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    if (response && response.ok && !result.error) {
      setMessage({ kind: "success", text: "Performance metric added. Refresh to see it in the list." });
      event.currentTarget.reset();
    } else {
      setMessage({ kind: "danger", text: result.error || "Could not add metric." });
    }
    setBusy(false);
  }

  return (
    <>
      <Head><title>Performance Metrics | Administration</title></Head>
      <AppShell session={session} isAdmin eyebrow="Measurements" title="Performance Metrics" active="/admin/metrics">
        <div className={styles.pageTitle}><h1>Performance metrics</h1></div>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Configuration</p><h2>Add performance metric</h2></div></div>
          <form onSubmit={addMetric} className={styles.formGrid}>
            <label>Event *<select name="eventId" required defaultValue="">{events.map((event) => <option value={event.id} key={event.id}>{event.sport.sportName} - {event.eventName}</option>)}</select></label>
            <label>Metric name *<input name="metricName" required maxLength="150" placeholder="e.g. 100m time" /></label>
            <label>Unit<input name="unit" maxLength="50" placeholder="seconds, cm, score..." /></label>
            <label>Data type<select name="dataType" defaultValue="decimal">{Object.entries(DATA_TYPES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Better result<select name="betterDirection" defaultValue="neutral">{Object.entries(BETTER).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Decimal places<input name="decimalPlaces" type="number" min="0" max="6" defaultValue="0" /></label>
            <label>Minimum value<input name="minimumValue" type="number" step="any" /></label>
            <label>Maximum value<input name="maximumValue" type="number" step="any" /></label>
            <label className={styles.fullField} style={{ flexDirection: "row", alignItems: "center", gap: "var(--space-3)", color: "var(--muted)", fontSize: 14 }}><input name="isRequired" type="checkbox" style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />Required metric (must be completed on every assessment)</label>
            <div className={styles.formActions}><button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Add metric"}</button></div>
            {message.text && <p role="status" className={`${styles.fullField} ${message.kind === "success" ? styles.formSuccess : styles.formError}`}>{message.text}</p>}
          </form>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeading}><div><h2>Configured metrics</h2><small className={styles.small}>Quantifiable measures by event</small></div><span className={styles.countBadge}>{metrics.length}</span></div>
          <div className={styles.tableWrap}><table><thead><tr><th scope="col">Sport / Event</th><th scope="col">Metric</th><th scope="col">Unit</th><th scope="col">Data type</th><th scope="col">Better</th><th scope="col">Required</th></tr></thead><tbody>{metrics.map((metric) => <tr key={metric.id}><td data-label="Sport / Event">{metric.event.sport.sportName} / {metric.event.eventName}</td><td data-label="Metric">{metric.metricName}</td><td data-label="Unit">{metric.unit || "—"}</td><td data-label="Data type">{DATA_TYPES[metric.dataType] || metric.dataType}</td><td data-label="Better">{BETTER[metric.betterDirection] || "—"}</td><td data-label="Required">{metric.isRequired ? "Yes" : "No"}</td></tr>)}{!metrics.length && <tr><td colSpan="6" className={styles.empty}>No metrics configured yet.</td></tr>}</tbody></table></div>
        </section>

        <FitnessNormsEditor />
      </AppShell>
    </>
  );
}
