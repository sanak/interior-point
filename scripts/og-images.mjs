#!/usr/bin/env node
// Regenerates the Open Graph images from the real pages, in dark mode, at 1200x630.
//
// Unlike every other script in this directory this one is not a CI guard: it needs a browser and a
// network, so it is run by hand and its output is committed. See CLAUDE.md.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

const WASM_OUTPUTS = ["rs/wasm/pkg-web", "examples/benchmark/geo-wasm/pkg-web"];

/**
 * The benchmark build resolves two wasm-pack outputs through Vite aliases, and a missing one fails
 * deep inside the bundler. wasm-pack is not run from here because the version this repository
 * builds with is pinned in CI, not on the machine holding the checkout.
 */
function requireWasmOutputs() {
  const missing = WASM_OUTPUTS.filter((path) => !existsSync(join(REPO_ROOT, path)));
  if (missing.length > 0) {
    throw new Error(`missing ${missing.join(", ")}; run \`pnpm examples:wasm\` first`);
  }
}

const RUN_ALL = "#run-all";
/** The first sweep warms every adapter up; the second is what the image shows. */
const RUN_PASSES = 2;
const RUN_TIMEOUT_MS = 300_000;

/**
 * Presses Run all and waits for the sweep to settle, once per pass.
 *
 * The page disables the button for the length of a sweep and enables it again when the sweep ends,
 * so both edges are observable from outside. Waiting for the disabled edge first is what keeps the
 * frame between the click and the first row from reading as a finished sweep.
 */
async function runAllPasses(page) {
  await page.waitForSelector(`${RUN_ALL}:not([disabled])`, { timeout: RUN_TIMEOUT_MS });
  for (let pass = 0; pass < RUN_PASSES; pass += 1) {
    await page.click(RUN_ALL);
    await page.waitForSelector(`${RUN_ALL}[disabled]`);
    await page.waitForSelector(`${RUN_ALL}:not([disabled])`, { timeout: RUN_TIMEOUT_MS });
  }
}

const BENCHMARK_BUILD = ["pnpm", "examples:build"];
const BENCHMARK_SERVE = ["pnpm", "--filter", "@interior-point/benchmark", "run", "preview"];

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
  {
    name: "benchmark-table",
    publish: "examples/benchmark/public/og-image.png",
    requires: requireWasmOutputs,
    build: BENCHMARK_BUILD,
    serve: BENCHMARK_SERVE,
    prepare: async (page) => {
      await settleMap(page, "#map .maplibregl-canvas");
      await runAllPasses(page);
      await page.addStyleTag({
        content: `
          .page-header, .map, .controls, .page-footer { display: none; }
          .page { min-height: 100vh; justify-content: center; padding: 1rem; max-width: 1160px; }
        `,
      });
    },
  },
  {
    name: "benchmark-map-table",
    publish: "examples/benchmark/public/og-image.png",
    requires: requireWasmOutputs,
    build: BENCHMARK_BUILD,
    serve: BENCHMARK_SERVE,
    prepare: async (page) => {
      await settleMap(page, "#map .maplibregl-canvas");
      await runAllPasses(page);
      await page.addStyleTag({
        content: `
          .lede, .controls, .page-footer { display: none; }
          .page { padding: 0.75rem 1rem; gap: 0.75rem; max-width: 1160px; }
          .map { height: 185px; min-height: 0; }
        `,
      });
      // MapLibre resizes itself from the window's resize event, which shrinking the container alone
      // does not raise; without this the canvas keeps the height it was built at.
      // eslint-disable-next-line no-undef -- runs in the browser page via page.evaluate, not Node.
      await page.evaluate(() => window.dispatchEvent(new Event("resize")));
      await page.waitForTimeout(MAP_SETTLE_MS);
    },
  },
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
  if (target.requires) {
    target.requires();
  }
  if (target.build) {
    await build(target.build);
  }
  const server = await startServer(target.serve);
  try {
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
      // A close failure must not stop `server.stop()` below from running.
      await browser.close().catch(() => {});
    }
  } finally {
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
