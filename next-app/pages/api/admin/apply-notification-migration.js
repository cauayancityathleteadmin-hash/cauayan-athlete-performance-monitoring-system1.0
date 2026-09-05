import { prisma } from "../../../lib/prisma";
import { requireRole, requireSession } from "../../../lib/api-security";

export default async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session || !requireRole(session, "admin", res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const sql = `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaches' AND column_name = 'notify_sms') THEN
        ALTER TABLE "coaches" ADD COLUMN "notify_sms" BOOLEAN NOT NULL DEFAULT true;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaches' AND column_name = 'notify_email') THEN
        ALTER TABLE "coaches" ADD COLUMN "notify_email" BOOLEAN NOT NULL DEFAULT true;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS "system_settings" (
      "id" SERIAL PRIMARY KEY,
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_key_key" ON "system_settings"("key");
  `;

  try {
    await prisma.$executeRawUnsafe(sql);
    const coaches = await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = 'coaches' AND column_name IN ('notify_sms','notify_email') ORDER BY column_name`);
    const settings = await prisma.$queryRawUnsafe(`SELECT to_regclass('public.system_settings') AS ok, to_regclass('public.system_settings_key_key') AS idx`);
    return res.status(200).json({ success: true, columns: coaches, settings });
  } catch (error) {
    console.error("Migration apply failed:", error);
    return res.status(500).json({ error: String((error && error.message) || error) });
  }
}