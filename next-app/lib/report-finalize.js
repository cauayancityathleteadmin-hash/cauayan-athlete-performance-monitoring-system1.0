// Finalization of official personnel records.
//
// A finalized report is immutable: the subject snapshot and the fully resolved
// signature rows are stored as JSON at this moment. Re-rendering later reads
// only the stored snapshot, so neither a source-record edit nor a signatory
// configuration change can rewrite an issued report.

import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { loadAthleteReportSubject, loadCoachReportSubject } from "./report-data";
import { resolveSignatureRows } from "./report-doc";
import { loadSignatoriesByType } from "./signatories";
import { formatDate } from "./report-labels";

export const REPORT_TYPE_BY_SUBJECT = { athlete: "athlete_record", coach: "coach_record" };
export const SUBJECT_TYPES = Object.keys(REPORT_TYPE_BY_SUBJECT);
const PREFIX = { athlete: "APR-", coach: "CPR-" };

// Accepts "", null, or a YYYY-MM-DD string. Returns { value } or { error }.
export function parsePeriodDate(raw) {
  if (raw === undefined || raw === null || raw === "") return { value: null };
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { error: "Period dates must use the YYYY-MM-DD format." };
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return { error: "Period dates must be valid dates." };
  return { value: date };
}

export function dateString(date) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function periodLabelFor(from, to) {
  if (!from && !to) return "All-time";
  return `${from ? formatDate(`${from}T00:00:00.000Z`) : "Earliest"} – ${to ? formatDate(`${to}T00:00:00.000Z`) : "Latest"}`;
}

// Must match the Record No. the report card prints.
export function referenceFor({ subjectType, subjectCode, from, to }) {
  if (subjectType === "coach") return `${PREFIX.coach}${subjectCode}`;
  return `${PREFIX.athlete}${subjectCode}-${from || "all"}${to ? `-${to}` : ""}`;
}

// JSONB does not preserve object key order, so the hash must be computed over a
// canonical (recursively key-sorted) form or a stored document would never
// verify after a round-trip through PostgreSQL.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

export function contentHashFor(doc) {
  const canonical = JSON.stringify(canonicalize({
    reference: doc.reference,
    reportType: doc.reportType,
    subjectType: doc.subjectType,
    subjectId: doc.subjectId,
    subjectCode: doc.subjectCode,
    subjectName: doc.subjectName,
    periodFrom: doc.periodFrom,
    periodTo: doc.periodTo,
    snapshot: doc.snapshot,
    signatureRows: doc.signatureRows,
    generatedBy: doc.generatedBy,
  }));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

async function uniqueReference(base) {
  const taken = new Set(
    (await prisma.reportDocument.findMany({ where: { reference: { startsWith: base } }, select: { reference: true } })).map((r) => r.reference),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 10000; n++) {
    const candidate = `${base}-R${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("Could not allocate a unique report reference.");
}

// Authorization is enforced here, not in the UI: an admin may finalize any
// subject; a coach may finalize only their own athletes and their own record.
export async function assertCanFinalize(session, subjectType, subjectId) {
  if (session.user.role === "admin") return null;
  if (subjectType === "athlete") {
    const athlete = await prisma.athlete.findUnique({
      where: { id: subjectId },
      select: { coach: { select: { userId: true } } },
    });
    if (!athlete) return { status: 404, error: "Athlete not found." };
    if (Number(athlete.coach?.userId) !== Number(session.user.id)) {
      return { status: 403, error: "You can only finalize records for your own athletes." };
    }
    return null;
  }
  const coach = await prisma.coach.findUnique({ where: { id: subjectId }, select: { userId: true } });
  if (!coach) return { status: 404, error: "Coach not found." };
  if (Number(coach.userId) !== Number(session.user.id)) {
    return { status: 403, error: "You can only finalize your own record." };
  }
  return null;
}

export async function finalizeReport({ session, subjectType, subjectId, from, to }) {
  const denied = await assertCanFinalize(session, subjectType, subjectId);
  if (denied) return denied;

  const reportType = REPORT_TYPE_BY_SUBJECT[subjectType];
  const subject = subjectType === "athlete"
    ? await loadAthleteReportSubject(subjectId)
    : await loadCoachReportSubject(subjectId);
  if (!subject) return { status: 404, error: `${subjectType === "athlete" ? "Athlete" : "Coach"} not found.` };

  const subjectCode = subjectType === "athlete" ? subject.athleteCode : subject.coachCode;
  const subjectName = `${subject.lastName}, ${subject.firstName}${subject.middleName ? ` ${subject.middleName}` : ""}${subject.suffix ? ` ${subject.suffix}` : ""}`;
  const reference = await uniqueReference(referenceFor({ subjectType, subjectCode, from, to }));

  const signatoriesByType = await loadSignatoriesByType();
  const signatureRows = resolveSignatureRows({
    session,
    signatories: signatoriesByType[reportType] || null,
  });

  const generatedBy = session.user.name || session.user.email || "system";
  const doc = {
    reference,
    reportType,
    subjectType,
    subjectId,
    subjectCode,
    subjectName,
    periodFrom: from ? `${from}T00:00:00.000Z` : null,
    periodTo: to ? `${to}T00:00:00.000Z` : null,
    periodLabel: periodLabelFor(from, to),
    snapshot: { subject, from: from || "", to: to || "" },
    signatureRows,
    generatedBy,
  };

  const created = await prisma.reportDocument.create({
    data: {
      ...doc,
      periodFrom: from ? new Date(`${from}T00:00:00.000Z`) : null,
      periodTo: to ? new Date(`${to}T00:00:00.000Z`) : null,
      preparedById: Number(session.user.id) || null,
      preparedByName: generatedBy,
      contentHash: contentHashFor(doc),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: Number(session.user.id),
      action: "finalize",
      entityType: "report_document",
      entityId: created.id,
      description: `Finalized ${reportType} ${created.reference} for ${subjectName} (${created.periodLabel}).`,
    },
  });

  return { status: 201, document: created };
}
