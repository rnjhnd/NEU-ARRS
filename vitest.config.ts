import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/__tests__/**/*.test.ts"],
    maxWorkers: 2,
    allowOnly: !process.env.CI,
    // Unit tests mock services; database integration tests own disposable DBs.
    setupFiles: ["./vitest.setup.ts"],
  },
});
