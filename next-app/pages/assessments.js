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
    prisma.athlete.findMany({ where: { status: "active" }, select: { id: true, athleteCode: true, firstName: true, lastName: true, eventId: true, sport: { select: { sportName: true } }, event: { select: { eventName: true } }, coach: { select: { userId: true } } }, orderBy: { lastName: "asc" } }),
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
  const [search, setSearch] = React.useState("");
  const [added, setAdded] = React.useState([]);
  const isAdmin = session.user.role === "admin";
  const myId = Number(session.user.id);

  const assessableEvents = new Set(catalog.metrics.map((m) => m.eventId));
  const candidates = catalog.athletes.filter((a) => (isAdmin || a.coach?.userId === myId) && a.eventId && assessableEvents.has(a.eventId) && !added.some((x) => x.id === a.id));

  const query = search.trim().toLowerCase();
  const matches = (query ? candidates.filter((a) => [a.athleteCode, a.lastName, a.firstName].some((value) => (value || "").toLowerCase().includes(query))) : []).slice(0, 20);

  function metricsFor(athlete) {
    return catalog.metrics.filter((m) => m.eventId === athlete.eventId);
  }

  function athleteLabel(a) {
    return `${a.athleteCode} — ${a.lastName}, ${a.firstName}`;
  }

  function addAthlete(a) {
    setAdded((current) => [...current, a]);
    setSearch("");
    setMessage("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!added.length) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const empty = added.filter((a) => !metricsFor(a).some((m) => form.get(`metric_${a.id}_${m.id}`)));
      if (empty.length) {
        setMessage(`Add at least one metric value for: ${empty.map((a) => a.athleteCode).join(", ")}.`);
        setBusy(false);
        return;
      }
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const assessments = added.map((a) => {
        const results = metricsFor(a)
          .map((m) => ({ metricId: m.id, value: form.get(`metric_${a.id}_${m.id}`) || null, notes: form.get(`notes_${a.id}_${m.id}`) || null }))
          .filter((r) => r.value);
        return { athleteId: a.id, assessmentDate: form.get("assessmentDate"), assessmentType: form.get("assessmentType") || "Regular Assessment", remarks: form.get(`remarks_${a.id}`) || null, results };
      });
      const response = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ assessments }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) {
        event.currentTarget.reset();
        setAdded([]);
        setMessage(`${result.count || assessments.length} assessment${result.count === 1 ? "" : "s"} recorded.`);
      } else {
        setMessage(result.error || "Could not record assessments.");
      }
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.formGrid}>
      <label>
        Assessed athletes
        <small style={{ color: "var(--muted)", fontWeight: 500 }}>Search and add one or more athletes, each with its own metrics.</small>
      </label>
      <div className={styles.athleteSearch}>
        <input type="text" placeholder="Search athlete…" value={search} onChange={(event) => setSearch(event.target.value)} />
        {search.trim() && (
          <div className={styles.matchList}>
            {matches.length ? matches.map((a) => (
              <button type="button" key={a.id} className={styles.matchItem} onClick={() => addAthlete(a)}>
                <strong>{athleteLabel(a)}</strong>
                <small>{a.sport?.sportName}{a.event?.eventName ? ` · ${a.event.eventName}` : ""}</small>
              </button>
            )) : <div className={styles.matchEmpty}>No matching athletes.</div>}
          </div>
        )}
      </div>
      <label>
        Date
        <input name="assessmentDate" type="date" required />
      </label>
      <label>
        Type
        <input name="assessmentType" maxLength="100" defaultValue="Regular Assessment" />
      </label>

      {added.length > 0 && (
        <div className={styles.fullField}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: "0 0 12px", color: "var(--foreground)" }}>Session ({added.length})</h3>
            <button type="button" className={`${styles.danger} ${styles.btnSm}`} onClick={() => { setAdded([]); setMessage(""); }}>Clear all</button>
          </div>
          <div className={styles.athleteCards}>
            {added.map((a) => (
              <div key={a.id} className={styles.athleteCard}>
                <div className={styles.cardHead}>
                  <div>
                    <strong>{athleteLabel(a)}</strong>
                    <small>{a.sport?.sportName}{a.event?.eventName ? ` — ${a.event.eventName}` : ""}</small>
                  </div>
                  <button type="button" className={`${styles.danger} ${styles.btnSm}`} onClick={() => setAdded((current) => current.filter((x) => x.id !== a.id))}>Remove</button>
                </div>
                <fieldset className={styles.metricsGrid}>
                  <legend>Metrics</legend>
                  {metricsFor(a).map((m) => (
                    <div key={m.id} className={styles.metricField}>
                      <label>
                        {m.metricName}
                        {m.isRequired && " *"}
                        <input
                          name={`metric_${a.id}_${m.id}`}
                          type={m.dataType === "integer" ? "number" : m.dataType === "decimal" ? "number" : "text"}
                          step={m.dataType === "decimal" ? "0.01" : undefined}
                          required={m.isRequired}
                        />
                      </label>
                      <label>
                        <textarea name={`notes_${a.id}_${m.id}`} maxLength="255" rows="2" placeholder="Notes" />
                      </label>
                    </div>
                  ))}
                </fieldset>
                <label>
                  Remarks
                  <textarea name={`remarks_${a.id}`} maxLength="2000" rows="2" />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className={styles.primary} disabled={busy || added.length === 0}>
        {busy ? "Recording..." : `Record ${added.length || ""} assessment${added.length === 1 ? "" : "s"}`}
      </button>
      {message && (
        <p role="status" className={styles.fullField}>
          {message}
        </p>
      )}
    </form>
  );
}