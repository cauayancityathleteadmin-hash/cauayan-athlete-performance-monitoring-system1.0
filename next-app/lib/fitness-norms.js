/**
 * DB-backed fitness reference bands (server-side only).
 *
 * The numeric bands live in the `fitness_norms` table so admins can edit them.
 * The JS defaults in lib/starter-metrics.js are the fallback and the seed source:
 * DB rows override the JS defaults band-by-band, so a partially-seeded table
 * still classifies correctly.
 *
 * This module imports `lib/prisma`, so it must only be used on the server
 * (getServerSideProps / API routes). Client components receive the overrides
 * map as a prop and pass it to classifyFitnessValue(..., overrides).
 */
import { prisma } from "./prisma";
import { STARTER_NORMS, CLASSIFICATION_TIERS } from "./starter-metrics";

export const NORM_TIERS = CLASSIFICATION_TIERS; // ["excellent","veryGood","good","fair","needsImprovement"]
export const NORM_SEXES = ["male", "female"];

/**
 * Load all DB norm overrides shaped for starter-metrics' `resolveNorm`:
 *   { [fitnessType]: { verified, sourceNote, norms: { male: { "10-11": {...} } } } }
 * Returns an empty object when the table is empty or unreachable, so callers
 * always fall back to the JS defaults.
 */
export async function loadNormOverrides() {
  let rows = [];
  try {
    rows = await prisma.fitnessNorm.findMany();
  } catch {
    return {};
  }
  const out = {};
  for (const row of rows) {
    const ft = row.fitnessType;
    if (!STARTER_NORMS[ft]) continue;
    if (!out[ft]) out[ft] = { verified: false, sourceNote: null, norms: {} };
    if (!out[ft].norms[row.sex]) out[ft].norms[row.sex] = {};
    if (!out[ft].norms[row.sex][row.ageGroup]) out[ft].norms[row.sex][row.ageGroup] = {};
    // A row that carries a band is treated as a deliberate admin value; only
    // report the whole block "verified" once every band row is verified.
    out[ft].norms[row.sex][row.ageGroup][row.tier] = Number(row.value);
    if (row.sourceNote) out[ft].sourceNote = row.sourceNote;
  }
  // Only mark a block verified when *all* of its rows are verified.
  for (const ft of Object.keys(out)) {
    const verifiedRows = rows.filter((r) => r.fitnessType === ft);
    out[ft].verified = verifiedRows.length > 0 && verifiedRows.every((r) => r.verified === true);
  }
  return out;
}

/**
 * Count how many band rows currently exist (for the admin screen header).
 */
export async function countNormRows() {
  try {
    return await prisma.fitnessNorm.count();
  } catch {
    return 0;
  }
}

/**
 * Seed any missing band rows from the JS defaults. Existing rows are left
 * untouched, so this is safe to call repeatedly.
 * Returns { created }.
 */
export async function seedNormsFromDefaults(updatedBy) {
  const data = [];
  for (const [fitnessType, block] of Object.entries(STARTER_NORMS)) {
    for (const sex of Object.keys(block.norms || {})) {
      for (const [ageGroup, tiers] of Object.entries(block.norms[sex])) {
        for (const tier of NORM_TIERS) {
          const value = tiers[tier];
          if (!Number.isFinite(value)) continue;
          data.push({
            fitnessType,
            sex,
            ageGroup,
            tier,
            value,
            verified: block.verified === true,
            sourceNote: block.sourceNote || null,
            updatedBy: updatedBy ?? null,
          });
        }
      }
    }
  }
  if (data.length === 0) return { created: 0 };
  const result = await prisma.fitnessNorm.createMany({ data, skipDuplicates: true });
  return { created: result.count };
}

/**
 * Write a single band value. Creates the row if it does not exist yet.
 */
export async function setNormValue({ fitnessType, sex, ageGroup, tier, value, verified, sourceNote, updatedBy }) {
  const num = Number(value);
  if (!STARTER_NORMS[fitnessType] || !NORM_SEXES.includes(sex) || !NORM_TIERS.includes(tier)) {
    return { error: "Unknown fitness type, sex, or tier." };
  }
  if (!Number.isFinite(num)) return { error: "Value must be a number." };

  const where = { fitnessType_sex_ageGroup_tier: { fitnessType, sex, ageGroup, tier } };
  const existing = await prisma.fitnessNorm.findUnique({ where });
  const blockSource = STARTER_NORMS[fitnessType].sourceNote || null;

  return prisma.fitnessNorm.upsert({
    where,
    create: {
      fitnessType, sex, ageGroup, tier,
      value: num,
      verified: verified === true,
      sourceNote: typeof sourceNote === "string" && sourceNote.trim() ? sourceNote.trim() : blockSource,
      updatedBy: updatedBy ?? null,
    },
    update: {
      value: num,
      ...(verified === undefined ? {} : { verified: verified === true }),
      ...(typeof sourceNote === "string" && sourceNote.trim() ? { sourceNote: sourceNote.trim() } : {}),
      updatedBy: updatedBy ?? null,
    },
  });
}

/**
 * Reset a fitness type's bands to the JS defaults (deletes its DB rows so the
 * defaults apply again). Returns { deleted }.
 */
export async function resetNormsToDefault(fitnessType) {
  if (fitnessType && !STARTER_NORMS[fitnessType]) return { error: "Unknown fitness type." };
  const result = await prisma.fitnessNorm.deleteMany({
    where: fitnessType ? { fitnessType } : {},
  });
  return { deleted: result.count };
}

/**
 * Build a display table for the admin screen: every fitness type with the
 * effective band per sex/age-group/tier plus a verified flag.
 */
export function buildNormTable(overrides) {
  const rows = [];
  for (const [fitnessType, block] of Object.entries(STARTER_NORMS)) {
    const effective = (overrides && overrides[fitnessType]) || {};
    const norms = effective.norms || block.norms;
    const verified = effective.verified === true;
    for (const sex of Object.keys(block.norms || {})) {
      for (const ageGroup of Object.keys(block.norms[sex] || {})) {
        const tiers = (norms?.[sex]?.[ageGroup]) || block.norms[sex][ageGroup];
        rows.push({
          fitnessType,
          label: block.label,
          test: block.test,
          unit: block.unit,
          betterDirection: block.betterDirection,
          sex,
          ageGroup,
          tiers: { ...tiers },
          verified,
        });
      }
    }
  }
  return rows;
}
