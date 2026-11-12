import { createServer, normalizePath } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import tailwind from "@tailwindcss/postcss";

/** Owns a loopback-only component fixture; never loads application env files. */
export async function startNavigationFixture() {
  return startComponentFixture("navigation-fixture");
}

export async function startComponentFixture(name) {
  if (!["navigation-fixture", "request-list-fixture", "admin-queue-fixture", "finance-fixture", "student-directory-fixture", "configuration-fixture"].includes(name)) throw new Error("Unknown component fixture.");
  const shared = normalizePath(fileURLToPath(new URL("./", import.meta.url)));
  const root = normalizePath(fileURLToPath(new URL("../" + name + "/", import.meta.url)));
  const workspace = normalizePath(resolve(root, "../.."));
  const server = await createServer({
    configFile: false, root, envDir: root, envPrefix: "NAVIGATION_FIXTURE_",
    cacheDir: workspace + "/node_modules/.cache/navigation-checks",
    server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false, fs: { allow: [workspace] } },
    resolve: {
      alias: [
        ...(name === "configuration-fixture" ? [
          { find: "@/app/actions/configuration.actions", replacement: root + "actions.ts" },
          { find: "@/app/actions/admin.actions", replacement: root + "actions.ts" },
        ] : []),
        ...(name === "request-list-fixture" ? [{ find: "@/app/actions/request.actions", replacement: root + "request-actions.ts" }] : []),
        ...(name === "admin-queue-fixture" ? [
          { find: "@/app/actions/admin.actions", replacement: root + "actions.ts" },
          { find: "@/app/actions/payment-reconciliation.actions", replacement: root + "actions.ts" },
        ] : []),
        { find: "@clerk/nextjs", replacement: shared + "clerk.tsx" },
        { find: "next/navigation", replacement: shared + "navigation.ts" },
        { find: "next/link", replacement: shared + "link.tsx" },
        { find: "@", replacement: workspace + "/src" },
      ],
      dedupe: ["react", "react-dom"],
    },
    esbuild: { jsx: "automatic" },
    css: { postcss: { plugins: [tailwind()] } },
  });
  try {
    await server.listen();
    const address = server.httpServer.address();
    if (!address || typeof address === "string") throw new Error("Fixture did not bind an owned TCP port.");
    return { url: "http://127.0.0.1:" + address.port, close: () => server.close() };
  } catch (error) { await server.close(); throw error; }
}
