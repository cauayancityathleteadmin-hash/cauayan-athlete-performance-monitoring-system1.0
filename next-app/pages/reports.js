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
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Selection</p><h2>Athletes</h2></div>
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
        <div id="report-workspace">
        {filteredAthletes.map((athlete) => {
          const windowed = athlete.assessments.filter((assessment) => (!from || assessment.assessmentDate >= new Date(from).toISOString()) && (!to || assessment.assessmentDate <= new Date(new Date(to).getTime() + 86400000).toISOString()));
          const last = athlete.assessments[0];
          const reportRef = `RPT-${athlete.athleteCode}-${from || "all"}${to ? `-${to}` : ""}`;
          const issued = formatDate(new Date().toISOString());
          const periodLabel = `${from ? formatDate(new Date(from).toISOString()) : "earliest"} to ${to ? formatDate(new Date(to).toISOString()) : "latest"}`;
          return (
            <article className="report-doc" key={athlete.id}>
              <header className="rd-header">
                <img src="/cauayan logo.png" alt="Official Seal of the City Government of Cauayan" className="rd-logo" />
                <div className="rd-header-text">
                  <p className="rd-republic">Republic of the Philippines</p>
                  <h1 className="rd-lgu">City Government of Cauayan</h1>
                  <p className="rd-office">City Sports Development Office</p>
                  <p className="rd-address">Cauayan City, Isabela, Philippines</p>
                </div>
              </header>

              <h2 className="rd-title">Athlete Performance Report</h2>
              <p className="rd-ref">Report No.: <span>{reportRef}</span> &nbsp;·&nbsp; Date Issued: <span>{issued}</span></p>

              <table className="rd-info">
                <tbody>
                  <tr>
                    <th>Full Name</th>
                    <td>{athlete.lastName}, {athlete.firstName}{athlete.middleName ? ` ${athlete.middleName}` : ""}</td>
                    <th>Athlete Code</th>
                    <td>{athlete.athleteCode}</td>
                  </tr>
                  <tr>
                    <th>Date of Birth</th>
                    <td>{formatDate(athlete.birthdate)}</td>
                    <th>Sex</th>
                    <td>{GENDER_LABEL[athlete.gender] || athlete.gender}</td>
                  </tr>
                  <tr>
                    <th>School</th>
                    <td>{athlete.school || "—"}</td>
                    <th>Date Registered</th>
                    <td>{athlete.dateRegistered ? formatDate(athlete.dateRegistered) : "—"}</td>
                  </tr>
                  <tr>
                    <th>Sport / Event</th>
                    <td colSpan="3">{athlete.sport}{athlete.event ? ` / ${athlete.event}` : ""}</td>
                  </tr>
                </tbody>
              </table>

              <div className="rd-section-title">Performance Record <span>Covering period: {periodLabel}</span></div>
              {windowed.length ? windowed.map((assessment) => (
                <div className="rd-assessment" key={assessment.id}>
                  <div className="rd-assessment-head">{formatDate(assessment.assessmentDate)} &mdash; {assessment.assessmentType}{assessment.recorder ? <small> &middot; Recorded by {assessment.recorder}</small> : null}</div>
                  <table className="rd-results">
                    <thead><tr><th>Metric</th><th>Result</th></tr></thead>
                    <tbody>{assessment.results.length ? assessment.results.map((result, i) => <tr key={i}><td>{result.metricName}</td><td className="num"><strong>{result.valueDecimal !== null && result.valueDecimal !== undefined ? Number(result.valueDecimal) + (result.unit ? ` ${result.unit}` : "") : (result.valueText || "—")}</strong></td></tr>) : <tr><td colSpan="2" className="rd-empty">No results recorded.</td></tr>}</tbody>
                  </table>
                </div>
              )) : <p className="rd-empty">No assessments were found within the selected date window.</p>}

              <div className="rd-cert"><strong>Certification</strong>This is to certify that the information contained herein is an accurate and complete record of the performance of the above-named athlete, as officially recorded in the database of the City Sports Development Office of the City Government of Cauayan, Isabela.</div>

              <div className="rd-signatures">
                <div className="rd-sig">
                  <div className="rd-sig-label">Prepared by:</div>
                  <div className="rd-sig-name">{session.user.name || session.user.email || ""}</div>
                  <div className="rd-sig-pos">Authorized User, City Sports Development Office</div>
                  <div className="rd-sig-note">Signature over Printed Name</div>
                </div>
                <div className="rd-sig">
                  <div className="rd-sig-label">Certified Correct:</div>
                  <div className="rd-sig-name"></div>
                  <div className="rd-sig-pos">City Sports Development Officer</div>
                  <div className="rd-sig-note">Signature over Printed Name</div>
                </div>
              </div>

              <footer className="rd-footer"><span>Generated by {session.user.name || session.user.email || "system"} on {issued} · {withPrint}</span><span>Last assessment record: {last ? formatDate(last.assessmentDate) : "none"}</span></footer>
            </article>
          );
        })}
        </div>
        {filteredAthletes.length > 0 && <div className={styles.stackedActions}><button className={styles.secondary} onClick={() => window.print()}>Print all reports</button></div>}
      </AppShell>
    </>
  );
}
