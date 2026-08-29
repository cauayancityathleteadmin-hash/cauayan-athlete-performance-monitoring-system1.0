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
  const student = { orderBy: [{ status: "asc" }, { lastName: "asc" }], include: { school: true, sport: true, event: true, coach: true } };
  if (session.user.role === "coach") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (coach) student.where = { coachId: coach.id };
  }
  const [athleteResult, sports, events] = await Promise.all([
    paginatePrisma(prisma.athlete, page, student),
    prisma.sport.findMany({ where: { status: "active" }, orderBy: { sportName: "asc" } }),
    prisma.event.findMany({ where: { status: "active" }, include: { sport: true }, orderBy: { eventName: "asc" } }),
  ]);
  const athletes = athleteResult.items.map((athlete) => ({ ...athlete, birthdate: athlete.birthdate.toISOString(), dateRegistered: athlete.dateRegistered.toISOString() }));
  return { props: { session, catalog: { sports, events }, athletes, page: athleteResult.page, totalPages: athleteResult.totalPages, total: athleteResult.total } };
}

export default function Athletes({ session, athletes, catalog, page, totalPages, total }) {
  const isAdmin = session?.user?.role === "admin";
  const [view, setView] = React.useState("list");

  return (
    <>
      <Head><title>Athletes | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Directory" title="Athletes" active="/athletes">
        <div className={styles.pageActions}>
          <button className={view === "add" ? `${styles.primary} ${styles.btnSm}` : styles.primary} onClick={() => setView(view === "add" ? "list" : "add")}>{view === "add" ? "Close form" : "Add athlete"}</button>
          <button className={view === "import" ? `${styles.secondary} ${styles.btnSm}` : styles.secondary} onClick={() => setView(view === "import" ? "list" : "import")}>{view === "import" ? "Close import" : "Import athletes"}</button>
        </div>

        {view === "add" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Registration</p><h2>Add athlete</h2></div></div>
            <AthleteForm catalog={catalog} onDone={() => setView("list")} />
          </section>
        )}

        {view === "import" && (
          <ImportPanel isAdmin={isAdmin} onDone={() => setView("list")} />
        )}

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Registered athletes</p><h2>All athletes</h2></div></div>
          <div className={styles.tableWrap}><table><thead><tr><th>Code</th><th>Athlete</th><th>Sport / event</th><th>School</th><th>Coach</th><th>Status</th></tr></thead><tbody>
            {athletes.map((athlete) => (
              <tr key={athlete.id}>
                <td>{athlete.athleteCode}</td>
                <td><strong>{athlete.firstName} {athlete.middleName || ""} {athlete.lastName}</strong><small>{athlete.gender}</small></td>
                <td>{athlete.sport.sportName}<small>{athlete.event?.eventName || "No event"}</small></td>
                <td>{athlete.school?.schoolName || "Unassigned"}</td>
                <td>{athlete.coach ? athlete.coach.firstName + " " + athlete.coach.lastName : "Unassigned"}</td>
                <td><StatusBadge status={athlete.status} /></td>
              </tr>
            ))}
          </tbody></table></div>
          <Pagination page={page} totalPages={totalPages} />
        </section>
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

function AthleteForm({ catalog, onDone }) {
  const [message, setMessage] = React.useState("");
  const [createdCode, setCreatedCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);

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
      event.currentTarget.reset();
    } else {
      setMessage(result.error || "Could not register athlete.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className={styles.formGrid}>
      <p className={`${styles.fullField} ${styles.formHint}`}>Athlete code is generated automatically.</p>
      <label>First name<input name="firstName" required maxLength="100" /></label>
      <label>Middle name<input name="middleName" maxLength="100" /></label>
      <label>Last name<input name="lastName" required maxLength="100" /></label>
      <label>Birthdate<input name="birthdate" type="date" required /></label>
      <label>Gender<select name="gender" defaultValue="prefer_not_to_say"><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
      <label>Sport<select name="sportId" required defaultValue="">{catalog.sports.map((sport) => <option value={sport.id} key={sport.id}>{sport.sportName}</option>)}</select></label>
      <label>Event<select name="eventId" defaultValue=""><option value="">No event</option>{catalog.events.map((event) => <option value={event.id} key={event.id}>{event.sport.sportName} - {event.eventName}</option>)}</select></label>
      <label>School<input name="school" maxLength="191" placeholder="Enter school name" /></label>
      <label>Contact number<input name="contactNumber" maxLength="30" /></label>
      <label>Email<input name="email" type="email" maxLength="191" /></label>
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
