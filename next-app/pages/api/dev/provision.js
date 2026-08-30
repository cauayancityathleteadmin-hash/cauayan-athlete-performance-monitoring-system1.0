import { prisma } from "../../../lib/prisma";
import { setSecurityHeaders } from "../../../lib/api-security";
import { provisionSampleData } from "../../../lib/sample-data";

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

  if (!PROVISION_KEY) return res.status(404).json({ error: "Not found." });
  const provided = String(req.headers["x-provision-key"] || "").trim();
  if (!provided || provided !== PROVISION_KEY) return res.status(404).json({ error: "Not found." });

  try {
    const report = await provisionSampleData();
    const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { username: true, email: true } });
    const coaches = await prisma.coach.findMany({ select: { coachCode: true, firstName: true, lastName: true, email: true, user: { select: { username: true } } } });
    return res.status(200).json({
      success: true,
      message: "Sample data provisioned for testing. Remove SEED_PROVISION_KEY and this route before launch.",
      report,
      testAccounts: {
        admins,
        coaches,
        note: "Sample coach passwords are set in lib/sample-data.js - testing only.",
      },
    });
  } catch (error) {
    console.error("Provision failed", error);
    // Test-only route: always surface detail so we can debug quickly.
    return res.status(500).json({ error: "Provisioning failed.", detail: String((error && (error.message || error)) || error) });
  }
}
