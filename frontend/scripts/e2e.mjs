import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, openSync, closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const root = path.resolve(frontend, "..");
const temporary = path.join(root, ".tmp", `e2e-${Date.now()}`);
mkdirSync(temporary, { recursive: true });
const env = {
  ...process.env,
  CLEARLEDGER_API_KEY: randomBytes(32).toString("hex"),
  CLEARLEDGER_API_URL: "http://127.0.0.1:18000",
  CLEARLEDGER_DB: path.join(temporary, "ledger.sqlite3"),
  CLEARLEDGER_TEST_URL: "http://127.0.0.1:13000",
  NEXT_TELEMETRY_DISABLED: "1",
  PLAYWRIGHT_BROWSERS_PATH: path.join(root, ".cache", "ms-playwright"),
  TEMP: path.join(root, ".tmp"),
  TMP: path.join(root, ".tmp"),
};
const python =
  process.env.CLEARLEDGER_PYTHON ??
  path.join(
    root,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
const processes = [];
const logs = [];
function launch(command, args, cwd, name) {
  const log = openSync(path.join(temporary, `${name}.log`), "w");
  logs.push(log);
  const child = spawn(command, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ["ignore", log, log],
  });
  processes.push(child);
  return child;
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`Server exited; inspect ${temporary}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Startup timed out; inspect ${temporary}`);
}
async function cleanup() {
  for (const child of processes.reverse()) {
    if (child.exitCode !== null) continue;
    // Only process IDs created and retained by this script are stopped.
    if (process.platform === "win32")
      await new Promise((resolve) => {
        const stop = spawn(
          "taskkill",
          ["/pid", String(child.pid), "/t", "/f"],
          { windowsHide: true, stdio: "ignore" },
        );
        stop.on("exit", resolve);
        stop.on("error", resolve);
      });
    else {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        child.once("exit", resolve);
        setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 3000).unref();
      });
    }
  }
  for (const log of logs) closeSync(log);
}
let code = 1;
try {
  // Refuse to test an unrelated process or an existing database accidentally.
  for (const url of [
    "http://127.0.0.1:18000/healthz",
    "http://127.0.0.1:13000",
  ]) {
    try {
      await fetch(url);
      throw new Error("Test ports 13000/18000 must be unused");
    } catch (error) {
      if (error.message.includes("must be unused")) throw error;
    }
  }
  const backend = launch(
    python,
    [
      "-m",
      "uvicorn",
      "clearledger.api:from_env",
      "--factory",
      "--host",
      "127.0.0.1",
      "--port",
      "18000",
      "--no-access-log",
    ],
    root,
    "api",
  );
  await ready("http://127.0.0.1:18000/healthz", backend);
  const web = launch(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "13000",
    ],
    frontend,
    "frontend",
  );
  await ready("http://127.0.0.1:13000/api/connection", web);
  const tests = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
    { cwd: frontend, env, windowsHide: true, stdio: "inherit" },
  );
  processes.push(tests);
  code = await new Promise((resolve) => {
    tests.once("exit", (value) => resolve(value ?? 1));
    tests.once("error", () => resolve(1));
  });
} catch (error) {
  console.error(error.message);
} finally {
  await cleanup();
}
process.exitCode = code;
