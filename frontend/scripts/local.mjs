import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, openSync, closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const root = path.resolve(frontend, "..");
const development = process.argv.includes("--dev");
const runtime = path.join(root, ".runtime");
mkdirSync(runtime, { recursive: true });
mkdirSync(path.join(root, ".tmp"), { recursive: true });
const python =
  process.env.CLEARLEDGER_PYTHON ??
  path.join(
    root,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
if (
  !existsSync(python) ||
  !existsSync(path.join(frontend, "node_modules/next")) ||
  (!development && !existsSync(path.join(frontend, ".next/BUILD_ID")))
) {
  throw new Error(
    "Install the Python and frontend dependencies and run npm run build first. See README.md.",
  );
}
const env = {
  ...process.env,
  CLEARLEDGER_API_KEY:
    process.env.CLEARLEDGER_API_KEY || randomBytes(32).toString("hex"),
  CLEARLEDGER_API_URL: "http://127.0.0.1:8000",
  CLEARLEDGER_DB:
    process.env.CLEARLEDGER_DB || path.join(runtime, "clearledger.sqlite3"),
  NEXT_TELEMETRY_DISABLED: "1",
  TEMP: path.join(root, ".tmp"),
  TMP: path.join(root, ".tmp"),
};
const children = [];
const logs = [];
let stopping = false;
function start(command, args, cwd, name) {
  const log = openSync(path.join(runtime, `${name}.log`), "a");
  logs.push(log);
  const child = spawn(command, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ["ignore", log, log],
  });
  children.push(child);
  child.on("error", () => {
    console.error(`Unable to start ${name}; see .runtime/${name}.log`);
    void stop(1);
  });
  child.on("exit", () => {
    if (!stopping) {
      console.error(`${name} stopped; see .runtime/${name}.log`);
      void stop(1);
    }
  });
  return child;
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children.reverse())
    if (child.exitCode === null && child.pid) {
      if (process.platform === "win32")
        await new Promise((resolve) => {
          const killer = spawn(
            "taskkill",
            ["/pid", String(child.pid), "/t", "/f"],
            { windowsHide: true, stdio: "ignore" },
          );
          killer.once("exit", resolve);
          killer.once("error", resolve);
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
  process.exitCode = code;
}
process.on("SIGINT", () => {
  void stop();
});
process.on("SIGTERM", () => {
  void stop();
});
async function ready(url, child) {
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    if (child.exitCode !== null) return false;
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok)
        return true;
    } catch {
      /* startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}
try {
  for (const port of [3000, 8000]) {
    const occupied = await fetch(`http://127.0.0.1:${port}`, {
      signal: AbortSignal.timeout(1000),
    }).then(
      () => true,
      () => false,
    );
    if (occupied)
      throw new Error(
        `Port ${port} is already in use. Stop that service before using this launcher.`,
      );
  }
  const backend = start(
    python,
    [
      "-m",
      "uvicorn",
      "clearledger.api:from_env",
      "--factory",
      "--host",
      "127.0.0.1",
      "--port",
      "8000",
      "--no-access-log",
    ],
    root,
    "api",
  );
  if (!(await ready("http://127.0.0.1:8000/readyz", backend)))
    throw new Error("API startup failed; see .runtime/api.log");
  const web = start(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      development ? "dev" : "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000",
    ],
    frontend,
    "dashboard",
  );
  if (!(await ready("http://127.0.0.1:3000/api/connection", web)))
    throw new Error("Dashboard startup failed; see .runtime/dashboard.log");
  console.log(
    "ClearLedger: http://127.0.0.1:3000\nBoth services are local. Press Ctrl+C to stop. Credentials are held in process memory.",
  );
} catch (error) {
  console.error(error.message);
  await stop(1);
}
