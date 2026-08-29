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
      coach: { select: { firstName: true, lastName: true } },
      _count: { select: { assessments: true } },
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
    coach: athlete.coach ? `${athlete.coach.lastName}, ${athlete.coach.firstName}` : null,
    assessmentCount: athlete._count.assessments,
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

const SORT_COLS = {
  name: (a) => `${a.lastName}, ${a.firstName}`.toLowerCase(),
  code: (a) => a.athleteCode.toLowerCase(),
  sport: (a) => (a.sport || "").toLowerCase(),
  event: (a) => (a.event || "").toLowerCase(),
  coach: (a) => (a.coach || "").toLowerCase(),
  school: (a) => (a.school || "").toLowerCase(),
  gender: (a) => (GENDER_LABEL[a.gender] || a.gender || "").toLowerCase(),
  registered: (a) => (a.dateRegistered || ""),
  assessments: (a) => a.assessmentCount,
};

export default function Reports({ session, athletes }) {
  const [selected, setSelected] = React.useState([]);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState("name");
  const [sortDir, setSortDir] = React.useState("asc");
  const isAdmin = session.user.role === "admin";

  function toggle(id) {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  function setSort(key) {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const query = search.trim().toLowerCase();
  const visible = athletes
    .filter((athlete) =>
      !query ||
      [athlete.lastName, athlete.firstName, athlete.athleteCode, athlete.sport, athlete.event, athlete.coach, athlete.school]
        .some((value) => (value || "").toLowerCase().includes(query))
    )
    .slice()
    .sort((x, y) => {
      const xv = SORT_COLS[sortKey](x);
      const yv = SORT_COLS[sortKey](y);
      const cmp = xv < yv ? -1 : xv > yv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((a) => selected.includes(a.id));

  function toggleVisible() {
    setSelected((current) => (allVisibleSelected ? current.filter((id) => !visible.some((a) => a.id === id)) : [...new Set([...current, ...visible.map((a) => a.id)])]));
  }

  const count = selected.length;
  const scrollRef = React.useRef(null);

  const filteredAthletes = athletes.filter((athlete) => selected.includes(athlete.id));
  const withPrint = new URLSearchParams({ from, to }).toString();

  function sortHeader(key, label) {
    const active = sortKey === key;
    return (
      <th key={key}>
        <button type="button" className={`${styles.thBtn} ${active ? styles.thBtnActive : ""}`} onClick={() => setSort(key)}>
          {label}
          <span className={styles.thDir}>{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  }

  return (
    <>
      <Head><title>Athlete Reports | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Official &amp; performance records" title="Athlete Reports" active="/reports">
        <section className={styles.intro}><div><p className={styles.eyebrow}>Generate</p><h2>Official performance reports</h2><p>Select one or more athletes and a date window to produce printable reports with their full assessment history. Search the roster and sort by any column to find athletes faster.</p></div></section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Selection</p><h2>Athletes</h2></div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 13, fontWeight: 600 }}><input type="checkbox" style={{ width: 17, height: 17, accentColor: "var(--accent)" }} checked={allVisibleSelected} onChange={toggleVisible} disabled={!visible.length} />Select visible</label>
          </div>

          <div className={styles.toolbar} style={{ marginTop: 16 }}>
            <label>Search athletes<input type="text" placeholder="Name, code, sport, event, coach, school…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label>From date<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label>To date<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
            {count > 0 && <p className={styles.selectionSummary}>{count > 1 ? `${count} athletes selected` : "1 athlete selected"}<button type="button" onClick={() => setSelected([])}>Clear</button></p>}
            <div className={styles.stackedActions}>
              <button className={styles.primary} disabled={!count} onClick={() => scrollRef.current?.scrollIntoView({ behavior: "smooth" })}>Show {count ? `${count} report${count > 1 ? "s" : ""}` : "reports"}</button>
              <button className={styles.secondary} disabled={!count} onClick={() => window.print()}>Print</button>
            </div>
          </div>

          {athletes.length ? (
            <div className={styles.reportTableScroll}>
              <table>
                <thead>
                  <tr>
                    <th className={styles.checkCell}><input type="checkbox" style={{ width: 16, height: 16, accentColor: "var(--accent)" }} checked={allVisibleSelected} onChange={toggleVisible} disabled={!visible.length} /></th>
                    {sortHeader("name", "Athlete")}
                    {sortHeader("code", "Code")}
                    {sortHeader("sport", "Sport")}
                    {sortHeader("event", "Event")}
                    {sortHeader("coach", "Coach")}
                    {sortHeader("school", "School")}
                    {sortHeader("gender", "Gender")}
                    {sortHeader("registered", "Registered")}
                    {sortHeader("assessments", "Assessments")}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((athlete) => (
                    <tr key={athlete.id} className={selected.includes(athlete.id) ? styles.rowSelected : undefined}>
                      <td className={styles.checkCell}><input type="checkbox" style={{ width: 16, height: 16, accentColor: "var(--accent)" }} checked={selected.includes(athlete.id)} onChange={() => toggle(athlete.id)} /></td>
                      <td><strong>{athlete.lastName}, {athlete.firstName}</strong>{athlete.middleName ? ` ${athlete.middleName}` : ""}</td>
                      <td>{athlete.athleteCode}</td>
                      <td>{athlete.sport}</td>
                      <td>{athlete.event || "—"}</td>
                      <td>{athlete.coach || "—"}</td>
                      <td>{athlete.school || "—"}</td>
                      <td>{GENDER_LABEL[athlete.gender] || athlete.gender}</td>
                      <td>{athlete.dateRegistered ? formatDate(athlete.dateRegistered) : "—"}</td>
                      <td className={styles.numCell}><span className={styles.countBadge}>{athlete.assessmentCount}</span></td>
                    </tr>
                  ))}
                  {!visible.length && <tr><td colSpan="10" className={styles.empty}>No athletes match your search.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : <p className={styles.empty}>No athletes found.</p>}
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
