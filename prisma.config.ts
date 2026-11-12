import { defineConfig } from "prisma/config";

// The default CLI config is generation/validation only: installs must not read
// application secrets or implicitly select an application database. Operator
// commands use prisma.migration.config.ts with explicit MIGRATION_DATABASE_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
