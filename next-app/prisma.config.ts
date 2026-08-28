import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations must run against the DIRECT (non-pooled) connection.
    // PgBouncer/PgPooler transaction mode does not support DDL/advisory locks.
    // Fall back to DATABASE_URL so a missing DIRECT_URL never fails the build.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
