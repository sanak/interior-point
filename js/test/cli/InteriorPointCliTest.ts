/**
 * In-process tests for the interior-point CLI: flag parsing, io, and run().
 *
 * @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
 *   prior art for the surface under test; the cases are original.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HELP_TEXT, parseCliArgs, UsageError } from "../../src/cli/args.ts";
import { InputError, readInput, serialize, writeOutput } from "../../src/cli/io.ts";
import { run } from "../../src/cli/run.ts";

const readStdinUnused = (): string => {
  throw new Error("stdin must not be read");
};

describe("args", () => {
  it("defaults with no flags", () => {
    assert.deepEqual(parseCliArgs([]), {
      input: undefined,
      format: "geojson",
      output: undefined,
      centroidFirst: false,
      quiet: false,
      verify: false,
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

  it("sets centroidFirst from -c and from --centroid-first", () => {
    assert.equal(parseCliArgs(["-c"]).centroidFirst, true);
    assert.equal(parseCliArgs(["--centroid-first"]).centroidFirst, true);
  });

  it("lists --centroid-first between --output and --quiet in the help text", () => {
    const lines = HELP_TEXT.split("\n");
    const output = lines.findIndex((line) => line.includes("--output"));
    const centroidFirst = lines.findIndex((line) => line.includes("--centroid-first"));
    const quiet = lines.findIndex((line) => line.includes("--quiet"));
    assert.equal(centroidFirst, output + 1);
    assert.equal(quiet, centroidFirst + 1);
    assert.equal(lines[centroidFirst], "  -c, --centroid-first      Prefer the centroid when it lies inside.");
  });

  it("sets verify from -v and from --verify", () => {
    assert.equal(parseCliArgs(["-v"]).verify, true);
    assert.equal(parseCliArgs(["--verify"]).verify, true);
  });

  it("lists --verify between --quiet and --help in the help text", () => {
    const lines = HELP_TEXT.split("\n");
    const quiet = lines.findIndex((line) => line.includes("--quiet"));
    const verify = lines.findIndex((line) => line.includes("--verify"));
    const help = lines.findIndex((line) => line.includes("--help"));
    assert.equal(verify, quiet + 1);
    assert.equal(help, verify + 1);
    assert.equal(lines[verify], "  -v, --verify              Check each result against its input geometry.");
  });

  it("help text names every long flag", () => {
    for (const flag of ["--input", "--format", "--output", "--centroid-first", "--quiet", "--verify", "--help"]) {
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

describe("io output", () => {
  it("serialises a geometry-kind point as bare GeoJSON", () => {
    const text = serialize("geometry", [{ point: [5, 5], meta: null }], "geojson");
    assert.equal(text, '{"type":"Point","coordinates":[5,5]}\n');
  });

  it("serialises a geometry-kind empty result as JSON null", () => {
    assert.equal(serialize("geometry", [{ point: null, meta: null }], "geojson"), "null\n");
  });

  it("serialises WKT one line per record, POINT EMPTY for an empty result", () => {
    const text = serialize(
      "featureCollection",
      [
        { point: [5, 5], meta: { properties: {} } },
        { point: null, meta: { properties: {} } },
      ],
      "wkt",
    );
    assert.equal(text, "POINT (5 5)\nPOINT EMPTY\n");
  });

  it("rebuilds a Feature around the point with meta intact", () => {
    const text = serialize("feature", [{ point: [5, 5], meta: { id: 7, properties: { name: "box" } } }], "geojson");
    assert.deepEqual(JSON.parse(text), {
      type: "Feature",
      id: 7,
      properties: { name: "box" },
      geometry: { type: "Point", coordinates: [5, 5] },
    });
  });

  it("rebuilds a FeatureCollection in record order, null geometries kept", () => {
    const text = serialize(
      "featureCollection",
      [
        { point: [5, 5], meta: { properties: { n: 1 } } },
        { point: null, meta: { properties: { n: 2 } } },
      ],
      "geojson",
    );
    assert.deepEqual(JSON.parse(text), {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { n: 1 }, geometry: { type: "Point", coordinates: [5, 5] } },
        { type: "Feature", properties: { n: 2 }, geometry: null },
      ],
    });
  });

  it("writeOutput writes the file instead of the sink when a path is given", () => {
    const dir = mkdtempSync(join(tmpdir(), "interior-point-cli-"));
    const path = join(dir, "out.geojson");
    let sunk = "";
    writeOutput("null\n", path, (t) => {
      sunk += t;
    });
    assert.equal(readFileSync(path, "utf-8"), "null\n");
    assert.equal(sunk, "");
  });

  it("writeOutput uses the sink when no path is given", () => {
    let sunk = "";
    writeOutput("null\n", undefined, (t) => {
      sunk += t;
    });
    assert.equal(sunk, "null\n");
  });

  it("serialises zero records in WKT mode as zero lines", () => {
    assert.equal(serialize("featureCollection", [], "wkt"), "");
  });
});

function capture() {
  let text = "";
  return {
    sink: (chunk: string) => {
      text += chunk;
    },
    get text() {
      return text;
    },
  };
}

const BOX_WKT = "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))";
// A hole larger than its shell. The scan line's widest interior interval falls
// between the two rings, outside the polygon, so the computed point [-2.5, 5]
// is the one input in this file that fails verification.
const OFF_GEOMETRY_WKT = "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0), (-5 -5, 15 -5, 15 15, -5 15, -5 -5))";
const BOX2_JSON = {
  type: "Polygon",
  coordinates: [
    [
      [20, 0],
      [30, 0],
      [30, 10],
      [20, 10],
      [20, 0],
    ],
  ],
};
const EMPTY_POLYGON_JSON = { type: "Polygon", coordinates: [] };
const MIXED_FC = JSON.stringify({
  type: "FeatureCollection",
  bbox: [0, 0, 30, 10],
  features: [
    { type: "Feature", id: "a", properties: { n: 1 }, geometry: BOX2_JSON },
    { type: "Feature", id: "b", properties: { n: 2 }, geometry: EMPTY_POLYGON_JSON },
  ],
});

describe("run", () => {
  it("WKT literal in, GeoJSON out by default", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", BOX_WKT], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, '{"type":"Point","coordinates":[5,5]}\n');
    assert.equal(err.text, "");
  });

  it("GeoJSON Geometry literal in, WKT out", () => {
    const out = capture();
    const err = capture();
    const literal = '{"type":"LineString","coordinates":[[0,0],[10,10]]}';
    assert.equal(run(["-i", literal, "-f", "wkt"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, "POINT (0 0)\n");
    assert.equal(err.text, "");
  });

  it("Feature in, Feature out — properties and id intact, bbox gone", () => {
    const out = capture();
    const err = capture();
    const literal = JSON.stringify({
      type: "Feature",
      id: 7,
      bbox: [0, 0, 10, 10],
      properties: { name: "box" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
      },
    });
    assert.equal(run(["-i", literal], out.sink, err.sink, readStdinUnused), 0);
    assert.deepEqual(JSON.parse(out.text), {
      type: "Feature",
      id: 7,
      properties: { name: "box" },
      geometry: { type: "Point", coordinates: [5, 5] },
    });
  });

  it("FeatureCollection file in, FeatureCollection out — order kept, bbox gone", () => {
    const dir = mkdtempSync(join(tmpdir(), "interior-point-cli-"));
    const path = join(dir, "fc.geojson");
    writeFileSync(path, MIXED_FC);
    const out = capture();
    const err = capture();
    assert.equal(run(["--input", path], out.sink, err.sink, readStdinUnused), 0);
    assert.deepEqual(JSON.parse(out.text), {
      type: "FeatureCollection",
      features: [
        { type: "Feature", id: "a", properties: { n: 1 }, geometry: { type: "Point", coordinates: [25, 5] } },
        { type: "Feature", id: "b", properties: { n: 2 }, geometry: null },
      ],
    });
  });

  it("FeatureCollection in with --format wkt: one line per Feature, in order", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", MIXED_FC, "-f", "wkt"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, "POINT (25 5)\nPOINT EMPTY\n");
  });

  it("reads stdin when --input is absent", () => {
    const out = capture();
    const err = capture();
    assert.equal(
      run([], out.sink, err.sink, () => "POINT (1 2)"),
      0,
    );
    assert.equal(out.text, '{"type":"Point","coordinates":[1,2]}\n');
  });

  it("--output writes the file and nothing reaches stdout", () => {
    const dir = mkdtempSync(join(tmpdir(), "interior-point-cli-"));
    const path = join(dir, "result.geojson");
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", BOX_WKT, "-o", path], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(readFileSync(path, "utf-8"), '{"type":"Point","coordinates":[5,5]}\n');
    assert.equal(out.text, "");
  });

  it("--quiet suppresses the result entirely, and beats --output", () => {
    const dir = mkdtempSync(join(tmpdir(), "interior-point-cli-"));
    const path = join(dir, "never-written.geojson");
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", BOX_WKT, "-q", "-o", path], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, "");
    assert.equal(existsSync(path), false);
  });

  it("--help prints usage to out and exits 0", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["--help"], out.sink, err.sink, readStdinUnused), 0);
    assert.ok(out.text.startsWith("Usage: interior-point"));
    assert.equal(err.text, "");
  });

  it("unparseable geometry: exit 1, stdout empty, stderr non-empty", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", "NOTAGEOM (1 2)"], out.sink, err.sink, readStdinUnused), 1);
    assert.equal(out.text, "");
    assert.ok(err.text.length > 0);
  });

  it("missing file: exit 1, stdout empty, stderr non-empty", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", "no/such/file.geojson"], out.sink, err.sink, readStdinUnused), 1);
    assert.equal(out.text, "");
    assert.ok(err.text.length > 0);
  });

  it("unknown flag: exit 1, stdout empty, usage on stderr", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["--bogus"], out.sink, err.sink, readStdinUnused), 1);
    assert.equal(out.text, "");
    assert.ok(err.text.includes("Usage: interior-point"));
  });
});

const LINE_JSON = {
  type: "LineString",
  coordinates: [
    [0, 0],
    [10, 10],
  ],
};
const BOX_JSON = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};
const OFF_GEOMETRY_JSON = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [-5, -5],
      [15, -5],
      [15, 15],
      [-5, 15],
      [-5, -5],
    ],
  ],
};

/** stdout of the same argv without --verify, which --verify must not alter. */
function stdoutWithoutVerify(argv: string[]): string {
  const out = capture();
  const err = capture();
  run(argv, out.sink, err.sink, readStdinUnused);
  return out.text;
}

describe("run --verify", () => {
  it("exit 0 with a summary on stderr, stdout unchanged", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", BOX_WKT, "--verify"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, stdoutWithoutVerify(["-i", BOX_WKT]));
    assert.equal(out.text, '{"type":"Point","coordinates":[5,5]}\n');
    assert.equal(err.text, "verify: 1 records, 1 interior\n");
  });

  it("counts a non-areal record as on-geometry", () => {
    const out = capture();
    const err = capture();
    const literal = JSON.stringify(LINE_JSON);
    assert.equal(run(["-i", literal, "-v"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(err.text, "verify: 1 records, 1 on-geometry\n");
  });

  it("exit 2 with a detail line when a record is off-geometry, stdout unchanged", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", OFF_GEOMETRY_WKT, "-v"], out.sink, err.sink, readStdinUnused), 2);
    assert.equal(out.text, stdoutWithoutVerify(["-i", OFF_GEOMETRY_WKT]));
    assert.equal(out.text, '{"type":"Point","coordinates":[-2.5,5]}\n');
    assert.equal(err.text, "verify: 1 records, 1 off-geometry\nverify: record 1: off-geometry\n");
  });

  it("lists every outcome it saw, in declaration order, and numbers records from 1", () => {
    const literal = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { n: 1 }, geometry: LINE_JSON },
        { type: "Feature", properties: { n: 2 }, geometry: BOX_JSON },
        { type: "Feature", properties: { n: 3 }, geometry: OFF_GEOMETRY_JSON },
      ],
    });
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", literal, "--verify"], out.sink, err.sink, readStdinUnused), 2);
    assert.equal(out.text, stdoutWithoutVerify(["-i", literal]));
    assert.equal(
      err.text,
      "verify: 3 records, 1 interior, 1 on-geometry, 1 off-geometry\nverify: record 3: off-geometry\n",
    );
  });

  it("does not fail on an unverifiable record", () => {
    const literal = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { n: 1 }, geometry: BOX_JSON },
        { type: "Feature", properties: { n: 2 }, geometry: null },
      ],
    });
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", literal, "--verify"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(err.text, "verify: 2 records, 1 interior, 1 unverifiable\n");
  });

  it("prints the bare summary for zero records", () => {
    const literal = '{"type":"FeatureCollection","features":[]}';
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", literal, "--verify"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, stdoutWithoutVerify(["-i", literal]));
    assert.equal(err.text, "verify: 0 records\n");
  });

  it("--quiet is completely silent on a verifying run", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", BOX_WKT, "--verify", "--quiet"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, "");
    assert.equal(err.text, "");
  });

  it("--quiet keeps the failure line and the exit code", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", OFF_GEOMETRY_WKT, "-v", "-q"], out.sink, err.sink, readStdinUnused), 2);
    assert.equal(out.text, "");
    assert.equal(err.text, "verify: record 1: off-geometry\n");
  });

  it("--format wkt does not change the verification lines", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", BOX_WKT, "-f", "wkt", "--verify"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, "POINT (5 5)\n");
    assert.equal(err.text, "verify: 1 records, 1 interior\n");
  });

  it("an unparseable geometry still exits 1 and never reaches verification", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", "NOTAGEOM (1 2)", "--verify"], out.sink, err.sink, readStdinUnused), 1);
    assert.equal(out.text, "");
    assert.ok(!err.text.includes("verify:"));
  });

  it("an unknown flag still exits 1 and never reaches verification", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["--bogus", "--verify"], out.sink, err.sink, readStdinUnused), 1);
    assert.equal(out.text, "");
    assert.ok(err.text.includes("Usage: interior-point"));
    assert.ok(!err.text.includes("verify:"));
  });

  it("--help wins over --verify", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["--help", "--verify"], out.sink, err.sink, readStdinUnused), 0);
    assert.ok(out.text.startsWith("Usage: interior-point"));
    assert.equal(err.text, "");
  });
});

const TRIANGLE_WKT = "POLYGON ((0 0, 10 0, 0 10, 0 0))";
const TRIANGLE_CENTROID_JSON = '{"type":"Point","coordinates":[3.333333333333333,3.333333333333333]}\n';
const DONUT_WKT = "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0), (3 3, 7 3, 7 7, 3 7, 3 3))";

describe("run --centroid-first", () => {
  it("returns the centroid where interiorPoint returns something else", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", TRIANGLE_WKT, "-c"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, TRIANGLE_CENTROID_JSON);
    assert.equal(err.text, "");
  });

  it("--centroid-first is the same flag as -c", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", TRIANGLE_WKT, "--centroid-first"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, TRIANGLE_CENTROID_JSON);
  });

  it("without the flag the point is the algorithm's own", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", TRIANGLE_WKT], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, '{"type":"Point","coordinates":[2.5,5]}\n');
  });

  it("falls back when the centroid is in a hole", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", DONUT_WKT, "-c"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, '{"type":"Point","coordinates":[1.5,5]}\n');
  });

  it("leaves a lineal record to the algorithm", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", "LINESTRING (0 0, 10 10)", "-c"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, '{"type":"Point","coordinates":[0,0]}\n');
  });

  it("applies to every record of a FeatureCollection", () => {
    const literal = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { n: 1 },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [0, 10],
                [0, 0],
              ],
            ],
          },
        },
        { type: "Feature", properties: { n: 2 }, geometry: LINE_JSON },
      ],
    });
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", literal, "-c"], out.sink, err.sink, readStdinUnused), 0);
    assert.deepEqual(JSON.parse(out.text), {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { n: 1 },
          geometry: { type: "Point", coordinates: [3.333333333333333, 3.333333333333333] },
        },
        { type: "Feature", properties: { n: 2 }, geometry: { type: "Point", coordinates: [0, 0] } },
      ],
    });
  });

  it("--format wkt writes the centroid", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", TRIANGLE_WKT, "-c", "-f", "wkt"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, "POINT (3.333333333333333 3.333333333333333)\n");
  });

  it("--quiet still suppresses the result", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", TRIANGLE_WKT, "-c", "-q"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, "");
    assert.equal(err.text, "");
  });

  it("--verify checks the centroid it produced, and stdout keeps its shape", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", TRIANGLE_WKT, "-c", "-v"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, TRIANGLE_CENTROID_JSON);
    assert.equal(err.text, "verify: 1 records, 1 interior\n");
  });

  it("--verify checks the fallback when the centroid was rejected", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", DONUT_WKT, "-c", "-v"], out.sink, err.sink, readStdinUnused), 0);
    assert.equal(out.text, '{"type":"Point","coordinates":[1.5,5]}\n');
    assert.equal(err.text, "verify: 1 records, 1 interior\n");
  });

  it("--verify still exits 2 on the polygon whose hole swallows its shell", () => {
    const out = capture();
    const err = capture();
    assert.equal(run(["-i", OFF_GEOMETRY_WKT, "-c", "-v"], out.sink, err.sink, readStdinUnused), 2);
    assert.equal(out.text, '{"type":"Point","coordinates":[-2.5,5]}\n');
    assert.equal(err.text, "verify: 1 records, 1 off-geometry\nverify: record 1: off-geometry\n");
  });
});
