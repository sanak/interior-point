import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { main } from "../jts-sync.mjs";

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
  it("exits 1 today because all 52 members are unported", async () => {
    const { code, out } = await run(["anchors"]);
    assert.equal(code, 1);
    assert.match(out, /52 method declarations/);
    assert.match(out, /52 unported/);
    assert.match(out, /InteriorPointArea#getInteriorPoint\(Geometry\)/);
  });

  it("exits 2 when given an argument, since it takes none", async () => {
    const { code, err } = await run(["anchors", "--ref", "main"]);
    assert.equal(code, 2);
    assert.match(err, /anchors takes no arguments/);
  });
});
