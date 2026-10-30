import Head from "next/head";
import Link from "next/link";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../../../lib/prisma";
import AppShell from "../../../components/AppShell";
import styles from "../../../styles/Dashboard.module.css";
import { AthleteReportCard, CoachReportCard } from "../../../components/reports/record-reports";
import { printScope, reportDateTime } from "../../../lib/report-doc";
import { contentHashFor } from "../../../lib/report-finalize";

// Renders a finalized report from its stored snapshot ONLY. The live athlete or
// coach record is never read here, so later edits cannot change this page.
export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };

  const id = Number(context.params?.id);
  if (!Number.isInteger(id) || id <= 0) return { notFound: true };

  const doc = await prisma.reportDocument.findUnique({ where: { id } });
  if (!doc) return { notFound: true };

  // Authorization: admin sees every document; a coach sees only their own
  // athletes' documents and their own coach record.
  if (session.user.role !== "admin") {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach) return { redirect: { destination: "/dashboard", permanent: false } };
    let allowed = doc.subjectType === "coach" && doc.subjectId === coach.id;
    if (!allowed && doc.subjectType === "athlete") {
      const athlete = await prisma.athlete.findUnique({ where: { id: doc.subjectId }, select: { coach: { select: { userId: true } } } });
      allowed = Number(athlete?.coach?.userId) === Number(session.user.id);
    }
    if (!allowed) return { notFound: true };
  }

  const integrityOk = contentHashFor({
    reference: doc.reference,
    reportType: doc.reportType,
    subjectType: doc.subjectType,
    subjectId: doc.subjectId,
    subjectCode: doc.subjectCode,
    subjectName: doc.subjectName,
    periodFrom: doc.periodFrom ? doc.periodFrom.toISOString() : null,
    periodTo: doc.periodTo ? doc.periodTo.toISOString() : null,
    snapshot: doc.snapshot,
    signatureRows: doc.signatureRows,
    generatedBy: doc.generatedBy,
  }) === doc.contentHash;

  return {
    props: {
      session,
      isAdmin: session.user.role === "admin",
      doc: JSON.parse(JSON.stringify({
        id: doc.id,
        reference: doc.reference,
        reportType: doc.reportType,
        subjectType: doc.subjectType,
        subjectName: doc.subjectName,
        subjectCode: doc.subjectCode,
        periodLabel: doc.periodLabel,
        finalizedAt: doc.finalizedAt,
        preparedByName: doc.preparedByName,
        generatedBy: doc.generatedBy,
        contentHash: doc.contentHash,
        snapshot: doc.snapshot,
        signatureRows: doc.signatureRows,
      })),
      integrityOk,
    },
  };
}

export default function ArchivedReport({ session, isAdmin, doc, integrityOk }) {
  // Printing this page uses the same print scope as the live Records workspace.
  React.useEffect(() => {
    if (typeof document !== "undefined") document.body.dataset.printScope = "records";
  }, []);

  const snapshot = doc.snapshot || {};
  const subject = snapshot.subject || {};
  const from = snapshot.from || "";
  const to = snapshot.to || "";

  return (
    <>
      <Head><title>{`${doc.reference} | Report archive`}</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Official & performance records" title="Finalized report" active="/reports">
        <section className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>Archived</p>
            <h2>{doc.reference}</h2>
            <p>
              {doc.subjectName} ({doc.subjectCode}) · {doc.subjectType === "athlete" ? "Athlete" : "Coach"} record · {doc.periodLabel}
            </p>
            <p>
              Finalized {reportDateTime(doc.finalizedAt)} by {doc.preparedByName}. This report is frozen: it renders the stored snapshot and the stored signature block, so later record edits or signatory changes cannot alter it.
            </p>
            <p>
              {integrityOk
                ? <span className={styles.formSuccess} role="status">Integrity verified — stored content matches its recorded hash.</span>
                : <span className={styles.formError} role="alert">Integrity check failed — the stored content does not match its recorded hash. Do not rely on this copy; contact the administrator.</span>}
            </p>
            <p>
              <button type="button" className={styles.secondary} onClick={() => printScope("records")}>Print report</button>
              {" "}<Link href="/reports/archive">Back to archive</Link>
            </p>
          </div>
        </section>

        <section className={styles.panel}>
          <div id="report-workspace">
            {doc.subjectType === "athlete" ? (
              <AthleteReportCard
                athlete={subject}
                session={session}
                from={from}
                to={to}
                prefix="APR-"
                reference={doc.reference}
                issuedAt={doc.finalizedAt}
                generatedBy={doc.generatedBy}
                signatureRows={doc.signatureRows}
              />
            ) : (
              <CoachReportCard
                coach={subject}
                session={session}
                from={from}
                to={to}
                prefix="CPR-"
                reference={doc.reference}
                issuedAt={doc.finalizedAt}
                generatedBy={doc.generatedBy}
                signatureRows={doc.signatureRows}
              />
            )}
          </div>
        </section>
      </AppShell>
    </>
  );
}
