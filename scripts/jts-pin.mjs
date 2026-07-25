import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to the repository root — this file lives one level below it. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const PIN_PATH = "upstream/jts/pin.json";

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function readPin(root = REPO_ROOT) {
  return JSON.parse(readFileSync(join(root, PIN_PATH), "utf8"));
}

/** Two-space indentation with a trailing newline, so `prettier --check` stays green. */
export function writePin(pin, root = REPO_ROOT) {
  writeFileSync(join(root, PIN_PATH), `${JSON.stringify(pin, null, 2)}\n`);
}

/**
 * Vendored Java sources, keyed by basename. Anchors name a bare `File.java`,
 * so this is how an anchor target resolves to a path on disk — and it means
 * the scanned set is exactly the pinned set.
 */
export function javaFiles(pin) {
  const map = new Map();
  for (const file of pin.files) {
    if (!file.localPath.endsWith(".java")) continue;
    map.set(basename(file.localPath), file.localPath);
  }
  return map;
}

export function verifyVendored(pin, root = REPO_ROOT) {
  return pin.files.map((file) => {
    let actual;
    try {
      actual = sha256(readFileSync(join(root, file.localPath)));
    } catch {
      return { localPath: file.localPath, expected: file.sha256, actual: null, status: "missing" };
    }
    return {
      localPath: file.localPath,
      expected: file.sha256,
      actual,
      status: actual === file.sha256 ? "ok" : "modified",
    };
  });
}
