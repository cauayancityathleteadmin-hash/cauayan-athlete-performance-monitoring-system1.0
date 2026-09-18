import Head from "next/head";
import Link from "next/link";
import React from "react";
import { useRouter } from "next/router";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import Pagination from "../components/Pagination";
import AthletePickList from "../components/AthletePickList";
import IdPhotoUpload from "../components/IdPhotoUpload";
import ProfilePhoto from "../components/ProfilePhoto";
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
  const student = { orderBy: athleteOrderBy(sort, dir), include: { school: { select: { schoolName: true } }, sport: { select: { sportName: true } }, event: { select: { eventName: true } }, coach: { select: { id: true, firstName: true, lastName: true } } } };
  if (health === "flagged") student.where = { healthStatus: { in: ["sick", "injured", "recovering", "inactive"] } };
  else if (health) student.where = { healthStatus: health };
  const isCoach = session.user.role === "coach";
  const ownCoach = isCoach ? await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } }) : null;
  if (ownCoach) student.where = { ...(student.where || {}), coachId: ownCoach.id };
  const [athletesResult, allAthletesResult, sports, events, coaches] = await Promise.all([
    prisma.athlete.findMany(student),
    isCoach
      ? prisma.athlete.findMany({
          orderBy: { lastName: "asc" },
          include: { school: { select: { schoolName: true } }, sport: { select: { sportName: true } }, event: { select: { eventName: true } }, coach: { select: { id: true, firstName: true, lastName: true } } },
        })
      : Promise.resolve([]),
    prisma.sport.findMany({ where: { status: "active" }, orderBy: { sportName: "asc" } }),
    prisma.event.findMany({ where: { status: "active" }, include: { sport: true }, orderBy: { eventName: "asc" } }),
    prisma.coach.findMany({ where: { status: "active" }, orderBy: { lastName: "asc" }, select: { id: true, coachCode: true, firstName: true, lastName: true, schoolId: true, userId: true, school: { select: { schoolName: true } } } }),
  ]);
  const athletes = athletesResult.map((athlete) => ({ ...athlete, birthdate: athlete.birthdate.toISOString(), dateRegistered: athlete.dateRegistered.toISOString() }));
  const allAthletes = isCoach
    ? allAthletesResult.map((athlete) => ({ ...athlete, birthdate: athlete.birthdate.toISOString(), dateRegistered: athlete.dateRegistered.toISOString() }))
    : athletesResult;
  const perPage = 25;
  const totalPages = Math.max(1, Math.ceil(athletes.length / perPage));
  const paginated = athletes.slice((page - 1) * perPage, page * perPage);
  return { props: { session, catalog: { sports: JSON.parse(JSON.stringify(sports)), events: JSON.parse(JSON.stringify(events)), coaches: JSON.parse(JSON.stringify(coaches)) }, athletes: JSON.parse(JSON.stringify(athletes)), paginated: JSON.parse(JSON.stringify(paginated)), page: Math.min(page, totalPages), totalPages, total: athletes.length, sort, dir, health, allAthletes: JSON.parse(JSON.stringify(allAthletes)), ownCoachId: ownCoach ? ownCoach.id : null } };
}

export default function Athletes({ session, athletes, paginated: serverPaginated, catalog, page: serverPage, totalPages: serverTotalPages, total, sort, dir, health, allAthletes = [], ownCoachId = null }) {
  const isAdmin = session?.user?.role === "admin";
  const isCoach = session?.user?.role === "coach";
  const [view, setView] = React.useState("roster");
  const [listMode, setListMode] = React.useState("sport");
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

  const directoryAthletes = React.useMemo(() => (isAdmin ? athletes : allAthletes), [isAdmin, athletes, allAthletes]);
  const [coachFilter, setCoachFilter] = React.useState(null);
  const [dirSort, setDirSort] = React.useState("name");
  const [dirDir, setDirDir] = React.useState("asc");

  function toggleDirSort(nextSort) {
    if (dirSort === nextSort) setDirDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setDirSort(nextSort); setDirDir("asc"); }
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

  const filteredAll = React.useMemo(() => {
    let list = directoryAthletes;
    if (coachFilter) list = list.filter((a) => a.coachId === coachFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) =>
        a.firstName.toLowerCase().includes(q) ||
        a.lastName.toLowerCase().includes(q) ||
        (a.middleName || "").toLowerCase().includes(q) ||
        a.athleteCode.toLowerCase().includes(q) ||
        (a.sport?.sportName || "").toLowerCase().includes(q) ||
        (a.event?.eventName || "").toLowerCase().includes(q) ||
        (a.school?.schoolName || "").toLowerCase().includes(q) ||
        (a.coach ? `${a.coach.firstName} ${a.coach.lastName}`.toLowerCase() : "").includes(q)
      );
    }
    const dir = dirDir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => {
      if (dirSort === "code") return String(a.athleteCode).localeCompare(String(b.athleteCode)) * dir;
      if (dirSort === "sport") return (a.sport?.sportName || "").localeCompare(b.sport?.sportName || "") * dir || `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`) * dir;
    });
  }, [directoryAthletes, coachFilter, search, dirSort, dirDir]);

  const groupedByCoach = React.useMemo(() => {
    const map = new Map();
    for (const athlete of filteredAll) {
      const coachName = athlete.coach ? `${athlete.coach.firstName} ${athlete.coach.lastName}` : "Uncoached athletes";
      if (!map.has(coachName)) map.set(coachName, []);
      map.get(coachName).push(athlete);
    }
    return [...map.entries()].sort((a, b) => {
      const aEmpty = a[0] === "Uncoached athletes";
      const bEmpty = b[0] === "Uncoached athletes";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [filteredAll]);

  const perPage = 25;
  const clientTotalPages = Math.max(1, Math.ceil(filteredAthletes.length / perPage));
  const currentPage = Math.min(serverPage, clientTotalPages);
  const clientPaginated = filteredAthletes.slice((currentPage - 1) * perPage, currentPage * perPage);

  return (
    <>
      <Head><title>Athletes | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Athletes" title="Athletes" active="/athletes">
        <div className={styles.pageTitle}><h1>Athletes</h1></div>
        <div className={styles.pageActions}>
          <div className={styles.segmented}>
            <button className={view === "roster" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} onClick={() => setView("roster")}>{isCoach ? "My athletes" : "All athletes"}</button>
            {isCoach && <button className={view === "all" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} onClick={() => setView("all")}>Directory</button>}
            {isCoach && <button className={view === "requests" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} onClick={() => setView("requests")}>Transfers</button>}
            {isAdmin && <button className={view === "requests" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} onClick={() => setView("requests")}>Transfer requests</button>}
            {isAdmin && <button className={view === "transfer" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} onClick={() => setView("transfer")}>Transfer athletes</button>}
          </div>
          <button className={view === "add" ? `${styles.primary} ${styles.btnSm}` : styles.primary} onClick={() => setView(view === "add" ? "roster" : "add")}>{view === "add" ? "Close form" : "Add athlete"}</button>
          <button className={view === "import" ? `${styles.secondary} ${styles.btnSm}` : styles.secondary} onClick={() => setView(view === "import" ? "roster" : "import")}>{view === "import" ? "Close import" : "Import athletes"}</button>
        </div>

        {view === "add" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Registration</p><h2>Add athlete</h2></div></div>
            <AthleteForm catalog={catalog} isAdmin={isAdmin} onDone={() => setView("roster")} />
          </section>
        )}

        {view === "import" && (
          <ImportPanel isAdmin={isAdmin} onDone={() => setView("roster")} />
        )}

        {view === "roster" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Registered athletes</p>
                <h2>{isCoach ? "My athletes" : "All athletes"}{listMode === "sport" ? " by sport" : ""}</h2>
              </div>
              <div className={styles.segmented}>
                <button className={listMode === "sport" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} onClick={() => setListMode("sport")}>By sport</button>
                <button className={listMode === "list" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} onClick={() => setListMode("list")}>List</button>
              </div>
              {listMode === "sport" && <span className={styles.formHint} style={{ alignSelf: "center" }}>{filteredAthletes.length} athlete{filteredAthletes.length === 1 ? "" : "s"}</span>}
            </div>
            {listMode === "list" ? (
              <>
            <div className={styles.toolbar}>
            <label className={styles.searchLabel}>Search athletes<input type="text" placeholder="Name, code, sport, event, school, coach…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
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
                  <td data-label="Athlete" className={styles.avatarCell}><Avi name={`${athlete.firstName} ${athlete.lastName}`} url={athlete.pictureUrl} /><span><Link href={`/athletes/${athlete.id}`} style={{ fontWeight: 700 }}>{athlete.firstName} {athlete.middleName || ""} {athlete.lastName}</Link><small>{athlete.gender}</small></span></td>
                  <td data-label="Sport / event">{athlete.sport.sportName}<small>{athlete.event?.eventName || "No event"}</small></td>
                  <td data-label="School">{athlete.school?.schoolName || "Unassigned"}</td>
                  <td data-label="Coach">{athlete.coach ? athlete.coach.firstName + " " + athlete.coach.lastName : "Unassigned"}</td>
                  <td data-label="Health"><HealthBadge status={athlete.healthStatus} /></td>
                  <td data-label="Status"><StatusBadge status={athlete.status} /></td>
                  <td data-label="Profile"><Link className={styles.expandBtn} href={`/athletes/${athlete.id}`}>Profile</Link></td>
                </tr>
              ))}
            </tbody></table></div>
            <Pagination page={currentPage} totalPages={clientTotalPages} query={{ sort, dir, health, search }} />
              </>
            ) : (
              <>
              {grouped.length ? grouped.map(([sportName, roster]) => (
                <div key={sportName} style={{ marginBottom: "var(--space-5)" }}>
                  <h3 className={styles.sectionTitle}>{sportName} <span className={styles.formHint}>({roster.length})</span></h3>
                  <div className={styles.tableWrap}><table>
                    <thead><tr><th>Code</th><th>Athlete</th><th>Event / discipline</th><th>School</th><th>Coach</th><th>Health</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {roster.map((athlete) => (
                        <tr key={athlete.id}>
                          <td data-label="Code">{athlete.athleteCode}</td>
                          <td data-label="Athlete" className={styles.avatarCell}><Avi name={`${athlete.firstName} ${athlete.lastName}`} url={athlete.pictureUrl} /><span><Link href={`/athletes/${athlete.id}`} style={{ fontWeight: 700 }}>{athlete.firstName} {athlete.middleName || ""} {athlete.lastName}</Link><small>{athlete.gender}</small></span></td>
                          <td data-label="Event / discipline">{athlete.event?.eventName || "No event"}</td>
                          <td data-label="School">{athlete.school?.schoolName || "Unassigned"}</td>
                          <td data-label="Coach">{athlete.coach ? athlete.coach.firstName + " " + athlete.coach.lastName : "Unassigned"}</td>
                          <td data-label="Health"><HealthBadge status={athlete.healthStatus} /></td>
                          <td data-label="Status"><StatusBadge status={athlete.status} /></td>
                          <td data-label="Profile"><Link className={styles.expandBtn} href={`/athletes/${athlete.id}`}>Profile</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              )) : <p className={styles.empty}>No athletes registered yet.</p>}
              </>
            )}
          </section>
        )}

        {view === "all" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Athletes</p><h2>All athletes</h2></div><span className={styles.formHint} style={{ alignSelf: "center" }}>{filteredAll.length} athlete{filteredAll.length === 1 ? "" : "s"}</span></div>
            <p className={styles.formHint} style={{ marginTop: 0 }}>Every registered athlete, including those without a coach.</p>
            <div className={styles.toolbar}>
              <CoachFilter coaches={catalog.coaches || []} value={coachFilter} onChange={setCoachFilter} />
              <label className={styles.searchLabel}>Search athletes<input type="text" placeholder="Name, code, sport, event, school, coach…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            </div>
            {(() => {
              const selectedCoach = catalog.coaches.find((c) => c.id === coachFilter);
              return selectedCoach ? (
                <div className={styles.actionCell} style={{ marginBottom: 12 }}>
                  <span className={`${styles.badge} ${styles.badgeActive}`}>Showing {selectedCoach.firstName} {selectedCoach.lastName}&apos;s athletes</span>
                  <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={() => setCoachFilter(null)}>Clear filter</button>
                </div>
              ) : null;
            })()}
            {coachFilter ? (
              <div className={styles.tableWrap}><table>
                <thead><tr>
                  <th><button type="button" className={styles.sortLink} onClick={() => toggleDirSort("code")}>{dirSort === "code" && (dirDir === "asc" ? "↑ " : "↓ ")}Code</button></th>
                  <th><button type="button" className={styles.sortLink} onClick={() => toggleDirSort("name")}>{dirSort === "name" && (dirDir === "asc" ? "↑ " : "↓ ")}Athlete</button></th>
                  <th><button type="button" className={styles.sortLink} onClick={() => toggleDirSort("sport")}>{dirSort === "sport" && (dirDir === "asc" ? "↑ " : "↓ ")}Sport</button></th>
                  <th>Coach</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  {filteredAll.map((athlete) => (
                    <tr key={athlete.id}>
                      <td data-label="Code">{athlete.athleteCode}</td>
                      <td data-label="Athlete" className={styles.avatarCell}><Avi name={`${athlete.firstName} ${athlete.lastName}`} url={athlete.pictureUrl} /><span><Link href={`/athletes/${athlete.id}`} style={{ fontWeight: 700 }}>{athlete.firstName} {athlete.middleName || ""} {athlete.lastName}</Link><small>{athlete.gender}</small></span></td>
                      <td data-label="Sport">{athlete.sport?.sportName || "Unassigned"}<small>{athlete.event?.eventName || ""}</small></td>
                      <td data-label="Coach">{athlete.coach ? `${athlete.coach.firstName} ${athlete.coach.lastName}` : "Unassigned"}</td>
                      <td data-label="Status"><StatusBadge status={athlete.status} /></td>
                      <td data-label="Profile"><Link className={styles.expandBtn} href={`/athletes/${athlete.id}`}>Profile</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            ) : groupedByCoach.length ? groupedByCoach.map(([coachName, roster]) => (
              <div key={coachName} style={{ marginBottom: "var(--space-5)" }}>
                <h3 className={styles.sectionTitle}>{coachName} <span className={styles.formHint}>({roster.length})</span></h3>
                {roster.length ? (
                  <div className={styles.tableWrap}><table>
                    <thead><tr><th>Code</th><th>Athlete</th><th>Sport / event</th><th>School</th><th>Health</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {roster.map((athlete) => (
                        <tr key={athlete.id}>
                          <td data-label="Code">{athlete.athleteCode}</td>
                          <td data-label="Athlete" className={styles.avatarCell}><Avi name={`${athlete.firstName} ${athlete.lastName}`} url={athlete.pictureUrl} /><span><Link href={`/athletes/${athlete.id}`} style={{ fontWeight: 700 }}>{athlete.firstName} {athlete.middleName || ""} {athlete.lastName}</Link><small>{athlete.gender}</small></span></td>
                          <td data-label="Sport / event">{athlete.sport?.sportName || "Unassigned"}<small>{athlete.event?.eventName || ""}</small></td>
                          <td data-label="School">{athlete.school?.schoolName || "Unassigned"}</td>
                          <td data-label="Health"><HealthBadge status={athlete.healthStatus} /></td>
                          <td data-label="Status"><StatusBadge status={athlete.status} /></td>
                          <td data-label="Profile"><Link className={styles.expandBtn} href={`/athletes/${athlete.id}`}>Profile</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                ) : <p className={styles.empty}>No athletes yet.</p>}
              </div>
            )) : <p className={styles.empty}>No athletes registered yet.</p>}
          </section>
        )}

        {view === "transfer" && isAdmin && (
          <TransferPanel athletes={athletes} coaches={catalog.coaches || []} onDone={() => router.reload()} />
        )}

        {view === "requests" && isAdmin && (
          <AdminClaimsPanel onChanged={() => router.reload()} />
        )}

        {view === "requests" && isCoach && (
          <CoachRequestsPanel athletes={athletes} uncoached={allAthletes.filter((a) => !a.coach)} coaches={catalog.coaches || []} ownCoachId={ownCoachId} onChanged={() => router.reload()} />
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
  const parts = (name || "").split(" ").filter(Boolean);
  return <ProfilePhoto url={url} firstName={parts[0]} lastName={parts[1]} size={36} radius={8} style={{ verticalAlign: "middle" }} />;
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
        <label className={styles.fullField}>Assigned coach (admin)<select name="coachId" defaultValue=""><option value="">No coach (uncoached)</option>{catalog.coaches.map((c) => <option value={c.id} key={c.id}>{c.firstName} {c.lastName} ({c.coachCode}){c.school?.schoolName ? ` - ${c.school.schoolName}` : ""}</option>)}</select></label>
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
        <p className={styles.formHint}>{isAdmin ? "For each row, coach_identifier is an active Coach ID, login email, or exact full name. Leave it blank to import the athlete as uncoached." : "Every imported athlete is automatically assigned to your coach account; coach_identifier is ignored."}</p>
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

function TransferPanel({ athletes, coaches, onDone }) {
  const [selected, setSelected] = React.useState(new Set());
  const [targetCoachId, setTargetCoachId] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState({ kind: "", text: "" });

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll(ids) {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    setMessage({ kind: "", text: "" });
    if (!selected.size) { setMessage({ kind: "danger", text: "Select at least one athlete to transfer." }); return; }
    const target = coaches.find((c) => c.id === targetCoachId);
    if (!target) { setMessage({ kind: "danger", text: "Choose the coach to transfer the selected athletes to." }); return; }
    if (!window.confirm(`Reassign ${selected.size} athlete${selected.size === 1 ? "" : "s"} to ${target.firstName} ${target.lastName}? This takes effect immediately.`)) return;
    setBusy(true);
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch("/api/athletes/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify({ athleteIds: [...selected], targetCoachId: Number(targetCoachId) }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (response && response.ok && result.success) {
      setMessage({ kind: "success", text: result.message });
      setSelected(new Set());
      setTargetCoachId(null);
      setTimeout(onDone, 1200);
    } else {
      setMessage({ kind: "danger", text: result.error || "Transfer failed." });
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div><p className={styles.eyebrow}>Admin · Transfer</p><h2>Transfer athletes</h2></div>
      </div>
      <p className={styles.formHint} style={{ marginTop: 0 }}>Reassign athletes to a different coach. Each athlete keeps exactly one coach — athletes already under the target coach are skipped automatically. A history entry records every transfer.</p>
      <form onSubmit={submit}>
        <AthletePickList
          athletes={athletes}
          selected={selected}
          onToggle={toggleSelected}
          onToggleAll={toggleAll}
          nameCell={(athlete) => (
            <span className={styles.avatarCell}><Avi name={`${athlete.firstName} ${athlete.lastName}`} url={athlete.pictureUrl} /><span style={{ fontWeight: 700 }}>{athlete.firstName} {athlete.middleName || ""} {athlete.lastName}<small>{athlete.gender}</small></span></span>
          )}
          emptyText="No athletes to transfer."
        />
        <div style={{ marginTop: 16 }}>
          <CoachPicker coaches={coaches} value={targetCoachId} onChange={setTargetCoachId} emptyText="No coaches available." />
        </div>
        <div className={styles.formActions} style={{ marginTop: 16 }}>
          <button className={styles.primary} disabled={busy || !selected.size || !targetCoachId}>{busy ? "Transferring..." : `Transfer ${selected.size || ""} athlete${selected.size === 1 ? "" : "s"}`}</button>
        </div>
        {message.text && <p role="status" className={`${styles.fullField} ${message.kind === "success" ? styles.formSuccess : styles.formError}`}>{message.text}</p>}
      </form>
    </section>
  );
}

function TransferStatusBadge({ status }) {
  const value = String(status || "").toLowerCase();
  if (value === "pending") return <span className={`${styles.badge} ${styles.badgePending}`}>Pending</span>;
  if (value === "approved") return <span className={`${styles.badge} ${styles.badgeActive}`}>Approved</span>;
  if (value === "rejected") return <span className={`${styles.badge} ${styles.badgeRejected}`}>Rejected</span>;
  return <span className={`${styles.badge} ${styles.badgeMuted}`}>Cancelled</span>;
}

function CoachPicker({ coaches, value, onChange, placeholder = "Search coaches…", emptyText = "No other coaches found." }) {
  const [search, setSearch] = React.useState("");
  const query = search.trim().toLowerCase();
  const filtered = query
    ? coaches.filter((c) => `${c.firstName} ${c.lastName} ${c.coachCode || ""} ${c.school?.schoolName || ""}`.toLowerCase().includes(query))
    : coaches;

  return (
    <div>
      <label className={styles.searchLabel}>
        Coach
        <input type="text" placeholder={placeholder} value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {filtered.length === 0 ? (
        <p className={styles.empty}>{emptyText}</p>
      ) : (
        <div className={styles.coachList}>
          {filtered.map((coach) => {
            const active = value === coach.id;
            return (
              <button type="button" key={coach.id} className={active ? `${styles.coachCard} ${styles.coachCardSelected}` : styles.coachCard} onClick={() => onChange(active ? null : coach.id)} aria-pressed={active}>
                <span className={styles.coachName}>{coach.firstName} {coach.lastName}</span>
                <small className={styles.coachDetail}>{coach.coachCode}{coach.school?.schoolName ? ` · ${coach.school.schoolName}` : ""}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CoachFilter({ coaches, value, onChange }) {
  const [query, setQuery] = React.useState("");
  const selected = coaches.find((c) => c.id === value) || null;
  const inputValue = selected && query === "" ? `${selected.firstName} ${selected.lastName}` : query;
  const q = query.trim().toLowerCase();
  const suggestions = q
    ? coaches.filter((c) => `${c.firstName} ${c.lastName} ${c.coachCode || ""} ${c.school?.schoolName || ""}`.toLowerCase().includes(q)).slice(0, 8)
    : [];

  return (
    <div>
      <label className={styles.searchLabel}>
        Filter by coach
        <input type="text" placeholder="Type a coach name…" value={inputValue} onChange={(event) => { setQuery(event.target.value); if (value) onChange(null); }} />
      </label>
      {q && suggestions.length === 0 && <p className={styles.formHint}>No coach matches your search.</p>}
      {suggestions.length > 0 && (
        <div className={styles.coachList} style={{ marginTop: 8 }}>
          {suggestions.map((coach) => (
            <button type="button" key={coach.id} className={styles.coachCard} onClick={() => { onChange(coach.id); setQuery(""); }}>
              <span className={styles.coachName}>{coach.firstName} {coach.lastName}</span>
              <small className={styles.coachDetail}>{coach.coachCode}{coach.school?.schoolName ? ` · ${coach.school.schoolName}` : ""}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CoachRequestsPanel({ athletes, uncoached = [], coaches, ownCoachId, onChanged }) {
  const [received, setReceived] = React.useState([]);
  const [sent, setSent] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState({});
  const [tab, setTab] = React.useState("transfer");
  const [selected, setSelected] = React.useState(new Set());
  const [targetCoachId, setTargetCoachId] = React.useState(null);

  const load = React.useCallback(() => {
    fetch("/api/transfers")
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setError(data.error || "Could not load requests."); setReceived([]); setSent([]); }
        else { setError(""); setReceived(data.received || []); setSent(data.sent || []); }
      })
      .catch(() => setError("Could not load requests."))
      .finally(() => setLoading(false));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  function selectTab(nextTab) {
    if (nextTab === tab) return;
    setTab(nextTab);
    setSelected(new Set());
    setTargetCoachId(null);
  }

  function dateLabel(value) {
    const date = new Date(value);
    return isNaN(date) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  const targets = coaches.filter((c) => c.id !== ownCoachId);
  const list = tab === "transfer" ? athletes : uncoached;

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll(ids) {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  const selectedList = list.filter((a) => selected.has(a.id));
  const targetName = targetCoachId ? `${coaches.find((c) => c.id === targetCoachId)?.firstName || ""} ${coaches.find((c) => c.id === targetCoachId)?.lastName || ""}`.trim() : "";

  async function sendBatch() {
    if (!selected.size) { setMessage({ kind: "error", text: "Select at least one athlete." }); return; }
    if (tab === "transfer" && !targetCoachId) { setMessage({ kind: "error", text: "Choose the coach you want to send the selected athletes to." }); return; }
    if (tab === "claim" && !ownCoachId) { setMessage({ kind: "error", text: "Your coach profile could not be found." }); return; }
    const toCoachId = tab === "transfer" ? targetCoachId : ownCoachId;
    const preview = selectedList.slice(0, 6).map((a) => `${a.firstName} ${a.lastName}`).join(", ");
    const more = selectedList.length > 6 ? ` and ${selectedList.length - 6} more` : "";
    const confirmText = tab === "transfer"
      ? `Send ${selected.size} athlete${selected.size === 1 ? "" : "s"}: ${preview}${more} to ${targetName || "the chosen coach"}?`
      : `Request ${selected.size} uncoached athlete${selected.size === 1 ? "" : "s"}: ${preview}${more} to join your roster? An administrator will approve it.`;
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMessage(null);
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/transfers/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ athleteIds: [...selected], toCoachId, type: tab }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) setMessage({ kind: "error", text: result.error || "Could not send requests." });
      else {
        setMessage({ kind: "success", text: result.message });
        setSelected(new Set());
        setTargetCoachId(null);
        load();
        onChanged();
      }
    } catch (err) {
      setMessage({ kind: "error", text: "Unable to reach the server. Please try again later." });
    } finally {
      setBusy(false);
    }
  }

  async function decide(id, decision) {
    const confirmText = {
      approved: "Accept this athlete into your roster?",
      rejected: "Reject this transfer request?",
      cancelled: "Cancel this request?",
    };
    if (!window.confirm(confirmText[decision])) return;
    setBusy(true);
    setMessage(null);
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch(`/api/transfers/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ decision, note: note[id] || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) setMessage({ kind: "error", text: result.error || "Action failed." });
      else {
        setMessage({ kind: "success", text: result.message });
        setNote((cur) => ({ ...cur, [id]: "" }));
        load();
      }
    } catch (err) {
      setMessage({ kind: "error", text: "Unable to reach the server. Please try again later." });
    } finally {
      setBusy(false);
    }
  }

  async function decideMany(ids, decision) {
    if (!ids.length) return;
    const verb = decision === "approved" ? "Accept" : "Reject";
    if (!window.confirm(`${verb} ${ids.length} request${ids.length === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/transfers/batch-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ ids, decision }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) setMessage({ kind: "error", text: result.error || "Action failed." });
      else { setMessage({ kind: "success", text: result.message }); load(); }
    } catch (err) {
      setMessage({ kind: "error", text: "Unable to reach the server. Please try again later." });
    } finally {
      setBusy(false);
    }
  }

  const incomingGroups = React.useMemo(() => {
    const map = new Map();
    for (const t of received) {
      const key = t.fromCoach ? `${t.fromCoach.id}` : "admin";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return [...map.entries()].map(([key, rows]) => ({ key, coach: rows[0].fromCoach, rows }));
  }, [received]);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div><p className={styles.eyebrow}>Transfers</p><h2>Transfers</h2></div>
        <div className={styles.actionCell}>
          {message && <p role="status" className={message.kind === "success" ? styles.formSuccess : styles.formError} style={{ margin: 0 }}>{message.text}</p>}
        </div>
      </div>
      <p className={styles.formHint} style={{ marginTop: 0 }}>Move several athletes at once with a checklist. Requests stay pending until the target coach (transfers) or the administrator (claims) accepts.</p>

      <div style={{ margin: "0 0 24px" }}>
        <div className={styles.segmented}>
          <button className={tab === "transfer" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} onClick={() => selectTab("transfer")}>Send athletes to a coach</button>
          <button className={tab === "claim" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} onClick={() => selectTab("claim")}>Request uncoached athletes</button>
        </div>

        <h3 className={styles.sectionTitle} style={{ margin: "18px 0 10px" }}>{tab === "transfer" ? "My athletes" : "Uncoached athletes"} <span className={styles.formHint}>({list.length} available)</span></h3>
        <AthletePickList
          key={tab}
          athletes={list}
          selected={selected}
          onToggle={toggleSelected}
          onToggleAll={toggleAll}
          nameCell={(athlete) => (
            <span className={styles.avatarCell}><Avi name={`${athlete.firstName} ${athlete.lastName}`} url={athlete.pictureUrl} /><span style={{ fontWeight: 700 }}>{athlete.firstName} {athlete.middleName || ""} {athlete.lastName}<small>{athlete.gender}</small></span></span>
          )}
          emptyText={tab === "transfer" ? "You have no athletes to transfer." : "There are no uncoached athletes right now."}
        />
        <div style={{ marginTop: 16 }}>
          {tab === "transfer" ? (
            <CoachPicker coaches={targets} value={targetCoachId} onChange={setTargetCoachId} />
          ) : (
            <p className={styles.formHint}>Selected athletes will join your roster once an administrator approves.</p>
          )}
        </div>
        <div className={styles.formActions} style={{ marginTop: 16 }}>
          <button className={styles.primary} disabled={busy || !selected.size || (tab === "transfer" && !targetCoachId)} onClick={sendBatch}>
            {busy ? "Sending..." : tab === "transfer" ? `Send ${selected.size || ""} athlete${selected.size === 1 ? "" : "s"} to ${targetName || "coach"}` : `Request ${selected.size || ""} athlete${selected.size === 1 ? "" : "s"} for my roster`}
          </button>
        </div>
      </div>

      <h3 className={styles.sectionTitle}>Incoming requests <span className={styles.formHint}>({received.length})</span></h3>
      {loading ? <p className={styles.formHint}>Loading requests…</p> : error ? <p className={`${styles.formError} ${styles.fullField}`}>{error}</p> : received.length === 0 ? <p className={styles.empty}>You have no incoming transfer requests.</p> : incomingGroups.map((group) => (
        <div key={group.key} style={{ margin: "0 0 22px" }}>
          <div className={styles.actionCell} style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <h4 className={styles.sectionTitle} style={{ margin: 0 }}>{group.coach ? `${group.coach.firstName} ${group.coach.lastName}` : "Administrator"} <span className={styles.formHint}>({group.rows.length})</span></h4>
            <div className={styles.actionCell}>
              <button className={`${styles.primary} ${styles.btnSm}`} disabled={busy} onClick={() => decideMany(group.rows.map((t) => t.id), "approved")}>Accept all</button>
              <button className={`${styles.danger} ${styles.btnSm}`} disabled={busy} onClick={() => decideMany(group.rows.map((t) => t.id), "rejected")}>Reject all</button>
            </div>
          </div>
          <div className={styles.tableWrap}><table>
            <thead><tr><th>Athlete</th><th>Sport / event</th><th>Reason</th><th>Requested</th><th>Actions</th></tr></thead>
            <tbody>
              {group.rows.map((t) => (
                <tr key={t.id}>
                  <td data-label="Athlete" className={styles.avatarCell}><Avi name={`${t.athlete.firstName} ${t.athlete.lastName}`} /><span><span style={{ fontWeight: 700 }}>{t.athlete.firstName} {t.athlete.lastName}</span><small>{t.athlete.athleteCode}</small></span></td>
                  <td data-label="Sport / event">{t.athlete.sport?.sportName || "Unassigned"}<small>{t.athlete.event?.eventName || ""}</small></td>
                  <td data-label="Reason">{t.reason || "—"}</td>
                  <td data-label="Requested">{dateLabel(t.createdAt)}</td>
                  <td data-label="Actions">
                    <div className={styles.actionCell}>
                      <button className={`${styles.primary} ${styles.btnSm}`} disabled={busy} onClick={() => decide(t.id, "approved")}>Accept</button>
                      <button className={`${styles.danger} ${styles.btnSm}`} disabled={busy} onClick={() => decide(t.id, "rejected")}>Reject</button>
                      <input type="text" placeholder="Note (optional)" value={note[t.id] || ""} onChange={(e) => setNote((cur) => ({ ...cur, [t.id]: e.target.value }))} style={{ maxWidth: 170 }} aria-label={`Note for request ${t.id}`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      ))}

      <h3 className={styles.sectionTitle} style={{ marginTop: 24 }}>Requests I sent <span className={styles.formHint}>({sent.length})</span></h3>
      {sent.length === 0 ? <p className={styles.empty}>You have not sent any transfer requests.</p> : (
        <div className={styles.tableWrap}><table>
          <thead><tr><th>Athlete</th><th>To</th><th>Reason</th><th>Status</th><th>Requested</th><th></th></tr></thead>
          <tbody>
            {sent.map((t) => (
              <tr key={t.id}>
                <td data-label="Athlete" className={styles.avatarCell}><Avi name={`${t.athlete.firstName} ${t.athlete.lastName}`} /><span><span style={{ fontWeight: 700 }}>{t.athlete.firstName} {t.athlete.lastName}</span><small>{t.athlete.athleteCode}</small></span></td>
                <td data-label="To">{t.fromCoachId === null ? <span>Uncoached claim <small>(admin approval)</small></span> : t.toCoach ? `${t.toCoach.firstName} ${t.toCoach.lastName}` : "—"}</td>
                <td data-label="Reason">{t.reason || "—"}</td>
                <td data-label="Status"><TransferStatusBadge status={t.status} /></td>
                <td data-label="Requested">{dateLabel(t.createdAt)}</td>
                <td data-label="Action">{t.status === "pending" && <button className={`${styles.danger} ${styles.btnSm}`} disabled={busy} onClick={() => decide(t.id, "cancelled")}>Cancel</button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}

function AdminClaimsPanel({ onChanged }) {
  const [claims, setClaims] = React.useState([]);
  const [history, setHistory] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState({});

  const load = React.useCallback(() => {
    fetch("/api/transfers")
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setError(data.error || "Could not load requests."); setClaims([]); setHistory([]); }
        else { setError(""); setClaims(data.claims || []); setHistory(data.history || []); }
      })
      .catch(() => setError("Could not load requests."))
      .finally(() => setLoading(false));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  function dateLabel(value) {
    const date = new Date(value);
    return isNaN(date) ? "—" : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  async function decide(id, decision) {
    if (!window.confirm(decision === "approved" ? "Approve this request? The athlete will be added to the requesting coach's roster." : "Reject this request?")) return;
    setBusy(true);
    setMessage(null);
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch(`/api/transfers/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ decision, note: note[id] || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) setMessage({ kind: "error", text: result.error || "Action failed." });
      else { setMessage({ kind: "success", text: result.message }); setNote((cur) => ({ ...cur, [id]: "" })); load(); }
    } catch (err) {
      setMessage({ kind: "error", text: "Unable to reach the server. Please try again later." });
    } finally {
      setBusy(false);
    }
  }

  async function decideMany(ids, decision) {
    if (!ids.length) return;
    const verb = decision === "approved" ? "Approve" : "Reject";
    if (!window.confirm(`${verb} ${ids.length} claim${ids.length === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/transfers/batch-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ ids, decision }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) setMessage({ kind: "error", text: result.error || "Action failed." });
      else { setMessage({ kind: "success", text: result.message }); load(); }
    } catch (err) {
      setMessage({ kind: "error", text: "Unable to reach the server. Please try again later." });
    } finally {
      setBusy(false);
    }
  }

  const groups = React.useMemo(() => {
    const map = new Map();
    for (const claim of claims) {
      const key = claim.toCoach ? `${claim.toCoach.id}` : "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(claim);
    }
    return [...map.entries()].map(([key, rows]) => ({ key, coach: rows[0].toCoach, rows }));
  }, [claims]);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div><p className={styles.eyebrow}>Admin · Claims</p><h2>Uncoached athlete requests</h2></div>
        <div className={styles.actionCell}>
          {message && <p role="status" className={message.kind === "success" ? styles.formSuccess : styles.formError} style={{ margin: 0 }}>{message.text}</p>}
        </div>
      </div>
      <p className={styles.formHint} style={{ marginTop: 0 }}>Coaches request to take in athletes who have no coach assigned. Approving moves the athlete into the roster of the requesting coach and records the assignment.</p>

      <h3 className={styles.sectionTitle}>Pending claims <span className={styles.formHint}>({claims.length})</span></h3>
      {loading ? <p className={styles.formHint}>Loading requests…</p> : error ? <p className={`${styles.formError} ${styles.fullField}`}>{error}</p> : claims.length === 0 ? <p className={styles.empty}>No pending uncoached-athlete requests.</p> : groups.map((group) => (
        <div key={group.key} style={{ margin: "0 0 22px" }}>
          <div className={styles.actionCell} style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <h4 className={styles.sectionTitle} style={{ margin: 0 }}>{group.coach ? `${group.coach.firstName} ${group.coach.lastName}` : "Unknown coach"} <span className={styles.formHint}>({group.rows.length})</span></h4>
            <div className={styles.actionCell}>
              <button className={`${styles.primary} ${styles.btnSm}`} disabled={busy} onClick={() => decideMany(group.rows.map((claim) => claim.id), "approved")}>Approve all</button>
              <button className={`${styles.danger} ${styles.btnSm}`} disabled={busy} onClick={() => decideMany(group.rows.map((claim) => claim.id), "rejected")}>Reject all</button>
            </div>
          </div>
          <div className={styles.tableWrap}><table>
            <thead><tr><th>Athlete</th><th>Sport / event</th><th>Reason</th><th>Requested</th><th>Actions</th></tr></thead>
            <tbody>
              {group.rows.map((c) => (
                <tr key={c.id}>
                  <td data-label="Athlete" className={styles.avatarCell}><Avi name={`${c.athlete.firstName} ${c.athlete.lastName}`} /><span><span style={{ fontWeight: 700 }}>{c.athlete.firstName} {c.athlete.lastName}</span><small>{c.athlete.athleteCode}</small></span></td>
                  <td data-label="Sport / event">{c.athlete.sport?.sportName || "Unassigned"}<small>{c.athlete.event?.eventName || ""}</small></td>
                  <td data-label="Reason">{c.reason || "—"}</td>
                  <td data-label="Requested">{dateLabel(c.createdAt)}</td>
                  <td data-label="Actions">
                    <div className={styles.actionCell}>
                      <button className={`${styles.primary} ${styles.btnSm}`} disabled={busy} onClick={() => decide(c.id, "approved")}>Approve</button>
                      <button className={`${styles.danger} ${styles.btnSm}`} disabled={busy} onClick={() => decide(c.id, "rejected")}>Reject</button>
                      <input type="text" placeholder="Note (optional)" value={note[c.id] || ""} onChange={(e) => setNote((cur) => ({ ...cur, [c.id]: e.target.value }))} style={{ maxWidth: 170 }} aria-label={`Note for request ${c.id}`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      ))}

      <h3 className={styles.sectionTitle} style={{ marginTop: 24 }}>Recent decisions <span className={styles.formHint}>({history.length})</span></h3>
      {history.length === 0 ? <p className={styles.empty}>No requests have been decided yet.</p> : (
        <div className={styles.tableWrap}><table>
          <thead><tr><th>Athlete</th><th>To coach</th><th>Status</th><th>Note</th><th>Decided</th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td data-label="Athlete">{h.athlete.firstName} {h.athlete.lastName}<small>{h.athlete.athleteCode}</small></td>
                <td data-label="To coach">{h.toCoach ? `${h.toCoach.firstName} ${h.toCoach.lastName}` : "—"}</td>
                <td data-label="Status"><TransferStatusBadge status={h.status} /></td>
                <td data-label="Note">{h.decisionNote || "—"}</td>
                <td data-label="Decided">{dateLabel(h.decidedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}
