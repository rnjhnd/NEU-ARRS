import { defineConfig } from "prisma/config";

// Deliberately do not load .env/.env.local. Migration checks must never inherit
// the application's live datasource through its normal Prisma configuration.
export default defineConfig({
  schema: "../prisma/schema.prisma",
  migrations: { path: "../prisma/migrations" },
  datasource: {
    url: process.env.MIGRATION_TEST_DATABASE_URL
      ?? "postgresql://postgres:postgres@127.0.0.1:1/neu_arrs_migration_test?sslmode=disable",
  },
});
