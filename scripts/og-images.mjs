#!/usr/bin/env node
// Regenerates the Open Graph images from the real pages, in dark mode, at 1200x630.
//
// Unlike every other script in this directory this one is not a CI guard: it needs a browser and a
// network, so it is run by hand and its output is committed. See CLAUDE.md.

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/** MapLibre gives a page no event for "the tiles have settled", so they get a fixed grace period. */
const MAP_SETTLE_MS = 2_000;

async function settleMap(page, selector) {
  await page.waitForSelector(selector, { state: "visible" });
  await page.waitForTimeout(MAP_SETTLE_MS);
}

export const TARGETS = [
  {
    name: "docs",
    publish: "docs/site/public/og-image.png",
    build: ["pnpm", "docs:build"],
    serve: ["pnpm", "docs:preview"],
    prepare: async (page) => {
      await settleMap(page, ".map-demo .maplibregl-canvas");
    },
  },
  { name: "benchmark-table", publish: "examples/benchmark/public/og-image.png" },
  { name: "benchmark-map-table", publish: "examples/benchmark/public/og-image.png" },
];

/**
 * Turns argv into the two choices this script offers.
 *
 * `--write` is only accepted beside `--only` because the two benchmark targets publish to the same
 * path: without it, a run of every target would leave the second one on disk and no record of which.
 */
export function parseArgs(argv, names) {
  let only = null;
  let write = false;
  for (const arg of argv) {
    if (arg === "--write") {
      write = true;
    } else if (arg.startsWith("--only=")) {
      only = arg.slice("--only=".length);
      if (!names.includes(only)) {
        throw new Error(`unknown target: ${only}`);
      }
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (write && only === null) {
    throw new Error("--write requires --only");
  }
  return { only, write };
}

export function resolveOutputPath(target, write) {
  return write ? target.publish : `tmp/og/${target.name}.png`;
}

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
// eslint-disable-next-line no-control-regex -- matches the ESC byte that starts an ANSI escape code.
const ANSI = /\[[0-9;]*m/g;
const LOCAL_URL = /(http:\/\/localhost:\d+\S*)/;
const SERVER_TIMEOUT_MS = 120_000;

/** Runs a build to completion, inheriting its output so a failure is readable. */
function build(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd: REPO_ROOT, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command.join(" ")} exited ${code}`))));
  });
}

/**
 * Starts a preview server and resolves once it announces its URL.
 *
 * The URL is read from the server's own output rather than assumed, because both preview servers
 * fall back to another port when theirs is taken, and both print the base path as part of it.
 * The child gets its own process group so stopping it takes the whole `pnpm` -> `vite` chain down.
 */
function startServer(command) {
  const child = spawn(command[0], command.slice(1), {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stop = () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error(`${command.join(" ")} printed no URL within ${SERVER_TIMEOUT_MS}ms`));
    }, SERVER_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      const match = LOCAL_URL.exec(chunk.replace(ANSI, ""));
      if (match) {
        clearTimeout(timer);
        resolve({ url: match[1], stop });
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/** Captures one target. The browser package is imported here so `node --test` never loads it. */
export async function capture(target, outPath) {
  const { chromium } = await import("playwright");
  if (target.build) {
    await build(target.build);
  }
  const server = await startServer(target.serve);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      colorScheme: "dark",
      viewport: { width: OG_WIDTH, height: OG_HEIGHT },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(server.url, { waitUntil: "networkidle" });
    await target.prepare(page);
    const absolute = join(REPO_ROOT, outPath);
    await mkdir(dirname(absolute), { recursive: true });
    await page.screenshot({ path: absolute });
    console.log(`${target.name} -> ${outPath}`);
  } finally {
    await browser.close();
    server.stop();
  }
}

export { OG_WIDTH, OG_HEIGHT };

async function main() {
  const { only, write } = parseArgs(
    process.argv.slice(2),
    TARGETS.map((target) => target.name),
  );
  const selected = only === null ? TARGETS : TARGETS.filter((target) => target.name === only);
  for (const target of selected) {
    await capture(target, resolveOutputPath(target, write));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
