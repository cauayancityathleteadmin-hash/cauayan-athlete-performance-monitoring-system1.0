import Head from "next/head";
import Link from "next/link";
import React from "react";
import { useRouter } from "next/router";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import Pagination from "../components/Pagination";
import IdPhotoUpload from "../components/IdPhotoUpload";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

const SORT_KEYS = {
  name: "Athlete name",
  code: "Athlete code",
  sport: "Sport",
  event: "Event",
  school: "School",
  coach: "Coach",
  status: "Status",
  registered: "Date registered",
};

function athleteOrderBy(sort, dir) {
  const direction = dir === "desc" ? "desc" : "asc";
  switch (sort) {
    case "code": return [{ athleteCode: direction }];
    case "sport": return [{ sport: { sportName: direction } }, { lastName: "asc" }];
    case "event": return [{ event: { eventName: direction } }, { lastName: "asc" }];
    case "school": return [{ school: { schoolName: direction } }, { lastName: "asc" }];
    case "coach": return [{ coach: { lastName: direction } }, { coach: { firstName: direction } }, { lastName: "asc" }];
    case "status": return [{ status: direction }, { lastName: "asc" }];
    case "registered": return [{ dateRegistered: direction }];
    case "name":
    default: return [{ lastName: direction }, { firstName: direction }];
  }
}

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const page = Number(context.query.page) || 1;
  const sort = Object.keys(SORT_KEYS).includes(context.query.sort) ? context.query.sort : "name";
  const dir = context.query.dir === "desc" ? "desc" : "asc";
  const health = ["flagged", "healthy", "sick", "injured", "recovering", "inactive"].includes(context.query.health) ? context.query.health : "";
  const student = { orderBy: athleteOrderBy(sort, dir), include: { school: true, sport: true, event: true, coach: true } };
  if (health === "flagged") student.where = { healthStatus: { in: ["sick", "injured", "recovering", "inactive"] } };
  else if (health) student.where = { healthStatus: health };
  if (session.user.role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (coach) student.where = { ...(student.where || {}), coachId: coach.id };
  }
  const [allAthletes, sports, events, coaches] = await Promise.all([
    prisma.athlete.findMany(student),
    prisma.sport.findMany({ where: { status: "active" }, orderBy: { sportName: "asc" } }),
    prisma.event.findMany({ where: { status: "active" }, include: { sport: true }, orderBy: { eventName: "asc" } }),
    session.user.role === "admin" ? prisma.coach.findMany({ where: { status: "active" }, orderBy: { lastName: "asc" }, select: { id: true, coachCode: true, firstName: true, lastName: true, schoolId: true, school: { select: { schoolName: true } } } }) : Promise.resolve([]),
  ]);
  const athletes = allAthletes.map((athlete) => ({ ...athlete, birthdate: athlete.birthdate.toISOString(), dateRegistered: athlete.dateRegistered.toISOString() }));
  const perPage = 25;
  const totalPages = Math.max(1, Math.ceil(athletes.length / perPage));
  const paginated = athletes.slice((page - 1) * perPage, page * perPage);
  return { props: { session, catalog: { sports, events, coaches }, athletes, paginated, page: Math.min(page, totalPages), totalPages, total: athletes.length, sort, dir, health } };
}

export default function Athletes({ session, athletes, paginated: serverPaginated, catalog, page: serverPage, totalPages: serverTotalPages, total, sort, dir, health }) {
  const isAdmin = session?.user?.role === "admin";
  const [view, setView] = React.useState("sport");
  const router = useRouter();
  const [search, setSearch] = React.useState("");

  function changeSort(nextSort) {
    router.push({ pathname: "/athletes", query: { ...router.query, sort: nextSort, dir, page: 1 } });
  }

  function toggleDir() {
    router.push({ pathname: "/athletes", query: { ...router.query, dir: dir === "asc" ? "desc" : "asc", page: 1 } });
  }

  function formatDate(value) {
    const date = new Date(value);
    return isNaN(date) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  const filteredAthletes = React.useMemo(() => {
    if (!search.trim()) return athletes;
    const q = search.trim().toLowerCase();
    return athletes.filter((a) => 
      a.firstName.toLowerCase().includes(q) ||
      a.lastName.toLowerCase().includes(q) ||
      (a.middleName || "").toLowerCase().includes(q) ||
      a.athleteCode.toLowerCase().includes(q) ||
      (a.sport?.sportName || "").toLowerCase().includes(q) ||
      (a.event?.eventName || "").toLowerCase().includes(q) ||
      (a.school?.schoolName || "").toLowerCase().includes(q) ||
      (a.coach ? `${a.coach.firstName} ${a.coach.lastName}`.toLowerCase() : "").includes(q)
    );
  }, [athletes, search]);

  const grouped = React.useMemo(() => {
    const map = new Map();
    for (const athlete of filteredAthletes) {
      const sport = athlete.sport?.sportName || "Unassigned";
      if (!map.has(sport)) map.set(sport, []);
      map.get(sport).push(athlete);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredAthletes]);

  const perPage = 25;
  const clientTotalPages = Math.max(1, Math.ceil(filteredAthletes.length / perPage));
  const currentPage = Math.min(serverPage, clientTotalPages);
  const clientPaginated = filteredAthletes.slice((currentPage - 1) * perPage, currentPage * perPage);

  return (
    <>
      <Head><title>Athletes | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Directory" title="Athletes" active="/athletes">
        <div className={styles.pageActions}>
          <div className={styles.segmented}>
            <button className={view === "sport" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} onClick={() => setView("sport")}>By sport</button>
            <button className={view === "list" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} onClick={() => setView("list")}>List</button>
          </div>
          <button className={view === "add" ? `${styles.primary} ${styles.btnSm}` : styles.primary} onClick={() => setView(view === "add" ? "sport" : "add")}>{view === "add" ? "Close form" : "Add athlete"}</button>
          <button className={view === "import" ? `${styles.secondary} ${styles.btnSm}` : styles.secondary} onClick={() => setView(view === "import" ? "sport" : "import")}>{view === "import" ? "Close import" : "Import athletes"}</button>
        </div>

        {view === "add" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Registration</p><h2>Add athlete</h2></div></div>
            <AthleteForm catalog={catalog} isAdmin={isAdmin} onDone={() => setView("sport")} />
          </section>
        )}

        {view === "import" && (
          <ImportPanel isAdmin={isAdmin} onDone={() => setView("sport")} />
        )}

        {view === "list" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Registered athletes</p><h2>All athletes</h2></div></div>
<div className={styles.toolbar}>
            <label style={{ minWidth: 240 }}>Search athletes<input type="text" placeholder="Name, code, sport, event, school, coach…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label>Sort athletes by
              <select value={sort} onChange={(event) => changeSort(event.target.value)}>
                {Object.entries(SORT_KEYS).filter(([key]) => isAdmin || key !== "coach").map(([key, label]) => <option value={key} key={key}>{label}</option>)}
              </select>
            </label>
            <label>Filter by health
              <select value={health} onChange={(event) => router.push({ pathname: "/athletes", query: { ...router.query, health: event.target.value, page: 1 } })}>
              <option value="">All health</option>
              <option value="healthy">Healthy</option>
              <option value="recovering">Recovering</option>
              <option value="sick">Sick</option>
              <option value="injured">Injured</option>
              <option value="inactive">Inactive</option>
              <option value="flagged">Any flagged health</option>
              </select>
            </label>
            <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={toggleDir}>{dir === "asc" ? "Ascending" : "Descending"}</button>
          </div>
            <div className={styles.tableWrap}><table><thead><tr><th>Code</th><th>Athlete</th><th>Sport / event</th><th>School</th><th>Coach</th><th>Health</th><th>Status</th><th></th></tr></thead><tbody>
              {clientPaginated.map((athlete) => (
                <tr key={athlete.id}>
                  <td data-label="Code">{athlete.athleteCode}</td>
                  <td data-label="Athlete" style={{ display: "flex", alignItems: "center", gap: 10 }}><Avi name={`${athlete.firstName} ${athlete.lastName}`} url={athlete.pictureUrl} /><span><Link href={`/athletes/${athlete.id}`} style={{ fontWeight: 700 }}>{athlete.firstName} {athlete.middleName || ""} {athlete.lastName}</Link><small>{athlete.gender}</small></span></td>
                  <td data-label="Sport / event">{athlete.sport.sportName}<small>{athlete.event?.eventName || "No event"}</small></td>
                  <td data-label="School">{athlete.school?.schoolName || "Unassigned"}</td>
                  <td data-label="Coach">{athlete.coach ? athlete.coach.firstName + " " + athlete.coach.lastName : "Unassigned"}</td>
                  <td data-label="Health"><HealthBadge status={athlete.healthStatus} /></td>
                  <td data-label="Status"><StatusBadge status={athlete.status} /></td>
                  <td><Link className={styles.expandBtn} href={`/athletes/${athlete.id}`}>Profile</Link></td>
                </tr>
              ))}
            </tbody></table></div>
            <Pagination page={currentPage} totalPages={clientTotalPages} query={{ sort, dir, health, search }} />
          </section>
        )}

        {view === "sport" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Registered athletes</p><h2>{isAdmin ? "All athletes by sport" : "My athletes by sport"}</h2></div><span className={styles.formHint} style={{ alignSelf: "center" }}>{filteredAthletes.length} athlete{filteredAthletes.length === 1 ? "" : "s"}</span></div>
            {grouped.length ? grouped.map(([sportName, roster]) => (
              <div key={sportName} style={{ marginBottom: 22 }}>
                <h3 className={styles.sectionTitle}>{sportName} <span className={styles.formHint}>({roster.length})</span></h3>
                <div className={styles.tableWrap}><table>
                  <thead><tr><th>Code</th><th>Athlete</th><th>Event / discipline</th><th>School</th><th>Coach</th><th>Health</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {roster.map((athlete) => (
                      <tr key={athlete.id}>
                        <td data-label="Code">{athlete.athleteCode}</td>
                        <td data-label="Athlete" style={{ display: "flex", alignItems: "center", gap: 10 }}><Avi name={`${athlete.firstName} ${athlete.lastName}`} url={athlete.pictureUrl} /><span><Link href={`/athletes/${athlete.id}`} style={{ fontWeight: 700 }}>{athlete.firstName} {athlete.middleName || ""} {athlete.lastName}</Link><small>{athlete.gender}</small></span></td>
                        <td data-label="Event / discipline">{athlete.event?.eventName || "No event"}</td>
                        <td data-label="School">{athlete.school?.schoolName || "Unassigned"}</td>
                        <td data-label="Coach">{athlete.coach ? athlete.coach.firstName + " " + athlete.coach.lastName : "Unassigned"}</td>
                        <td data-label="Health"><HealthBadge status={athlete.healthStatus} /></td>
                        <td data-label="Status"><StatusBadge status={athlete.status} /></td>
                        <td><Link className={styles.expandBtn} href={`/athletes/${athlete.id}`}>Profile</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )) : <p className={styles.empty}>No athletes registered yet.</p>}
          </section>
        )}
      </AppShell>
    </>
  );
}

function StatusBadge({ status }) {
  const value = String(status || "").toLowerCase();
  if (value === "active") return <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span>;
  if (value === "inactive") return <span className={`${styles.badge} ${styles.badgeMuted}`}>Inactive</span>;
  return <span className={`${styles.badge} ${styles.badgeMuted}`}>{status || "—"}</span>;
}

const HEALTH_META = {
  healthy: { label: "Healthy", cls: "badgeActive" },
  sick: { label: "Sick", cls: "badgeRejected" },
  injured: { label: "Injured", cls: "badgeRejected" },
  recovering: { label: "Recovering", cls: "badgePending" },
  inactive: { label: "Inactive", cls: "badgeMuted" },
};

function Avi({ name, url }) {
  const initials = (name || "A").split(" ").filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  if (url) {
    return <img src={url} alt="" style={{ width: "34px", height: "34px", objectFit: "cover", borderRadius: "50%", flexShrink: 0, verticalAlign: "middle" }} />;
  }
  return <span style={{ width: "34px", height: "34px", borderRadius: "50%", background: "rgba(45,212,168,.18)", color: "var(--accent)", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "13px" }}>{initials}</span>;
}

function HealthBadge({ status }) {
  const meta = HEALTH_META[status] || { label: status || "—", cls: "badgeMuted" };
  return <span className={`${styles.badge} ${styles[meta.cls]}`}>{meta.label}</span>;
}

function AthleteForm({ catalog, isAdmin, onDone }) {
  const [message, setMessage] = React.useState("");
  const [createdCode, setCreatedCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [pictureUrl, setPictureUrl] = React.useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setCreatedCode("");
    const form = new FormData(event.currentTarget);
    const csrf = await fetch("/api/csrf").then((response) => response.json());
    const body = Object.fromEntries(form.entries());
    const response = await fetch("/api/athletes", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    if (response && response.ok && !result.error) {
      setMessage("Athlete registered successfully.");
      setCreatedCode(result.athleteCode || "");
      setPictureUrl("");
      event.currentTarget.reset();
    } else {
      setMessage(result.error || "Could not register athlete.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.formGrid}>
      <p className={`${styles.fullField} ${styles.formHint}`}>Athlete code is generated automatically.</p>
      <div className={styles.fullField}>
        <IdPhotoUpload value={pictureUrl} onChange={setPictureUrl} label="2x2 ID picture" />
        <input type="hidden" name="pictureUrl" value={pictureUrl} />
      </div>
      <label>First name<input name="firstName" required maxLength="100" /></label>
      <label>Middle name<input name="middleName" maxLength="100" /></label>
      <label>Last name<input name="lastName" required maxLength="100" /></label>
      <label>Birthdate<input name="birthdate" type="date" required /></label>
      <label>Gender<select name="gender" defaultValue="prefer_not_to_say"><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
      <label>Sport<select name="sportId" required defaultValue="">{catalog.sports.map((sport) => <option value={sport.id} key={sport.id}>{sport.sportName}</option>)}</select></label>
      <label>Event<select name="eventId" defaultValue=""><option value="">No event</option>{catalog.events.map((event) => <option value={event.id} key={event.id}>{event.sport.sportName} - {event.eventName}</option>)}</select></label>
      {isAdmin && (
        <label className={styles.fullField}>Assigned coach (admin){catalog.coaches.length > 0 ? <select name="coachId" required defaultValue="">{catalog.coaches.map((coach) => <option value={coach.id} key={coach.id}>{coach.firstName} {coach.lastName} ({coach.coachCode}){coach.school?.schoolName ? ` - ${coach.school.schoolName}` : ""}</option>)}</select> : <select name="coachId" required defaultValue=""><option value="">No active coaches available</option></select>}</label>
      )}
      <label>School<input name="school" maxLength="191" placeholder="Enter school name" /></label>
      <label>Contact number<input name="contactNumber" maxLength="30" /></label>
      <label>Email<input name="email" type="email" maxLength="191" /></label>
      <label>Height (cm)<input name="height" type="number" step="0.01" min="1" max="300" placeholder="e.g. 170" /></label>
      <label>Weight (kg)<input name="weight" type="number" step="0.01" min="1" max="300" placeholder="e.g. 60" /></label>
      <label>Health status<select name="healthStatus" defaultValue="healthy"><option value="healthy">Healthy</option><option value="recovering">Recovering</option><option value="sick">Sick</option><option value="injured">Injured</option><option value="inactive">Inactive</option></select></label>
      <label className={styles.fullField}>Address<textarea name="address" maxLength="2000" /></label>
      <div className={styles.formActions}>
        <button className={styles.primary} disabled={busy}>{busy ? "Saving..." : "Register athlete"}</button>
        <button type="button" className={styles.secondary} onClick={onDone}>Cancel</button>
      </div>
      {message && <p role="status" className={`${styles.fullField} ${createdCode ? styles.formSuccess : ""}`}>{createdCode ? `${message} Athlete code: ${createdCode}` : message}</p>}
    </form>
  );
}

function ImportPanel({ isAdmin, onDone }) {
  const [file, setFile] = React.useState(null);
  const [message, setMessage] = React.useState({ kind: "", text: "" });
  const [busy, setBusy] = React.useState(false);

  const headers = isAdmin
    ? ["first_name", "middle_name", "last_name", "suffix", "birthdate", "gender", "contact_number", "email", "address", "school_name", "sport_name", "coach_identifier"]
    : ["first_name", "middle_name", "last_name", "suffix", "birthdate", "gender", "contact_number", "email", "address", "school_name", "sport_name"];

  function downloadTemplate() {
    const headerRow = headers.join(",");
    const example = isAdmin
      ? "Juan,Dela,Cruz,Jr.,2010-05-20,male,09171234567,juan.cruz@example.com,City Proper,Burgos National High School,Basketball,COA-TEST01"
      : "Juan,Dela,Cruz,Jr.,2010-05-20,male,09171234567,juan.cruz@example.com,City Proper,Burgos National High School,Basketball";
    const blob = new Blob([headerRow + "\n" + example + "\n"], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "athlete_import_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function onFile(event) {
    const selected = event.currentTarget.files?.[0] || null;
    setFile(selected);
    setMessage({ kind: "", text: "" });
  }

  async function submit(event) {
    event.preventDefault();
    setMessage({ kind: "", text: "" });
    if (!file) {
      setMessage({ kind: "danger", text: "Please choose a CSV or XLSX file to import." });
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["csv", "xlsx"].includes(ext)) {
      setMessage({ kind: "danger", text: "Invalid file type. Please upload a CSV or XLSX Excel file." });
      return;
    }
    setBusy(true);
    const csrf = await fetch("/api/csrf").then((response) => response.json());
    const dataBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataBase64) {
      setBusy(false);
      setMessage({ kind: "danger", text: "Could not read the selected file." });
      return;
    }
    const response = await fetch("/api/athletes/import", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify({ fileName: file.name, dataBase64 }) }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (response && response.ok && result.success) {
      setMessage({ kind: "success", text: result.message });
      setFile(null);
      if (event.currentTarget) event.currentTarget.reset();
    } else if (response && result.rowErrors && result.rowErrors.length) {
      setMessage({ kind: "danger", text: result.error + " " + result.rowErrors.join(" | ") });
    } else {
      setMessage({ kind: "danger", text: result.error || "Import failed." });
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Bulk import</p><h2>Import athletes</h2></div></div>

      <div className={styles.importBox}>
        <h3>File requirements</h3>
        <ol className={styles.importSteps}>
          <li>Use the downloadable template and keep the header names and column order unchanged.</li>
          <li>Use <strong>YYYY-MM-DD</strong> for birthdates (e.g. 2010-05-20). Gender must be <strong>male</strong>, <strong>female</strong>, <strong>other</strong>, or <strong>prefer_not_to_say</strong>.</li>
          <li>School and sport names may be new; matching records are reused automatically.</li>
          <li>Remove the example row before importing your real records.</li>
        </ol>
        <p className={styles.importCols}><strong>Columns:</strong> {headers.join(", ")}.</p>
        <p className={styles.formHint}>{isAdmin ? "For each row, coach_identifier must be an active Coach ID, login email, or exact full name." : "Every imported athlete is automatically assigned to your coach account; coach_identifier is ignored."}</p>
        <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={downloadTemplate}>Download template (CSV)</button>
      </div>

      <h3 className={styles.importHead}>Upload file</h3>
      <form onSubmit={submit}>
        <label className={styles.importFileLabel}><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFile} />{file ? file.name : "Choose a CSV or XLSX file"}</label>
        <div className={styles.formActions}>
          <button className={styles.primary} disabled={busy}>{busy ? "Importing..." : "Import athletes"}</button>
          <button type="button" className={styles.secondary} onClick={onDone}>Cancel</button>
        </div>
        {message.text && <p role="status" className={`${styles.fullField} ${message.kind === "success" ? styles.formSuccess : styles.formError}`}>{message.text}</p>}
      </form>
    </section>
  );
}
