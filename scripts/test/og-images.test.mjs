import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TARGETS, parseArgs, resolveOutputPath } from "../og-images.mjs";

const NAMES = TARGETS.map((target) => target.name);

describe("TARGETS", () => {
  it("declares the three capture targets", () => {
    assert.deepEqual(NAMES, ["docs", "benchmark-table", "benchmark-map-table"]);
  });

  it("gives every target a publish path", () => {
    for (const target of TARGETS) {
      assert.ok(target.publish.endsWith("og-image.png"), `${target.name} publishes an og-image.png`);
    }
  });
});

describe("parseArgs", () => {
  it("defaults to every target and the scratch directory", () => {
    assert.deepEqual(parseArgs([], NAMES), { only: null, write: false });
  });

  it("reads --only", () => {
    assert.deepEqual(parseArgs(["--only=docs"], NAMES), { only: "docs", write: false });
  });

  it("reads --write beside --only", () => {
    assert.deepEqual(parseArgs(["--only=docs", "--write"], NAMES), { only: "docs", write: true });
  });

  it("rejects --write without --only", () => {
    assert.throws(() => parseArgs(["--write"], NAMES), /--write requires --only/);
  });

  it("rejects an unknown target", () => {
    assert.throws(() => parseArgs(["--only=nope"], NAMES), /unknown target: nope/);
  });

  it("rejects an unknown argument", () => {
    assert.throws(() => parseArgs(["--all"], NAMES), /unknown argument: --all/);
  });
});

describe("resolveOutputPath", () => {
  const target = { name: "docs", publish: "docs/site/public/og-image.png" };

  it("writes to the scratch directory by default", () => {
    assert.equal(resolveOutputPath(target, false), "tmp/og/docs.png");
  });

  it("writes to the publish path under --write", () => {
    assert.equal(resolveOutputPath(target, true), "docs/site/public/og-image.png");
  });
});
