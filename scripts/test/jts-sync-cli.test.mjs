import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_REF, main } from "../jts-sync.mjs";

/** Runs the CLI in-process and captures its output. */
export async function run(argv) {
  const out = [];
  const err = [];
  const code = await main(argv, { out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("usage", () => {
  it("exits 2 and prints usage when no subcommand is given", async () => {
    const { code, err } = await run([]);
    assert.equal(code, 2);
    assert.match(err, /Usage: node scripts\/jts-sync\.mjs/);
  });

  it("exits 2 on an unknown subcommand", async () => {
    const { code, err } = await run(["frobnicate"]);
    assert.equal(code, 2);
    assert.match(err, /unknown subcommand: frobnicate/);
  });

  it("prints usage and exits 0 for --help", async () => {
    const { code, out } = await run(["--help"]);
    assert.equal(code, 0);
    assert.match(out, /Usage: node scripts\/jts-sync\.mjs/);
  });
});

describe("anchors", () => {
  // TEMPORARY: the RayCrossingCounter port added Location and RayCrossingCounter, driving all 25 of
  // JTS's AbstractPointInRingTest assertions through entry point 1. That leaves
  // 9 of the 97 in-scope members unported (PointLocation, SimplePointInAreaLocator,
  // and SimplePointInAreaLocatorTest), so the CLI still exits 1. The locator port restores
  // this to 74 in-scope, 0 unported, exit 0.
  it("exits 1 while the point-in-polygon stack is vendored but unported", async () => {
    const { code, out } = await run(["anchors"]);
    assert.equal(code, 1);
    assert.match(out, /97 method declarations/);
    assert.match(out, /9 unported/);
  });

  it("exits 2 when given an argument, since it takes none", async () => {
    const { code, err } = await run(["anchors", "--ref", "main"]);
    assert.equal(code, 2);
    assert.match(err, /anchors takes no arguments/);
  });
});

describe("check", () => {
  const okFetch = async () => new Response("", { status: 500 });

  it("exits 2 when upstream cannot be fetched", async () => {
    const out = [];
    const err = [];
    const code = await main(["check", "--ref", "main"], {
      out: (s) => out.push(s),
      err: (s) => err.push(s),
      fetchImpl: okFetch,
    });
    assert.equal(code, 2);
    assert.match(err.join("\n"), /500/);
  });

  it("exits 0 and says so when nothing has drifted", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { REPO_ROOT, readPin } = await import("../jts-pin.mjs");
    const pin = readPin();
    const fetchImpl = async (url) => {
      const file = pin.files.find((f) => url.endsWith(`/${f.upstreamPath}`));
      return new Response(readFileSync(join(REPO_ROOT, file.localPath)), { status: 200 });
    };
    const out = [];
    const code = await main(["check", "--ref", pin.commit], { out: (s) => out.push(s), err: () => {}, fetchImpl });
    assert.equal(code, 0);
    assert.match(out.join("\n"), /no drift/);
  });

  it("exits 2 on an unknown option", async () => {
    const { code, err } = await run(["check", "--bogus"]);
    assert.equal(code, 2);
    assert.match(err, /jts-sync: /);
  });

  // locationtech/jts has no `main` branch, so defaulting to it would make every
  // bare `check` — and the weekly workflow — exit 2 instead of reporting drift.
  it("defaults --ref to master, upstream's actual default branch", async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      return new Response("", { status: 200 });
    };
    await main(["check"], { out: () => {}, err: () => {}, fetchImpl });
    assert.equal(DEFAULT_REF, "master");
    assert.ok(urls.length > 0);
    for (const url of urls) assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/locationtech\/jts\/master\//);
  });
});

describe("pull", () => {
  it("exits 2 when --ref is missing", async () => {
    const { code, err } = await run(["pull"]);
    assert.equal(code, 2);
    assert.match(err, /--ref is required/);
  });

  it("overwrites vendored files and rewrites pin.json", async () => {
    const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { sha256 } = await import("../jts-pin.mjs");
    const { pullUpstream } = await import("../jts-sync.mjs");

    const root = mkdtempSync(join(tmpdir(), "jts-sync-"));
    try {
      mkdirSync(join(root, "upstream/jts/algorithm"), { recursive: true });
      writeFileSync(join(root, "upstream/jts/algorithm/A.java"), "old\n");
      const pin = {
        upstream: "https://github.com/locationtech/jts",
        commit: "0000000000000000000000000000000000000000",
        nearestTag: "1.19.0",
        syncedAt: "2020-01-01",
        files: [{ upstreamPath: "u/A.java", localPath: "upstream/jts/algorithm/A.java", sha256: sha256("old\n") }],
        anchorIgnore: [],
      };
      writeFileSync(join(root, "upstream/jts/pin.json"), `${JSON.stringify(pin, null, 2)}\n`);

      const fetchImpl = async () => new Response("new\n", { status: 200 });
      const result = await pullUpstream(root, "1.20.0", { fetchImpl, today: "2026-07-26" });

      assert.deepEqual(result.written, ["upstream/jts/algorithm/A.java"]);
      assert.equal(readFileSync(join(root, "upstream/jts/algorithm/A.java"), "utf8"), "new\n");
      const updated = JSON.parse(readFileSync(join(root, "upstream/jts/pin.json"), "utf8"));
      assert.equal(updated.files[0].sha256, sha256("new\n"));
      assert.equal(updated.syncedAt, "2026-07-26");
      assert.equal(updated.nearestTag, "1.20.0");
      assert.equal(updated.commit, "1.20.0");
      assert.deepEqual(updated.anchorIgnore, []);
      assert.ok(readFileSync(join(root, "upstream/jts/pin.json"), "utf8").endsWith("}\n"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sets commit and leaves nearestTag alone when the ref is a sha", async () => {
    const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { sha256 } = await import("../jts-pin.mjs");
    const { pullUpstream } = await import("../jts-sync.mjs");

    const root = mkdtempSync(join(tmpdir(), "jts-sync-"));
    try {
      mkdirSync(join(root, "upstream/jts/algorithm"), { recursive: true });
      writeFileSync(join(root, "upstream/jts/algorithm/A.java"), "old\n");
      const sha = "a".repeat(40);
      const pin = {
        upstream: "https://github.com/locationtech/jts",
        commit: "0".repeat(40),
        nearestTag: "1.19.0",
        syncedAt: "2020-01-01",
        files: [{ upstreamPath: "u/A.java", localPath: "upstream/jts/algorithm/A.java", sha256: sha256("old\n") }],
        anchorIgnore: [],
      };
      writeFileSync(join(root, "upstream/jts/pin.json"), `${JSON.stringify(pin, null, 2)}\n`);
      await pullUpstream(root, sha, {
        fetchImpl: async () => new Response("new\n", { status: 200 }),
        today: "2026-07-26",
      });
      const updated = JSON.parse(readFileSync(join(root, "upstream/jts/pin.json"), "utf8"));
      assert.equal(updated.commit, sha);
      assert.equal(updated.nearestTag, "1.19.0");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves the working tree untouched when a fetch fails", async () => {
    const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { sha256 } = await import("../jts-pin.mjs");
    const { pullUpstream } = await import("../jts-sync.mjs");

    const root = mkdtempSync(join(tmpdir(), "jts-sync-"));
    try {
      mkdirSync(join(root, "upstream/jts/algorithm"), { recursive: true });
      writeFileSync(join(root, "upstream/jts/algorithm/A.java"), "old\n");
      const pin = {
        upstream: "https://github.com/locationtech/jts",
        commit: "0".repeat(40),
        nearestTag: "1.19.0",
        syncedAt: "2020-01-01",
        files: [
          { upstreamPath: "u/A.java", localPath: "upstream/jts/algorithm/A.java", sha256: sha256("old\n") },
          { upstreamPath: "u/B.java", localPath: "upstream/jts/algorithm/B.java", sha256: "deadbeef" },
        ],
        anchorIgnore: [],
      };
      writeFileSync(join(root, "upstream/jts/pin.json"), `${JSON.stringify(pin, null, 2)}\n`);
      const fetchImpl = async (url) =>
        url.endsWith("A.java") ? new Response("new\n", { status: 200 }) : new Response("", { status: 404 });
      await assert.rejects(() => pullUpstream(root, "main", { fetchImpl, today: "2026-07-26" }), /404/);
      assert.equal(readFileSync(join(root, "upstream/jts/algorithm/A.java"), "utf8"), "old\n");
      assert.equal(JSON.parse(readFileSync(join(root, "upstream/jts/pin.json"), "utf8")).syncedAt, "2020-01-01");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("locate", () => {
  it("maps InteriorPointArea.java:262 to findBestMidpoint", async () => {
    const { code, out } = await run(["locate", "upstream/jts/algorithm/InteriorPointArea.java:262"]);
    assert.equal(code, 0);
    assert.match(out, /^InteriorPointArea\.InteriorPointPolygon#findBestMidpoint\(List<Double>\)$/m);
    assert.match(out, /upstream\/jts\/algorithm\/InteriorPointArea\.java:251-/);
  });

  it("accepts a bare file name", async () => {
    const { code, out } = await run(["locate", "InteriorPointArea.java:262"]);
    assert.equal(code, 0);
    assert.match(out, /findBestMidpoint/);
  });

  it("names the ported counterpart in both languages", async () => {
    // Before the retrofit this reported "no ported counterpart"; findBestMidpoint
    // now has an anchored landing site in each language, which is the whole point
    // of `locate`.
    const { out } = await run(["locate", "InteriorPointArea.java:262"]);
    assert.ok(!/no ported counterpart/.test(out), out);
    assert.match(out, /js\/src\/interiorPointArea\.ts:\d+/);
    assert.match(out, /rs\/core\/src\/interior_point_area\.rs:\d+/);
  });

  it("exits 1 when the line falls outside every member", async () => {
    const { code, err } = await run(["locate", "InteriorPointArea.java:1"]);
    assert.equal(code, 1);
    assert.match(err, /no member encloses/);
  });

  it("exits 2 on a malformed spec", async () => {
    const { code, err } = await run(["locate", "InteriorPointArea.java"]);
    assert.equal(code, 2);
    assert.match(err, /expected <path>:<line>/);
  });

  it("finds counterparts through the anchor index", async () => {
    const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
    const { readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { REPO_ROOT } = await import("../jts-pin.mjs");
    const { locateMember } = await import("../jts-sync.mjs");

    const root = mkdtempSync(join(tmpdir(), "jts-sync-"));
    try {
      mkdirSync(join(root, "upstream/jts/algorithm"), { recursive: true });
      mkdirSync(join(root, "js/src"), { recursive: true });
      mkdirSync(join(root, "rs/core/src"), { recursive: true });
      const java = "upstream/jts/algorithm/InteriorPointArea.java";
      writeFileSync(join(root, java), readFileSync(join(REPO_ROOT, java)));
      // The Java scan is driven by pin.json, so the fixture has to pin its one file.
      writeFileSync(
        join(root, "upstream/jts/pin.json"),
        JSON.stringify({ files: [{ upstreamPath: java, localPath: java, sha256: "" }], anchorIgnore: [] }, null, 2),
      );
      writeFileSync(
        join(root, "js/src/interiorPointArea.ts"),
        [
          "",
          "/** @jts InteriorPointArea.InteriorPointPolygon#findBestMidpoint(List<Double>) */",
          "function f() {}",
        ].join("\n"),
      );
      writeFileSync(
        join(root, "rs/core/src/interior_point_area.rs"),
        ["/// @jts InteriorPointArea.InteriorPointPolygon#findBestMidpoint(List<Double>)", "fn f() {}"].join("\n"),
      );
      const found = locateMember(root, "InteriorPointArea.java:262");
      assert.deepEqual(found.counterparts, [
        { path: "js/src/interiorPointArea.ts", line: 2 },
        { path: "rs/core/src/interior_point_area.rs", line: 1 },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("scaffold", () => {
  it("exits 2 without --lang", async () => {
    const { code, err } = await run(["scaffold"]);
    assert.equal(code, 2);
    assert.match(err, /--lang must be ts or rs/);
  });

  it("exits 2 on an unsupported language", async () => {
    const { code, err } = await run(["scaffold", "--lang", "java"]);
    assert.equal(code, 2);
    assert.match(err, /--lang must be ts or rs/);
  });

  it("emits TypeScript for one file", async () => {
    const { code, out } = await run(["scaffold", "--lang", "ts", "--file", "InteriorPointPoint.java"]);
    assert.equal(code, 0);
    assert.match(out, /@jts InteriorPointPoint#add\(Coordinate\)/);
    assert.match(out, /addCoordinate/);
    assert.ok(!out.includes("Centroid"));
  });

  it("emits Rust for one file", async () => {
    const { code, out } = await run(["scaffold", "--lang", "rs", "--file", "Centroid.java"]);
    assert.equal(code, 0);
    assert.match(out, /fn add_polygon/);
    assert.match(out, /todo!\(\)/);
  });

  it("exits 2 for an unknown file", async () => {
    const { code, err } = await run(["scaffold", "--lang", "ts", "--file", "Nope.java"]);
    assert.equal(code, 2);
    assert.match(err, /no members found in Nope\.java/);
  });
});
