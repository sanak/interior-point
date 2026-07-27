import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { readPin, sha256, verifyVendored } from "./jts-pin.mjs";

const RAW_HOST = "https://raw.githubusercontent.com";

export function rawUrl(pin, upstreamPath, ref) {
  const slug = pin.upstream
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  return `${RAW_HOST}/${slug}/${ref}/${upstreamPath}`;
}

export async function fetchUpstreamFile(pin, upstreamPath, ref, fetchImpl = fetch) {
  const url = rawUrl(pin, upstreamPath, ref);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${upstreamPath} at ${ref} (${url})`);
  return Buffer.from(await response.arrayBuffer());
}

export async function fetchAllUpstream(pin, ref, fetchImpl = fetch) {
  const entries = await Promise.all(
    pin.files.map(async (file) => [file.upstreamPath, await fetchUpstreamFile(pin, file.upstreamPath, ref, fetchImpl)]),
  );
  return new Map(entries);
}

/**
 * Shells out to `git diff --no-index`, which exits 1 when the files differ —
 * that is the expected path, so the exit status is ignored and stdout is returned.
 */
export function unifiedDiff(localPath, upstreamBytes, root) {
  const dir = mkdtempSync(join(tmpdir(), "jts-diff-"));
  try {
    const scratch = join(dir, basename(localPath));
    writeFileSync(scratch, upstreamBytes);
    const result = spawnSync("git", ["diff", "--no-index", "--unified=3", "--", localPath, scratch], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error) throw new Error(`git diff failed: ${result.error.message}`);
    return result.stdout ?? "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function checkDrift(root, ref, fetchImpl = fetch) {
  const pin = readPin(root);
  const tampered = verifyVendored(pin, root).filter((status) => status.status !== "ok");
  const upstream = await fetchAllUpstream(pin, ref, fetchImpl);
  const drifted = [];
  for (const file of pin.files) {
    const bytes = upstream.get(file.upstreamPath);
    const upstreamSha = sha256(bytes);
    let localSha;
    try {
      localSha = sha256(readFileSync(join(root, file.localPath)));
    } catch {
      localSha = null;
    }
    if (localSha !== upstreamSha) {
      drifted.push({ localPath: file.localPath, upstreamPath: file.upstreamPath, localSha, upstreamSha, bytes });
    }
  }
  return { tampered, drifted };
}
