/**
 * In-process tests for the interior-point CLI: flag parsing, io, and run().
 *
 * @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
 *   prior art for the surface under test; the cases are original.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HELP_TEXT, parseCliArgs, UsageError } from "../../src/cli/args.ts";
import { InputError, readInput } from "../../src/cli/io.ts";

const readStdinUnused = (): string => {
  throw new Error("stdin must not be read");
};

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

describe("io input", () => {
  it("parses a WKT literal to kind geometry with one record", () => {
    const input = readInput("POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))", readStdinUnused);
    assert.equal(input.kind, "geometry");
    assert.equal(input.records.length, 1);
    assert.equal(input.records[0].geometry?.type, "Polygon");
    assert.equal(input.records[0].meta, null);
  });

  it("parses a GeoJSON Geometry literal to kind geometry", () => {
    const input = readInput('{"type":"Point","coordinates":[1,2]}', readStdinUnused);
    assert.equal(input.kind, "geometry");
    assert.deepEqual(input.records[0].geometry, { type: "Point", coordinates: [1, 2] });
  });

  it("parses a Feature, keeping properties and id, dropping bbox", () => {
    const literal = JSON.stringify({
      type: "Feature",
      id: 7,
      bbox: [0, 0, 10, 10],
      properties: { name: "box" },
      geometry: { type: "Point", coordinates: [1, 2] },
    });
    const input = readInput(literal, readStdinUnused);
    assert.equal(input.kind, "feature");
    assert.deepEqual(input.records[0].meta, { id: 7, properties: { name: "box" } });
    assert.deepEqual(input.records[0].geometry, { type: "Point", coordinates: [1, 2] });
  });

  it("parses a FeatureCollection in order, keeping a null geometry", () => {
    const literal = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { n: 1 }, geometry: { type: "Point", coordinates: [1, 2] } },
        { type: "Feature", properties: { n: 2 }, geometry: null },
      ],
    });
    const input = readInput(literal, readStdinUnused);
    assert.equal(input.kind, "featureCollection");
    assert.deepEqual(
      input.records.map((r) => r.meta),
      [{ properties: { n: 1 } }, { properties: { n: 2 } }],
    );
    assert.equal(input.records[1].geometry, null);
  });

  it("reads stdin when --input is absent", () => {
    const input = readInput(undefined, () => "POINT (1 2)");
    assert.deepEqual(input.records[0].geometry, { type: "Point", coordinates: [1, 2] });
  });

  it("reads an existing file and classifies its contents by the same rule", () => {
    const dir = mkdtempSync(join(tmpdir(), "interior-point-cli-"));
    const path = join(dir, "input.geojson");
    writeFileSync(path, '{"type":"Point","coordinates":[1,2]}');
    const input = readInput(path, readStdinUnused);
    assert.equal(input.kind, "geometry");
    assert.deepEqual(input.records[0].geometry, { type: "Point", coordinates: [1, 2] });
  });

  it("folds newlines inside a WKT file before parsing", () => {
    const dir = mkdtempSync(join(tmpdir(), "interior-point-cli-"));
    const path = join(dir, "input.wkt");
    writeFileSync(path, "POINT\n  (1 2)\n");
    const input = readInput(path, readStdinUnused);
    assert.deepEqual(input.records[0].geometry, { type: "Point", coordinates: [1, 2] });
  });

  it("throws on unparseable WKT", () => {
    assert.throws(() => readInput("NOTAGEOM (1 2)", readStdinUnused));
  });

  it("throws InputError on invalid JSON", () => {
    assert.throws(() => readInput('{"type":', readStdinUnused), InputError);
  });

  it("throws InputError on an unsupported type member", () => {
    assert.throws(() => readInput('{"type":"Circle"}', readStdinUnused), InputError);
  });
});
