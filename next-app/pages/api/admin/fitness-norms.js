import { prisma } from "../../../lib/prisma";
import { requireCsrf, requireRole, requireSession, text, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import {
  buildNormTable,
  countNormRows,
  loadNormOverrides,
  resetNormsToDefault,
  seedNormsFromDefaults,
  setNormValue,
  NORM_SEXES,
  NORM_TIERS,
} from "../../../lib/fitness-norms";
import { STARTER_NORMS } from "../../../lib/starter-metrics";

const AGE_GROUP_RE = /^[0-9]{2}-[0-9]{2}$|^[0-9]{2}\+$/;

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session || !requireRole(session, "admin", res)) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`api:${ip}:${req.method}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  // CSRF is only needed for state-changing requests. The admin metrics page
  // loads the norms table with a plain GET.
  if (!["GET", "HEAD"].includes(req.method) && !requireCsrf(req, res)) return;

  try {
    if (req.method === "GET") {
      const overrides = await loadNormOverrides();
      const rows = buildNormTable(overrides);
      const seeded = await countNormRows();
      return res.status(200).json({
        rows,
        seeded,
        fitnessTypes: Object.entries(STARTER_NORMS).map(([key, b]) => ({ key, label: b.label, test: b.test, unit: b.unit })),
      });
    }

    if (req.method === "POST") {
      const action = text(req.body?.action, 40, true);
      const updatedBy = Number(session.user.id) || null;

      if (action === "seed") {
        const result = await seedNormsFromDefaults(updatedBy);
        await prisma.auditLog.create({ data: { userId: updatedBy, action: "seed", entityType: "fitness_norms", entityId: "seed", description: `Seeded ${result.created} fitness norm rows from defaults` } });
        return res.status(200).json({ ok: true, created: result.created });
      }

      if (action === "set") {
        const fitnessType = text(req.body?.fitnessType, 40, true);
        const sex = text(req.body?.sex, 10, true);
        const ageGroup = text(req.body?.ageGroup, 10, true);
        const tier = text(req.body?.tier, 20, true);
        const value = Number(req.body?.value);
        const verified = req.body?.verified === true || req.body?.verified === "true";

        if (!fitnessType || !STARTER_NORMS[fitnessType]) return res.status(400).json({ error: "Unknown fitness type." });
        if (!NORM_SEXES.includes(sex)) return res.status(400).json({ error: "Sex must be male or female." });
        if (!NORM_TIERS.includes(tier)) return res.status(400).json({ error: "Unknown tier." });
        if (!AGE_GROUP_RE.test(ageGroup)) return res.status(400).json({ error: "Unknown age group." });
        if (!Number.isFinite(value)) return res.status(400).json({ error: "Value must be a number." });
        if (value < 0) return res.status(400).json({ error: "Value cannot be negative." });

        await setNormValue({ fitnessType, sex, ageGroup, tier, value, verified, sourceNote: req.body?.sourceNote, updatedBy });
        await prisma.auditLog.create({ data: { userId: updatedBy, action: "update", entityType: "fitness_norm", entityId: `${fitnessType}/${sex}/${ageGroup}/${tier}`, description: `Set ${fitnessType} ${sex} ${ageGroup} ${tier} = ${value}${verified ? " (verified)" : ""}` } });
        return res.status(200).json({ ok: true });
      }

      if (action === "reset") {
        const fitnessType = text(req.body?.fitnessType, 40);
        const result = await resetNormsToDefault(fitnessType || null);
        if (result.error) return res.status(400).json({ error: result.error });
        await prisma.auditLog.create({ data: { userId: updatedBy, action: "delete", entityType: "fitness_norm", entityId: fitnessType || "all", description: `Reset ${fitnessType || "all"} fitness norms to default (${result.deleted} rows removed)` } });
        return res.status(200).json({ ok: true, deleted: result.deleted });
      }

      return res.status(400).json({ error: "Unknown action." });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("Fitness norms error:", error);
    return res.status(500).json({ error: "Could not update fitness norms." });
  }
}
