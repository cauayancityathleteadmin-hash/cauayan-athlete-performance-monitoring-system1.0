import Head from "next/head";
import Link from "next/link";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const [assessments, athletes, metrics] = await Promise.all([
    prisma.assessment.findMany({ orderBy: { assessmentDate: "desc" }, include: { athlete: true, recorder: { select: { email: true } }, results: { include: { metric: true } } } }),
    prisma.athlete.findMany({ where: { status: "active" }, include: { event: true, coach: true }, orderBy: { lastName: "asc" } }),
    prisma.performanceMetric.findMany({ where: { status: "active" }, include: { event: true }, orderBy: { metricName: "asc" } }),
  ]);
  return { props: { session, catalog: { athletes, metrics }, assessments: assessments.map((item) => ({ ...item, assessmentDate: item.assessmentDate.toISOString(), createdAt: item.createdAt.toISOString(), results: item.results.map((result) => ({ ...result, valueDecimal: result.valueDecimal?.toString() || null })) })) } };
}

export default function Assessments({ assessments, catalog, session }) {
  return (
    <>
      <Head>
        <title>Assessments | Cauayan Athlete Performance</title>
      </Head>
      <div className={styles.app}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Performance records</p>
            <h1>Assessments</h1>
          </div>
          <Link className={styles.account} href="/dashboard">
            Back to dashboard
          </Link>
        </header>
        <nav className={styles.nav} aria-label="Primary navigation">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/athletes">Athletes</Link>
          <Link href="/assessments" aria-current="page">Assessments</Link>
          <Link href="/analytics">Analytics</Link>
          <Link href="/event-plans">Event plans</Link>
        </nav>
        <main className={styles.main}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Record measurement</p>
                <h2>New assessment</h2>
              </div>
            </div>
            <AssessmentForm catalog={catalog} session={session} />
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Recorded measurements</p>
                <h2>Assessment history</h2>
              </div>
              <strong>{assessments.length} records</strong>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Athlete</th>
                    <th>Type</th>
                    <th>Results</th>
                    <th>Recorded by</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((assessment) => (
                    <tr key={assessment.id}>
                      <td>{new Date(assessment.assessmentDate).toLocaleDateString()}</td>
                      <td>
                        <strong>{assessment.athlete.firstName} {assessment.athlete.lastName}</strong>
                        <small>{assessment.athlete.athleteCode}</small>
                      </td>
                      <td>{assessment.assessmentType}</td>
                      <td>{assessment.results.map((result) => `${result.metric.metricName}: ${result.valueDecimal ?? result.valueText ?? "-"}`).join(", ")}</td>
                      <td>{assessment.recorder.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}

function AssessmentForm({ catalog, session }) {
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [athleteId, setAthleteId] = React.useState("");
  const [metrics, setMetrics] = React.useState([]);

  async function handleAthleteChange(e) {
    const id = e.target.value;
    setAthleteId(id);
    if (id) {
      const athlete = catalog.athletes.find((a) => a.id === Number(id));
      if (athlete?.eventId) {
        const eventMetrics = catalog.metrics.filter((m) => m.eventId === athlete.eventId);
        setMetrics(eventMetrics);
      } else setMetrics([]);
    } else setMetrics([]);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const results = metrics
      .map((m) => ({ metricId: m.id, value: form.get(`metric_${m.id}`), notes: form.get(`notes_${m.id}`) }))
      .filter((r) => r.value);
    const body = {
      athleteId: Number(athleteId),
      assessmentDate: form.get("assessmentDate"),
      assessmentType: form.get("assessmentType") || "Regular Assessment",
      remarks: form.get("remarks"),
      results,
    };
    const result = await fetch("/api/assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    setMessage(result.error || "Assessment recorded.");
    if (!result.error) event.currentTarget.reset();
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.formGrid}>
      <label>
        Athlete
        <select value={athleteId} onChange={handleAthleteChange} required>
          <option value="">Select an athlete</option>
          {catalog.athletes
            .filter((a) => session.user.role === "admin" || a.coach.userId === Number(session.user.id))
            .map((a) => (
              <option value={a.id} key={a.id}>
                {a.athleteCode} - {a.firstName} {a.lastName}
              </option>
            ))}
        </select>
      </label>
      <label>
        Date
        <input name="assessmentDate" type="date" required />
      </label>
      <label>
        Type
        <input name="assessmentType" maxLength="100" defaultValue="Regular Assessment" />
      </label>
      {metrics.length > 0 && (
        <fieldset className={styles.fullField}>
          <legend>Metrics</legend>
          <div className={styles.metricsGrid}>
            {metrics.map((m) => (
              <div key={m.id} className={styles.metricField}>
                <label>
                  {m.metricName}
                  {m.isRequired && " *"}
                  <input
                    name={`metric_${m.id}`}
                    type={m.dataType === "integer" ? "number" : m.dataType === "decimal" ? "number" : "text"}
                    step={m.dataType === "decimal" ? "0.01" : undefined}
                    required={m.isRequired}
                  />
                </label>
                <label>
                  <textarea name={`notes_${m.id}`} maxLength="255" rows="2" placeholder="Notes" />
                </label>
              </div>
            ))}
          </div>
        </fieldset>
      )}
      <label className={styles.fullField}>
        Remarks
        <textarea name="remarks" maxLength="2000" />
      </label>
      <button className={styles.primary} disabled={busy || !athleteId}>
        {busy ? "Recording..." : "Record assessment"}
      </button>
      {message && (
        <p role="status" className={styles.fullField}>
          {message}
        </p>
      )}
    </form>
  );
}
