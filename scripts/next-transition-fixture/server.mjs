import { cp, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Build an isolated real Next app; production source/config/data are never served. */
export async function startNextTransitionFixture() {
  const source = fileURLToPath(new URL("./", import.meta.url));
  const root = resolve(source, "../..");
  await mkdir(resolve(root, "scratch"), { recursive: true });
  const directory = await mkdtemp(resolve(root, "scratch/next-transition-"));
  for (const entry of await readdir(source)) await cp(resolve(source, entry), resolve(directory, entry), { recursive: true, force: false, errorOnExist: true });
  const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };
  for (const key of Object.keys(env)) if (/^(CLERK_|NEXT_PUBLIC_CLERK_|PAYMONGO_|RESEND_|UPSTASH_|VERCEL_|DATABASE_URL$|MIGRATION_|CRON_SECRET$)/.test(key)) delete env[key];
  let output = "", child;
  const run = args => {
    const task = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), ...args], { cwd: directory, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    task.stdout.on("data", data => output += data);
    task.stderr.on("data", data => output += data);
    return task;
  };
  try {
    const build = run(["build", "--webpack"]);
    const code = await new Promise((done, reject) => {
      const timer = setTimeout(() => { build.kill(); reject(Error("Transition fixture build exceeded 60 seconds")); }, 60_000);
      build.once("error", error => { clearTimeout(timer); reject(error); });
      build.once("exit", status => { clearTimeout(timer); done(status); });
    });
    if (code !== 0) throw Error("Transition fixture build failed");
    if (/Environments?:.*\.env/.test(output)) throw Error("Fixture unexpectedly loaded an environment file");
    const probe = createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const port = probe.address().port;
    await new Promise(done => probe.close(done));
    child = run(["start", "--hostname", "127.0.0.1", "--port", String(port)]);
    const url = "http://127.0.0.1:" + port;
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (child.exitCode !== null) throw Error("Fixture server exited");
      let response;
      try {
        response = await fetch(url + "/sign-in", { signal: AbortSignal.timeout(1500) });
      } catch { /* Retry only startup of this owned loopback process. */ }
      if (response?.ok) { ready = true; break; }
      if (response?.status >= 500) throw Error("Fixture returned an application error");
      await new Promise(done => setTimeout(done, 100));
    }
    if (!ready) throw Error("Transition fixture did not become ready");
    return { url, async close() {
      if (child.exitCode === null) { const closed = once(child, "exit"); child.kill(); await closed; }
    } };
  } catch (error) {
    child?.kill();
    await writeFile(resolve(directory, "fixture-build.log"), output, "utf8");
    throw new Error(String(error) + "\n" + output.slice(-9000));
  }
}
