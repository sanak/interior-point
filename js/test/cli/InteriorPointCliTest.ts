/**
 * In-process tests for the interior-point CLI: flag parsing, io, and run().
 *
 * @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
 *   prior art for the surface under test; the cases are original.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HELP_TEXT, parseCliArgs, UsageError } from "../../src/cli/args.ts";

describe("args", () => {
  it("defaults with no flags", () => {
    assert.deepEqual(parseCliArgs([]), {
      input: undefined,
      format: "geojson",
      output: undefined,
      quiet: false,
      help: false,
    });
  });

  it("carries a WKT literal through -i", () => {
    assert.equal(parseCliArgs(["-i", "POINT (1 2)"]).input, "POINT (1 2)");
  });

  it("carries a GeoJSON literal through --input unaltered", () => {
    const literal = '{"type":"Point","coordinates":[1,2]}';
    assert.equal(parseCliArgs(["--input", literal]).input, literal);
  });

  it("accepts -f wkt", () => {
    assert.equal(parseCliArgs(["-f", "wkt"]).format, "wkt");
  });

  it("rejects an unknown format", () => {
    assert.throws(() => parseCliArgs(["-f", "xml"]), new UsageError("Unknown format 'xml'"));
  });

  it("rejects an unknown flag", () => {
    assert.throws(() => parseCliArgs(["--bogus"]), UsageError);
  });

  it("rejects a positional argument", () => {
    assert.throws(() => parseCliArgs(["POINT (1 2)"]), UsageError);
  });

  it("sets help and quiet from short flags", () => {
    const options = parseCliArgs(["-h", "-q"]);
    assert.equal(options.help, true);
    assert.equal(options.quiet, true);
  });

  it("help text names every long flag", () => {
    for (const flag of ["--input", "--format", "--output", "--quiet", "--help"]) {
      assert.ok(HELP_TEXT.includes(flag), flag);
    }
  });
});
