import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // We mock Prisma and Clerk in tests to avoid hitting real DBs/APIs
    setupFiles: ["./vitest.setup.ts"],
  },
});
