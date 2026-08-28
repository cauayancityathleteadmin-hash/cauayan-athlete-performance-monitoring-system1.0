import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";

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
      <AppShell session={session} isAdmin eyebrow="Measurements" title="Performance Metrics" active="/admin" showAdminNav>
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
            <label className={styles.fullField} style={{ flexDirection: "row", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 14 }}><input name="isRequired" type="checkbox" style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />Required metric (must be completed on every assessment)</label>
            <div className={styles.formActions}><button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Add metric"}</button></div>
            {message.text && <p role="status" className={`${styles.fullField} ${message.kind === "success" ? styles.formSuccess : styles.formError}`}>{message.text}</p>}
          </form>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeading}><div><h2>Configured metrics</h2><small className={styles.small}>Quantifiable measures by event</small></div><span className={styles.countBadge}>{metrics.length}</span></div>
          <div className={styles.tableWrap}><table><thead><tr><th>Sport / Event</th><th>Metric</th><th>Unit</th><th>Data type</th><th>Better</th><th>Required</th></tr></thead><tbody>{metrics.map((metric) => <tr key={metric.id}><td>{metric.event.sport.sportName} / {metric.event.eventName}</td><td>{metric.metricName}</td><td>{metric.unit || "—"}</td><td>{DATA_TYPES[metric.dataType] || metric.dataType}</td><td>{BETTER[metric.betterDirection] || "—"}</td><td>{metric.isRequired ? "Yes" : "No"}</td></tr>)}{!metrics.length && <tr><td colSpan="6" className={styles.empty}>No metrics configured yet.</td></tr>}</tbody></table></div>
        </section>
      </AppShell>
    </>
  );
}
