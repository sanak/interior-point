import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { REPO_ROOT, readPin, sha256 } from "../jts-pin.mjs";
import { checkDrift, fetchAllUpstream, fetchUpstreamFile, rawUrl, unifiedDiff } from "../jts-upstream.mjs";

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function tempRoot() {
  const dir = mkdtempSync(join(tmpdir(), "jts-sync-"));
  temps.push(dir);
  return dir;
}

/** Returns a fetch stub serving `bodies` keyed by upstreamPath; anything else 404s. */
function stubFetch(bodies) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    for (const [path, body] of Object.entries(bodies)) {
      if (url.endsWith(`/${path}`)) return new Response(body, { status: 200 });
    }
    return new Response("Not Found", { status: 404 });
  };
  impl.calls = calls;
  return impl;
}

describe("rawUrl", () => {
  it("builds a raw.githubusercontent.com URL from pin.upstream", () => {
    const pin = { upstream: "https://github.com/locationtech/jts" };
    assert.equal(
      rawUrl(pin, "modules/core/src/main/java/org/locationtech/jts/algorithm/Centroid.java", "1.20.0"),
      "https://raw.githubusercontent.com/locationtech/jts/1.20.0/modules/core/src/main/java/org/locationtech/jts/algorithm/Centroid.java",
    );
  });

  it("tolerates a trailing slash or .git suffix", () => {
    assert.match(
      rawUrl({ upstream: "https://github.com/locationtech/jts.git" }, "a.txt", "main"),
      /jts\/main\/a\.txt$/,
    );
    assert.match(rawUrl({ upstream: "https://github.com/locationtech/jts/" }, "a.txt", "main"), /jts\/main\/a\.txt$/);
  });
});

describe("fetchUpstreamFile", () => {
  const pin = { upstream: "https://github.com/locationtech/jts" };

  it("returns the body as a Buffer", async () => {
    const bytes = await fetchUpstreamFile(pin, "a.txt", "main", stubFetch({ "a.txt": "hello" }));
    assert.ok(Buffer.isBuffer(bytes));
    assert.equal(bytes.toString("utf8"), "hello");
  });

  it("throws on a non-2xx response, naming the status and the path", async () => {
    await assert.rejects(() => fetchUpstreamFile(pin, "missing.txt", "main", stubFetch({})), /404.*missing\.txt/s);
  });
});

describe("fetchAllUpstream", () => {
  it("fetches every file in the pin, keyed by upstreamPath", async () => {
    const pin = {
      upstream: "https://github.com/locationtech/jts",
      files: [{ upstreamPath: "a.txt" }, { upstreamPath: "b.txt" }],
    };
    const result = await fetchAllUpstream(pin, "main", stubFetch({ "a.txt": "A", "b.txt": "B" }));
    assert.deepEqual([...result.keys()].sort(), ["a.txt", "b.txt"]);
    assert.equal(result.get("b.txt").toString("utf8"), "B");
  });
});

describe("unifiedDiff", () => {
  it("produces a git-style diff between the local file and the upstream bytes", () => {
    const root = tempRoot();
    mkdirSync(join(root, "upstream/jts/algorithm"), { recursive: true });
    writeFileSync(join(root, "upstream/jts/algorithm/A.java"), "one\ntwo\nthree\n");
    const diff = unifiedDiff("upstream/jts/algorithm/A.java", Buffer.from("one\nTWO\nthree\n"), root);
    assert.match(diff, /^-two$/m);
    assert.match(diff, /^\+TWO$/m);
  });

  it("returns an empty string when the contents match", () => {
    const root = tempRoot();
    mkdirSync(join(root, "upstream/jts/algorithm"), { recursive: true });
    writeFileSync(join(root, "upstream/jts/algorithm/A.java"), "same\n");
    assert.equal(unifiedDiff("upstream/jts/algorithm/A.java", Buffer.from("same\n"), root), "");
  });
});

describe("checkDrift", () => {
  it("reports no drift when upstream matches the vendored bytes", async () => {
    const pin = readPin();
    const bodies = {};
    for (const file of pin.files) {
      bodies[file.upstreamPath] = (await import("node:fs")).readFileSync(join(REPO_ROOT, file.localPath));
    }
    const result = await checkDrift(REPO_ROOT, pin.commit, stubFetch(bodies));
    assert.deepEqual(result.tampered, []);
    assert.deepEqual(result.drifted, []);
  });

  it("reports a drifted file with both hashes", async () => {
    const root = tempRoot();
    mkdirSync(join(root, "upstream/jts/algorithm"), { recursive: true });
    writeFileSync(join(root, "upstream/jts/algorithm/A.java"), "local\n");
    const pin = {
      upstream: "https://github.com/locationtech/jts",
      files: [{ upstreamPath: "u/A.java", localPath: "upstream/jts/algorithm/A.java", sha256: sha256("local\n") }],
    };
    writeFileSync(join(root, "upstream/jts/pin.json"), `${JSON.stringify(pin, null, 2)}\n`);
    const result = await checkDrift(root, "main", stubFetch({ "u/A.java": "upstream\n" }));
    assert.deepEqual(result.tampered, []);
    assert.equal(result.drifted.length, 1);
    assert.equal(result.drifted[0].localSha, sha256("local\n"));
    assert.equal(result.drifted[0].upstreamSha, sha256("upstream\n"));
  });

  it("reports a locally edited vendored file as tampered", async () => {
    const root = tempRoot();
    mkdirSync(join(root, "upstream/jts/algorithm"), { recursive: true });
    writeFileSync(join(root, "upstream/jts/algorithm/A.java"), "edited\n");
    const pin = {
      upstream: "https://github.com/locationtech/jts",
      files: [{ upstreamPath: "u/A.java", localPath: "upstream/jts/algorithm/A.java", sha256: sha256("original\n") }],
    };
    writeFileSync(join(root, "upstream/jts/pin.json"), `${JSON.stringify(pin, null, 2)}\n`);
    const result = await checkDrift(root, "main", stubFetch({ "u/A.java": "edited\n" }));
    assert.equal(result.tampered.length, 1);
    assert.equal(result.tampered[0].status, "modified");
  });
});
