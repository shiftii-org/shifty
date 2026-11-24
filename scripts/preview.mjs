/**
 * Production-preview process control.
 *
 * `npm run build` produces `.next`; this script serves it with `next start` on
 * loopback :8081 so a smoke test can verify the *built* output (dev and build
 * renders can diverge). The PID is stored in `.next/preview.pid` so `stop` and
 * `restart` always target the process this script started.
 *
 *   node scripts/preview.mjs restart
 *   node scripts/preview.mjs stop
 *   node scripts/preview.mjs status
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./with-app-env.mjs";

const PORT = Number(process.env.PREVIEW_PORT ?? 8081);
const HOST = process.env.PREVIEW_HOST ?? "127.0.0.1";
const pidFile = join(projectRoot(), ".next", "preview.pid");

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid() {
  if (!existsSync(pidFile)) return null;
  const pid = Number(readFileSync(pidFile, "utf8").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

async function stop() {
  const pid = readPid();
  if (!pid) {
    console.log("[preview] nothing running.");
    return;
  }
  if (isAlive(pid)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
    // Give Next a moment to release the port before `restart` binds again.
    for (let i = 0; i < 20 && isAlive(pid); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (isAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Best effort.
      }
    }
    console.log(`[preview] stopped pid ${pid}.`);
  }
  try {
    unlinkSync(pidFile);
  } catch {
    // Ignore a missing pidfile.
  }
}

async function health() {
  try {
    const response = await fetch(`http://${HOST}:${PORT}/`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.status;
  } catch {
    return null;
  }
}

async function start() {
  const nextBin = join(projectRoot(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", "--port", String(PORT), "--hostname", HOST], {
    cwd: projectRoot(),
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  if (child.pid) {
    mkdirSync(join(projectRoot(), ".next"), { recursive: true });
    writeFileSync(pidFile, String(child.pid));
  }
  for (let i = 0; i < 60; i += 1) {
    const status = await health();
    if (status !== null) {
      console.log(`[preview] serving on http://${HOST}:${PORT} (pid ${child.pid}, HTTP ${status}).`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.error("[preview] server did not become healthy; run `npm run build` first.");
  process.exitCode = 1;
}

const command = process.argv[2] ?? "restart";

if (command === "stop") {
  await stop();
} else if (command === "status") {
  const pid = readPid();
  console.log(pid && isAlive(pid) ? `[preview] running (pid ${pid}).` : "[preview] not running.");
} else if (command === "restart") {
  await stop();
  await start();
} else {
  console.error(`Unknown command "${command}". Use restart, stop or status.`);
  process.exitCode = 1;
}
