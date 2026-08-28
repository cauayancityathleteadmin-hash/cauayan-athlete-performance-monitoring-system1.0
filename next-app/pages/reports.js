import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const isAdmin = session.user.role === "admin";
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach) return { redirect: { destination: "/dashboard", permanent: false } };
  }
  const where = isAdmin ? {} : { coach: { userId: Number(session.user.id) } };
  const athletes = await prisma.athlete.findMany({
    where,
    orderBy: { lastName: "asc" },
    include: {
      school: true,
      sport: true,
      event: true,
      assessments: { orderBy: { assessmentDate: "desc" }, include: { recorder: { select: { email: true } }, results: { include: { metric: true } } } },
    },
  });
  const serialized = athletes.map((athlete) => ({
    id: athlete.id,
    athleteCode: athlete.athleteCode,
    firstName: athlete.firstName,
    middleName: athlete.middleName,
    lastName: athlete.lastName,
    birthdate: athlete.birthdate.toISOString(),
    gender: athlete.gender,
    school: athlete.school?.schoolName || null,
    sport: athlete.sport.sportName,
    event: athlete.event?.eventName || null,
    dateRegistered: athlete.dateRegistered?.toISOString() || null,
    assessments: athlete.assessments.map((assessment) => ({
      id: assessment.id,
      assessmentDate: assessment.assessmentDate.toISOString(),
      assessmentType: assessment.assessmentType,
      recorder: assessment.recorder?.email || null,
      results: assessment.results.map((result) => ({ metricName: result.metric.metricName, unit: result.metric.unit, valueDecimal: result.valueDecimal?.toString() || null, valueText: result.valueText || null })),
    })),
  }));
  return { props: { session, athletes: serialized } };
}

function formatDate(value) {
  const date = new Date(value);
  return isNaN(date) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const GENDER_LABEL = { male: "Male", female: "Female", other: "Other", prefer_not_to_say: "Prefer not to say" };

export default function Reports({ session, athletes }) {
  const [selected, setSelected] = React.useState([]);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const isAdmin = session.user.role === "admin";

  function toggle(id) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  function toggleAll() {
    setSelected((current) => (current.length === athletes.length ? [] : athletes.map((a) => a.id)));
  }

  const count = selected.length;
  const scrollRef = React.useRef(null);

  const filteredAthletes = athletes.filter((athlete) => selected.includes(athlete.id));
  const withPrint = new URLSearchParams({ from, to }).toString();

  return (
    <>
      <Head><title>Athlete Reports | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Official &amp; performance records" title="Athlete Reports" active="/reports">
        <section className={styles.intro}><div><p className={styles.eyebrow}>Generate</p><h2>Official performance reports</h2><p>Select one or more athletes and a date window to produce printable reports with their full assessment history.</p></div></section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Selection</p><h2>Athletes ({athletes.length})</h2></div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 13, fontWeight: 600 }}><input type="checkbox" style={{ width: 17, height: 17, accentColor: "var(--accent)" }} checked={count === athletes.length && athletes.length > 0} onChange={toggleAll} />Select all</label>
          </div>
          {athletes.length ? <div className={styles.checkboxList}>{athletes.map((athlete) => <label key={athlete.id}><input type="checkbox" checked={selected.includes(athlete.id)} onChange={() => toggle(athlete.id)} /><span><strong>{athlete.lastName}, {athlete.firstName}</strong> <small>{athlete.athleteCode}</small></span></label>)}</div> : <p className={styles.empty}>No athletes found.</p>}
          <div className={styles.toolbar} style={{ marginTop: 16 }}>
            <label>From date<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label>To date<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
            <div className={styles.stackedActions}>
              <button className={styles.primary} disabled={!count} onClick={() => scrollRef.current?.scrollIntoView({ behavior: "smooth" })}>Show {count ? `${count} report${count > 1 ? "s" : ""}` : "reports"}</button>
              <button className={styles.secondary} disabled={!count} onClick={() => window.print()}>Print</button>
            </div>
          </div>
        </section>

        <div ref={scrollRef} />
        {filteredAthletes.map((athlete) => {
          const windowed = athlete.assessments.filter((assessment) => (!from || assessment.assessmentDate >= new Date(from).toISOString()) && (!to || assessment.assessmentDate <= new Date(new Date(to).getTime() + 86400000).toISOString()));
          const last = athlete.assessments[0];
          const bestNumeric = {};
          let bestLabel = null;
          athlete.assessments.forEach((assessment) => assessment.results.forEach((result) => {
            if (result.valueDecimal !== null && result.valueDecimal !== undefined) {
              const val = Number(result.valueDecimal);
              if (bestNumeric[result.metricName] === undefined || val > bestNumeric[result.metricName].value) bestNumeric[result.metricName] = { value: val, date: assessment.assessmentDate };
            }
          }));
          const bestEntries = Object.entries(bestNumeric).slice(0, 3);
          if (bestEntries.length) bestLabel = bestEntries[0][0];
          return (
            <div className={styles.reportSheet} key={athlete.id}>
              <p className={styles.reportKicker}>Cauayan City Athlete Performance Monitoring System</p>
              <h3>Performance Report — {athlete.lastName}, {athlete.firstName} <small style={{ color: "var(--muted)" }}>{athlete.athleteCode}</small></h3>
              <dl className={styles.reportSummary}>
                <div><dt>Sport / Event</dt><dd>{athlete.sport}{athlete.event ? ` / ${athlete.event}` : ""}</dd></div>
                <div><dt>School</dt><dd>{athlete.school || "—"}</dd></div>
                <div><dt>Birthdate</dt><dd>{formatDate(athlete.birthdate)}</dd></div>
                <div><dt>Gender</dt><dd>{GENDER_LABEL[athlete.gender] || athlete.gender}</dd></div>
                <div><dt>Assessments</dt><dd>{windowed.length}</dd></div>
                <div><dt>Top result</dt><dd>{bestLabel || "—"}</dd></div>
              </dl>
              {windowed.length ? windowed.map((assessment) => (
                <div className={styles.reportAssessment} key={assessment.id}>
                  <strong>{formatDate(assessment.assessmentDate)}</strong> <span className={`${styles.badge} ${styles.badgeActive}`}>{assessment.assessmentType}</span>
                  {assessment.recorder ? <small className="muted"> — recorded by {assessment.recorder}</small> : null}
                  <div className={styles.tableWrap} style={{ marginTop: 8 }}><table><thead><tr><th>Metric</th><th>Result</th></tr></thead><tbody>{assessment.results.length ? assessment.results.map((result, i) => <tr key={i}><td>{result.metricName}</td><td><strong>{result.valueDecimal !== null && result.valueDecimal !== undefined ? Number(result.valueDecimal) + (result.unit ? ` ${result.unit}` : "") : (result.valueText || "—")}</strong></td></tr>) : <tr><td colSpan="2" className={styles.empty}>No results recorded.</td></tr>}</tbody></table></div>
                </div>
              )) : <p className={styles.empty}>No assessments in the selected date window.</p>}
              <p className={styles.reportCertification}>Certified as an official record of athlete performance. Generated by {session.user.name || session.user.email || "system"} on {formatDate(new Date().toISOString())} · {withPrint}.</p>
            </div>
          );
        })}
        {filteredAthletes.length > 0 && <div className={styles.stackedActions}><button className={styles.secondary} onClick={() => window.print()}>Print all reports</button></div>}
      </AppShell>
    </>
  );
}
