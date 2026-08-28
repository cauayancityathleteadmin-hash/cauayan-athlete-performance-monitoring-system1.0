import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireSession, validateEmail, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { ATHLETE_IMPORT_HEADERS, parseCsv, parseXlsx, validateImportHeaders } from "../../../lib/athlete-import";

const GENDERS = ["male", "female", "other", "prefer_not_to_say"];

function isFutureBirthdate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return false;
  return date.getTime() > Date.now();
}

function isValidBirthdate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

async function resolveCoachId(prismaClient, identifier) {
  if (!identifier) return null;
  const id = identifier.trim();
  if (!id) return null;

  const byCode = await prismaClient.coach.findFirst({
    where: { status: "active", coachCode: { equals: id, mode: "insensitive" } },
    select: { id: true },
  });
  if (byCode) return byCode.id;

  const byEmail = await prismaClient.coach.findFirst({
    where: { status: "active", user: { email: { equals: id.toLowerCase() } } },
    select: { id: true },
  });
  if (byEmail) return byEmail.id;

  const normalized = id.toLowerCase().replace(/\s+/g, " ");
  const all = await prismaClient.coach.findMany({
    where: { status: "active" },
    select: { id: true, firstName: true, middleName: true, lastName: true, suffix: true },
  });
  for (const coach of all) {
    const parts = [coach.firstName, coach.middleName, coach.lastName, coach.suffix].filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ");
    if (parts === normalized) return coach.id;
  }
  return null;
}

async function getOrCreateSport(tx, sportName) {
  const name = sportName.trim();
  const existing = await tx.sport.findFirst({ where: { sportName: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (existing) return existing.id;
  const created = await tx.sport.create({ data: { sportName: name, status: "active" }, select: { id: true } });
  return created.id;
}

async function getOrCreateSchool(tx, schoolName) {
  const name = schoolName.trim();
  if (!name) return null;
  const existing = await tx.school.findFirst({ where: { schoolName: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (existing) return existing.id;
  const created = await tx.school.create({ data: { schoolName: name, status: "active" }, select: { id: true } });
  return created.id;
}

async function nextAthleteCode(tx) {
  const last = await tx.athlete.findFirst({ where: { athleteCode: { startsWith: "ATH-" } }, orderBy: { athleteCode: "desc" }, select: { athleteCode: true } });
  let nextNumber = 1;
  const match = last && last.athleteCode.match(/^ATH-(\d+)$/);
  if (match) nextNumber = Number(match[1]) + 1;
  return "ATH-" + String(nextNumber).padStart(6, "0");
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`import:${ip}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!requireCsrf(req, res)) return;

  const isAdmin = session.user.role === "admin";

  const fileName = String(req.body?.fileName || "").trim();
  const dataBase64 = String(req.body?.dataBase64 || "");
  if (!fileName || !dataBase64) {
    return res.status(400).json({ error: "Please choose a CSV or XLSX Excel file to import." });
  }

  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (!["csv", "xlsx"].includes(ext)) {
    return res.status(400).json({ error: "Invalid file type. Please upload a CSV or XLSX Excel file." });
  }

  let buffer;
  try {
    buffer = Buffer.from(dataBase64, "base64");
    if (buffer.length === 0) throw new Error("empty");
  } catch (err) {
    return res.status(400).json({ error: "The uploaded file could not be read." });
  }

  let rows;
  try {
    if (ext === "csv") {
      rows = parseCsv(buffer.toString("utf8"));
    } else {
      rows = parseXlsx(buffer, ATHLETE_IMPORT_HEADERS.length);
    }
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "The uploaded file could not be read." });
  }

  if (!rows.length) return res.status(400).json({ error: "The uploaded file is empty." });

  let headerRow;
  try {
    headerRow = rows.shift();
    validateImportHeaders(headerRow, isAdmin);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid file format." });
  }

  let currentCoachId = null;
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    if (!coach) return res.status(403).json({ error: "Coach profile not found." });
    currentCoachId = coach.id;
  }

  const processed = [];
  const rowErrors = [];
  const dataRows = rows;

  dataRows.forEach((data, index) => {
    const rowNumber = index + 2;
    const firstName = (data[0] || "").trim();
    const middleName = (data[1] || "").trim();
    const lastName = (data[2] || "").trim();
    const suffix = (data[3] || "").trim();
    const birthdate = (data[4] || "").trim();
    const gender = (data[5] || "").trim();
    const contactNumber = (data[6] || "").trim();
    const email = (data[7] || "").trim();
    const address = (data[8] || "").trim();
    const schoolName = (data[9] || "").trim();
    const sportName = (data[10] || "").trim();
    const coachIdentifier = isAdmin ? (data[11] || "").trim() : "";

    const errors = [];
    if (firstName === "") errors.push("first_name is required");
    if (lastName === "") errors.push("last_name is required");
    if (!isValidBirthdate(birthdate)) errors.push("invalid birthdate (use YYYY-MM-DD)");
    else if (isFutureBirthdate(birthdate)) errors.push("birthdate cannot be in the future");
    if (!GENDERS.includes(gender)) errors.push("invalid gender (male, female, other, or prefer_not_to_say)");
    if (sportName === "") errors.push("sport_name is required");
    if (email !== "" && !validateEmail(email)) errors.push("invalid email");
    if (isAdmin && coachIdentifier === "") errors.push("coach_identifier is required for admins");

    if (errors.length) {
      rowErrors.push(`Row ${rowNumber}: ${errors.join(", ")}`);
    } else {
      processed.push({ firstName, middleName, lastName, suffix, birthdate, gender, contactNumber, email, address, schoolName, sportName, coachIdentifier });
    }
  });

  if (rowErrors.length) {
    return res.status(422).json({ error: "Import failed. Please fix these errors:", rowErrors });
  }

  if (!processed.length) {
    return res.status(400).json({ error: "The uploaded file is empty or contains no valid data rows." });
  }

  try {
    const stats = await prisma.$transaction(async (tx) => {
      let imported = 0;
      for (const item of processed) {
        let coachId = currentCoachId;
        if (isAdmin) {
          coachId = await resolveCoachId(tx, item.coachIdentifier);
          if (!coachId) {
            throw new Error(`Coach '${item.coachIdentifier}' could not be found for one or more rows. Ensure every coach_identifier is an active Coach ID, login email, or exact full name.`);
          }
        }
        const sportId = await getOrCreateSport(tx, item.sportName);
        const schoolId = await getOrCreateSchool(tx, item.schoolName);
        const athleteCode = await nextAthleteCode(tx);
        const athlete = await tx.athlete.create({
          data: {
            athleteCode,
            firstName: item.firstName,
            middleName: item.middleName || null,
            lastName: item.lastName,
            suffix: item.suffix || null,
            birthdate: new Date(item.birthdate),
            gender: item.gender,
            contactNumber: item.contactNumber || null,
            email: item.email ? item.email.toLowerCase() : null,
            address: item.address || null,
            schoolId,
            sportId,
            coachId,
            status: "active",
            dateRegistered: new Date(),
          },
        });
        await tx.athleteCoachHistory.create({ data: { athleteId: athlete.id, coachId, assignedBy: Number(session.user.id), reason: "Initial assignment via bulk import" } });
        await tx.auditLog.create({ data: { userId: Number(session.user.id), action: "create", entityType: "athlete", entityId: athlete.id, description: `Imported athlete ${athleteCode} via bulk import` } });
        imported++;
      }
      return { imported };
    });
    return res.status(200).json({ success: true, imported: stats.imported, message: `Successfully imported ${stats.imported} athlete${stats.imported === 1 ? "" : "s"}.` });
  } catch (error) {
    console.error("Athlete import error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "An unexpected error occurred during import. The transaction was rolled back." });
  }
}
