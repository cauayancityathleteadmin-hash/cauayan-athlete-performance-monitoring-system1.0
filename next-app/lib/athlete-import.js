import zlib from "zlib";

export const ATHLETE_IMPORT_HEADERS = [
  "first_name",
  "middle_name",
  "last_name",
  "suffix",
  "birthdate",
  "gender",
  "contact_number",
  "email",
  "address",
  "school_name",
  "sport_name",
  "coach_identifier",
];

export function athleteImportHeaders(isAdmin) {
  return isAdmin ? ATHLETE_IMPORT_HEADERS : ATHLETE_IMPORT_HEADERS.slice(0, -1);
}

function normalizeHeaders(headers) {
  return ATHLETE_IMPORT_HEADERS.map((h) => h.toLowerCase().replace(/\s+/g, "_"));
}

function unescapeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function excelSerialToDate(serial) {
  const ms = Math.round((serial - 25569) * 86400000);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function parseCsv(text) {
  const safe = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < safe.length; i++) {
    const ch = safe[i];
    if (inQuotes) {
      if (ch === '"') {
        if (safe[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row.map((v) => v.trim()));
      row = [];
    } else if (ch === "\r") {
      // ignore carriage returns; the next newline finalizes the row
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row.map((v) => v.trim()));
  return rows;
}

function unzipEntry(buffer, targetPath) {
  if (buffer.length < 22) return null;
  const eocd = buffer.lastIndexOf(0x06054b50);
  if (eocd < 0) return null;
  if (eocd + 22 > buffer.length) return null;
  const cdCount = buffer.readUInt16LE(eocd + 10);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (cdOffset >= buffer.length) return null;
  let off = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (off + 46 > buffer.length) break;
    if (buffer.readUInt32LE(off) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(off + 10);
    const compSize = buffer.readUInt32LE(off + 20);
    const nameLen = buffer.readUInt16LE(off + 28);
    const extraLen = buffer.readUInt16LE(off + 30);
    const commentLen = buffer.readUInt16LE(off + 32);
    const localOffset = buffer.readUInt32LE(off + 42);
    const name = buffer.toString("utf8", off + 46, off + 46 + nameLen);
    if (name === targetPath || name.replace(/^\/+/, "") === targetPath.replace(/^\/+/, "")) {
      if (localOffset + 30 > buffer.length) return null;
      const lhNameLen = buffer.readUInt16LE(localOffset + 26);
      const lhExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
      const data = buffer.subarray(dataStart, dataStart + compSize);
      if (method === 0) return data;
      if (method === 8) {
        try {
          return zlib.inflateRawSync(data);
        } catch (err) {
          try {
            return zlib.inflateSync(data);
          } catch (err2) {
            return null;
          }
        }
      }
      return null;
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function extractTableText(siXml) {
  const texts = [];
  const tRe = /<t[^>]*>([\s\S]*?)<\/t>|<t[^>]*\/>/g;
  let m;
  while ((m = tRe.exec(siXml))) {
    if (m[1] !== undefined) texts.push(unescapeXml(m[1]));
  }
  return texts.join("");
}

export function parseXlsx(buffer, width) {
  const numCols = width || ATHLETE_IMPORT_HEADERS.length;

  const sharedStrings = [];
  const sharedBuf = unzipEntry(buffer, "xl/sharedStrings.xml");
  if (sharedBuf) {
    const xml = sharedBuf.toString("utf8");
    const siRe = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = siRe.exec(xml))) sharedStrings.push(extractTableText(m[1]));
  }

  const sheetBuf = unzipEntry(buffer, "xl/worksheets/sheet1.xml");
  if (!sheetBuf) throw new Error("The Excel workbook does not contain a readable first sheet.");

  const sheetXml = sheetBuf
    .toString("utf8")
    .replace(/<row[^>]*r="([^"]*)"[^>]*>/g, "\n<row __r=\"$1\">")
    .replace(/<\/row>/g, "</row>");

  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  const rows = [];
  let rm;
  while ((rm = rowRe.exec(sheetXml))) {
    const rowCells = [];
    const cRe = /<c([^>]*)>([\s\S]*?)<\/c>/g;
    let cm;
    let lastCol = -1;
    const pushed = {};
    while ((cm = cRe.exec(rm[1]))) {
      const attrs = cm[1];
      const refMatch = attrs.match(/\br="([A-Z]+)\d*"/);
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const colLetter = refMatch ? refMatch[1] : null;
      let colIndex = -1;
      if (colLetter) {
        colIndex = 0;
        for (let k = 0; k < colLetter.length; k++) colIndex = colIndex * 26 + colLetter.charCodeAt(k) - 64;
        colIndex -= 1;
      } else {
        colIndex = lastCol + 1;
      }
      lastCol = colIndex;
      const body = cm[2];
      const vMatch = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
      const isMatch = body.match(/<is>([\s\S]*?)<\/is>/);
      let value = "";
      if (vMatch) {
        value = vMatch[1];
        if (typeMatch && typeMatch[1] === "s") {
          const idx = Number(value);
          value = sharedStrings[idx] !== undefined ? sharedStrings[idx] : "";
        }
      } else if (isMatch) {
        value = extractTableText(isMatch[1]);
      }
      value = String(value).trim();
      if (colIndex < numCols && pushed[colIndex] === undefined) {
        rowCells[colIndex] = value;
        pushed[colIndex] = true;
      }
    }
    const filled = Array.from({ length: numCols }, (_, i) => (rowCells[i] !== undefined ? rowCells[i] : ""));
    if (filled.some((v) => v !== "")) {
      if (filled[4] !== "" && !Number.isNaN(Number(filled[4]))) {
        const num = Number(filled[4]);
        if (num > 0 && num < 100000) filled[4] = excelSerialToDate(num);
      }
      rows.push(filled);
    }
  }
  return rows;
}

export function validateImportHeaders(rawHeaders, isAdmin) {
  const normalized = normalizeHeaders(rawHeaders);
  const required = athleteImportHeaders(isAdmin);
  if (JSON.stringify(normalized.slice(0, required.length)) !== JSON.stringify(required)) {
    const columnList = required.join(", ");
    throw new Error(
      `Invalid header row. Use the provided template and keep the columns in the exact required order. Required columns: ${columnList}.`
    );
  }
}
