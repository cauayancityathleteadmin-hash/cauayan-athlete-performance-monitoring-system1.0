import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import { paginatePrisma } from "../lib/pagination";
import Pagination from "../components/Pagination";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const page = Number(context.query.page) || 1;
  const [assessmentResult, athletes, metrics] = await Promise.all([
    paginatePrisma(prisma.assessment, page, { orderBy: { assessmentDate: "desc" }, include: { athlete: true, recorder: { select: { email: true } }, results: { include: { metric: true } } } }),
    prisma.athlete.findMany({ where: { status: "active" }, select: { id: true, athleteCode: true, firstName: true, lastName: true, eventId: true, coach: { select: { userId: true } } }, orderBy: { lastName: "asc" } }),
    prisma.performanceMetric.findMany({ where: { status: "active" }, select: { id: true, eventId: true, metricName: true, dataType: true, isRequired: true }, orderBy: { metricName: "asc" } }),
  ]);
  const assessments = assessmentResult.items.map((item) => ({ ...item, assessmentDate: item.assessmentDate.toISOString(), createdAt: item.createdAt.toISOString(), results: item.results.map((result) => ({ ...result, valueDecimal: result.valueDecimal?.toString() || null })) }));
  return { props: { session, catalog: { athletes, metrics }, assessments, page: assessmentResult.page, totalPages: assessmentResult.totalPages, total: assessmentResult.total } };
}

export default function Assessments({ assessments, catalog, session, page, totalPages, total }) {
  const isAdmin = session?.user?.role === "admin";
  return (
    <>
      <Head>
        <title>Assessments | Cauayan Athlete Performance</title>
      </Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Performance records" title="Assessments" active="/assessments">
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
              <strong>{total} records</strong>
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
            <Pagination page={page} totalPages={totalPages} />
          </section>
      </AppShell>
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
    try {
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
      const response = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(result.error || (response.ok ? "Assessment recorded." : "Could not record assessment."));
      if (response.ok && !result.error) { event.currentTarget.reset(); setAthleteId(""); setMetrics([]); }
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.formGrid}>
      <label>
        Athlete
        <select value={athleteId} onChange={handleAthleteChange} required>
          <option value="">Select an athlete</option>
          {catalog.athletes
            .filter((a) => session.user.role === "admin" || a.coach?.userId === Number(session.user.id))
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