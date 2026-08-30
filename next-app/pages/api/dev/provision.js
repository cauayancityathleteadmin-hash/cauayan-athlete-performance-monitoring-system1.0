import { prisma } from "../../../lib/prisma";
import { setSecurityHeaders } from "../../../lib/api-security";
import { provisionSampleData } from "../../../lib/sample-data";

const PROVISION_KEY = process.env.SEED_PROVISION_KEY || "";

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  if (!PROVISION_KEY) return res.status(404).json({ error: "Not found." });
  const provided = req.headers["x-provision-key"];
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
        note: "Sample coach admin passwords are set in the codebase (lib/sample-data.js) — for testing only.",
      },
    });
  } catch (error) {
    console.error("Provision failed", error);
    return res.status(500).json({ error: "Provisioning failed.", detail: process.env.NODE_ENV === "production" ? undefined : error.message });
  }
}
