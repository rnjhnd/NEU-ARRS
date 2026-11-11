import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { smokeCleanup } from "./smoke-cleanup.mjs";

if (process.argv.slice(2).some(argument => argument !== "--smoke-cron")) throw new Error("Unknown build-check option.");

const root = fileURLToPath(new URL("../", import.meta.url));
const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 10 });

// A build may execute page data loaders (including document-config seeding).
// Always use this owned, in-memory database, never any supplied datasource URL.
try {
  const migrations = resolve(root, "prisma/migrations");
  const entries = await readdir(migrations, { withFileTypes: true });
  for (const entry of entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    await db.exec(await readFile(resolve(migrations, entry.name, "migration.sql"), "utf8"));
  }
  await server.start();
  console.log("Checking production build with an owned disposable database and synthetic provider keys.");
  console.log("The resulting .next output is for verification only; run a configured build before deployment.");
  let buildEnv;
  const code = await new Promise((resolveCode, reject) => {
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
      cwd: root,
      windowsHide: true,
      stdio: "inherit",
      // Next documents process.env taking precedence over local dotenv files.
      // Override every application/provider setting used by this repository.
      env: buildEnv = {
        ...process.env,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        DATABASE_URL: `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`,
        MIGRATION_DATABASE_URL: "",
        MIGRATION_TEST_DATABASE_URL: "",
        CLERK_SECRET_KEY: "sk_test_build_verification_only",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("clerk.example.invalid$").toString("base64")}`,
        CLERK_API_URL: "https://api.clerk.example.invalid",
        CLERK_JWT_KEY: "",
        CLERK_WEBHOOK_SIGNING_SECRET: "",
        NEXT_PUBLIC_CLERK_PROXY_URL: "",
        NEXT_PUBLIC_CLERK_DOMAIN: "",
        NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
        NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
        NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/dashboard",
        NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: "/dashboard",
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
        PAYMONGO_SECRET_KEY: "sk_test_build_verification_only",
        PAYMONGO_WEBHOOK_SECRET: "build_verification_only",
        RESEND_API_KEY: "re_build_verification_only",
        RESEND_FROM_EMAIL: "verification@example.invalid",
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
        CRON_SECRET: "build_verification_only",
      },
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Production build exceeded ten minutes."));
    }, 600_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", status => { clearTimeout(timer); resolveCode(status ?? 1); });
  });
  if (code !== 0) throw new Error(`Production build failed with exit ${code}.`);
  if (process.argv.includes("--smoke-cron")) await smokeCleanup({ root, env: buildEnv, db });
} finally {
  await server.stop();
  await db.close();
}
