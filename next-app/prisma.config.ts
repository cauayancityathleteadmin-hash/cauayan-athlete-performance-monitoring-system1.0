import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations must run against the DIRECT (non-pooled) connection.
    // PgBouncer/PgPooler transaction mode does not support DDL/advisory locks.
    url: env("DIRECT_URL"),
  },
});
