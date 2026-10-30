import Head from "next/head";
import Link from "next/link";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../../../lib/prisma";
import AppShell from "../../../components/AppShell";
import styles from "../../../styles/Dashboard.module.css";
import { reportDateTime } from "../../../lib/report-doc";

// List of immutable, finalized official reports. Rendering the list never reads
// the live subject records â€” only the stored snapshot metadata.
export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const isAdmin = session.user.role === "admin";

  let where = {};
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach) return { redirect: { destination: "/dashboard", permanent: false } };
    const athletes = await prisma.athlete.findMany({ where: { coach: { userId: Number(session.user.id) } }, select: { id: true } });
    where = {
      OR: [
        { subjectType: "athlete", subjectId: { in: athletes.map((a) => a.id) } },
        { subjectType: "coach", subjectId: coach.id },
      ],
    };
  }

  const documents = await prisma.reportDocument.findMany({
    where,
    orderBy: { finalizedAt: "desc" },
    take: 500,
    select: {
      id: true,
      reference: true,
      reportType: true,
      subjectType: true,
      subjectCode: true,
      subjectName: true,
      periodLabel: true,
      finalizedAt: true,
      preparedByName: true,
    },
  });

  return {
    props: {
      session,
      isAdmin,
      documents: documents.map((doc) => ({ ...doc, finalizedAt: doc.finalizedAt.toISOString() })),
    },
  };
}

export default function ReportArchive({ session, isAdmin, documents }) {
  const [search, setSearch] = React.useState("");
  const [type, setType] = React.useState("all");

  const query = search.trim().toLowerCase();
  const visible = documents.filter((doc) => {
    if (type !== "all" && doc.subjectType !== type) return false;
    if (!query) return true;
    return [doc.reference, doc.subjectName, doc.subjectCode, doc.preparedByName]
      .some((value) => (value || "").toLowerCase().includes(query));
  });

  return (
    <>
      <Head><title>Report archive | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Official & performance records" title="Report archive" active="/reports">
        <section className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>Finalized</p>
            <h2>Finalized official reports</h2>
            <p>Each archived report is frozen at the moment it was finalized: the record content and the printed signature block cannot be changed by later edits or by a signatory configuration change.</p>
            <p><Link href="/reports">Back to Reports</Link></p>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.formGrid}>
            <label>
              <span>Search</span>
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, name, or code" />
            </label>
            <label>
              <span>Record type</span>
              <select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="all">All</option>
                <option value="athlete">Athlete</option>
                <option value="coach">Coach</option>
              </select>
            </label>
          </div>

          {visible.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Record</th>
                    <th scope="col">Type</th>
                    <th scope="col">Period</th>
                    <th scope="col">Finalized</th>
                    <th scope="col">Prepared by</th>
                    <th scope="col">View</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.reference}</td>
                      <td>{doc.subjectName}<br /><small>{doc.subjectCode}</small></td>
                      <td>{doc.subjectType === "athlete" ? "Athlete" : "Coach"}</td>
                      <td>{doc.periodLabel}</td>
                      <td>{reportDateTime(doc.finalizedAt)}</td>
                      <td>{doc.preparedByName}</td>
                      <td><Link href={`/reports/archive/${doc.id}`}>Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.empty}>
              {documents.length
                ? "No finalized reports match these filters."
                : "No finalized reports yet. Select records on the Reports page and choose Finalize & archive."}
            </p>
          )}
        </section>
      </AppShell>
    </>
  );
}
