import { setSecurityHeaders } from "../../../lib/api-security";
import { runProvisionStep, PROVISION_STEPS, provisionAdminOnly } from "../../../lib/sample-data";

// Test-sample provisioning is armed by SEED_PROVISION_KEY (trimmed) - inert otherwise.
const PROVISION_KEY = (process.env.SEED_PROVISION_KEY || "").trim();

// Allow a long-running build; the sample seeding is heavier than a typical request.
// Pages Router: settings are exported for a function. (max on Hobby is 60s.)
export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  if (!PROVISION_KEY) return res.status(404).json({ error: "Not found.", keyConfigured: false });
  const provided = String(req.headers["x-provision-key"] || "").trim();
  if (!provided || provided !== PROVISION_KEY) return res.status(404).json({ error: "Not found.", keyConfigured: true });

  try {
    let mode = "full";
    let step = null;
    try {
      const body = req.body || {};
      mode = body.mode === "admin" ? "admin" : "full";
      step = typeof body.step === "string" ? body.step : null;
    } catch (e) { /* ignore body parse issues */ }

    let result;
    if (mode === "admin") {
      const admin = await provisionAdminOnly();
      result = { mode: "admin", step: "done", done: true, admin, message: "Admin account created." };
    } else if (step) {
      // Run a single bounded step; the caller loops until done. Immune to function timeouts.
      if (step === "done") {
        result = { mode: "full", step: "done", done: true, report: null };
      } else {
        const report = await runProvisionStep(step);
        const idx = PROVISION_STEPS.indexOf(step);
        const next = idx >= 0 && idx < PROVISION_STEPS.length - 1 ? PROVISION_STEPS[idx + 1] : "done";
        result = { mode: "full", step, done: false, next, report };
      }
    } else {
      // Run all steps sequentially (may exceed the function timeout; prefer explicit steps).
      let aggregate = { step: "done", removedLegacy: 0, admins: 0, coaches: 0, schools: 0, sports: 0, events: 0, metrics: 0, athletes: 0, assessments: 0, results: 0, achievements: 0, eventPlans: 0, applications: 0, participants: 0 };
      for (const s of PROVISION_STEPS) {
        const r = await runProvisionStep(s);
        aggregate = { ...aggregate, ...r };
      }
      result = { mode: "full", step: "done", done: true, report: aggregate };
    }

    return res.status(200).json({
      success: true,
      message: "Sample data provisioned for testing. Remove SEED_PROVISION_KEY and this route before launch.",
      ...result,
    });
  } catch (error) {
    console.error("Provision failed", error);
    // Test-only route: always surface detail so we can debug quickly.
    return res.status(500).json({ error: "Provisioning failed.", detail: String((error && (error.message || error)) || error) });
  }
}
