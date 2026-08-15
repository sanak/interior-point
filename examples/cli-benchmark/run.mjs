#!/usr/bin/env node
// Times the three interior-point CLIs — this port's npm package, this port's crate, and JTS's own
// jtsop — over one GeoJSON file, and reports both the wall clock of the whole process and what is
// left of it once the process's fixed startup cost is taken out.
//
// Uses nothing beyond node builtins, for the same reason `scripts/` does: the only thing it needs
// to be installed is the three commands it measures.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HERE = import.meta.dirname;
const REPO = join(HERE, "..", "..");

/** The JTS entry point `bin/jtsop.sh` invokes, and the function registry name for `getInteriorPoint`. */
const JTSOP_MAIN = "org.locationtech.jtstest.cmd.JTSOpCmd";
const JTSOP_FUNCTION = "Construction.interiorPoint";

function parseArgs(argv) {
  const options = {
    input: join(HERE, "..", "data", "plateau-hiroshima-bldg-no-attributes.geojson"),
    jtsJar: process.env.JTS_JAR ?? "",
    runs: 10,
    warmup: 2,
  };
  for (const arg of argv) {
    const [name, value] = arg.startsWith("--") ? arg.slice(2).split("=", 2) : ["", ""];
    if (name === "input") options.input = value;
    else if (name === "jts-jar") options.jtsJar = value;
    else if (name === "runs") options.runs = Number(value);
    else if (name === "warmup") options.warmup = Number(value);
    else {
      console.error(`Unknown argument: ${arg}`);
      console.error("Usage: node run.mjs [--input=<file>] [--jts-jar=<file>] [--runs=N] [--warmup=N]");
      process.exit(2);
    }
  }
  return options;
}

/**
 * The `compute` phase of this port's own `--time` line: the operation alone, with no parsing and no
 * serialisation, which is the same span jtsop's `-time` reports. Read from a `-q` run so nothing is
 * written while it is being measured.
 */
function computePhaseMillis(tool, input) {
  const [command, args] = tool.quiet(input);
  const result = spawnSync(command, [...args, "-t"], { encoding: "utf8" });
  const match = /\bcompute ([\d.]+) ms\b/.exec(result.stderr ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * The tools, in the order the report lists them. `command` returns argv for one run over `input`
 * writing to `output`; `countPoints` reads that output back so a run that produced the wrong number
 * of points cannot be reported as a fast one. `internalMillis` is each tool's own report of the
 * operation alone — the one figure the three measure identically.
 */
function toolsFor(options) {
  const tools = [
    {
      id: "npm",
      label: "interior-point (npm)",
      binary: join(REPO, "js", "dist", "bin", "interior-point.js"),
      missing: "run `pnpm build:js` from the repository root",
      command(input, output) {
        return [process.execPath, [this.binary, "-i", input, "-o", output]];
      },
      quiet(input) {
        return [process.execPath, [this.binary, "-i", input, "-q"]];
      },
      countPoints(text) {
        return JSON.parse(text).features.length;
      },
      internalMillis(input) {
        return computePhaseMillis(this, input);
      },
    },
    {
      id: "crate",
      label: "interior-point (crate)",
      binary: join(REPO, "rs", "target", "release", "interior-point"),
      missing: "run `cargo build --release -p interior-point --features cli` from `rs/`",
      command(input, output) {
        return [this.binary, ["-i", input, "-o", output]];
      },
      quiet(input) {
        return [this.binary, ["-i", input, "-q"]];
      },
      countPoints(text) {
        return JSON.parse(text).features.length;
      },
      internalMillis(input) {
        return computePhaseMillis(this, input);
      },
    },
  ];

  if (options.jtsJar) {
    tools.push({
      id: "jtsop",
      label: "JTS jtsop",
      binary: options.jtsJar,
      missing: "build it with `mvn -pl modules/app -am package -DskipTests` in a JTS checkout",
      command(input, output) {
        // -eacha runs the op once per element of A, which is what the GeoJSON FeatureCollection
        // becomes on the way in: JTS's GeoJsonReader turns it into a GeometryCollection.
        return [
          "java",
          ["-cp", this.binary, JTSOP_MAIN, "-a", input, "-eacha", "-f", "geojson", "-o", output, JTSOP_FUNCTION],
        ];
      },
      quiet(input) {
        return ["java", ["-cp", this.binary, JTSOP_MAIN, "-a", input, "-eacha", "-q", JTSOP_FUNCTION]];
      },
      countPoints(text) {
        // jtsop writes one geometry per line rather than a single envelope.
        return text.split("\n").filter((line) => line.trim() !== "").length;
      },
      // jtsop counts the operation alone — no parsing, no serialisation, no JVM startup — which is
      // the span the other two report as their `compute` phase.
      internalMillis(input) {
        const result = spawnSync(
          "java",
          ["-cp", this.binary, JTSOP_MAIN, "-a", input, "-eacha", "-q", "-time", JTSOP_FUNCTION],
          {
            encoding: "utf8",
          },
        );
        const match = /Total Time:\s*([\d.]+)\s*(ms|s)\b/.exec(result.stdout ?? "");
        if (!match) return null;
        return match[2] === "s" ? Number(match[1]) * 1000 : Number(match[1]);
      },
    });
  }

  return tools;
}

function run(label, [command, args]) {
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, { encoding: "utf8" });
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.status !== 0) {
    throw new Error(`${label} exited ${result.status}\n${result.stderr ?? ""}`);
  }
  return elapsed;
}

function measure(label, argv, options) {
  for (let i = 0; i < options.warmup; i += 1) run(label, argv);
  const samples = [];
  for (let i = 0; i < options.runs; i += 1) samples.push(run(label, argv));
  samples.sort((a, b) => a - b);
  return {
    min: samples[0],
    median: samples[Math.floor(samples.length / 2)],
    max: samples[samples.length - 1],
  };
}

/** A one-feature copy of the input, so a run over it measures everything but the dataset. */
function writeSingleFeature(input, path) {
  const collection = JSON.parse(readFileSync(input, "utf8"));
  writeFileSync(path, JSON.stringify({ type: "FeatureCollection", features: collection.features.slice(0, 1) }));
  return collection.features.length;
}

function format(value) {
  return value === null ? "—" : value.toFixed(1);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!existsSync(options.input)) {
    console.error(`No input at ${options.input}`);
    console.error("Generate it with `../data/convert-citygml.sh`, or pass --input=<file>.");
    process.exit(1);
  }

  const tools = toolsFor(options);
  for (const tool of tools) {
    if (!existsSync(tool.binary)) {
      console.error(`No ${tool.label} at ${tool.binary} — ${tool.missing}.`);
      process.exit(1);
    }
  }
  if (!options.jtsJar) {
    console.error("No JTS jar given, so jtsop is left out. Pass --jts-jar=<file> or set JTS_JAR to include it.");
  }

  const work = mkdtempSync(join(tmpdir(), "interior-point-cli-benchmark-"));
  try {
    const single = join(work, "single.geojson");
    const features = writeSingleFeature(options.input, single);
    console.error(
      `${options.input}: ${features} features, ${options.warmup} warmup + ${options.runs} timed runs each\n`,
    );

    const rows = [];
    for (const tool of tools) {
      const output = join(work, `${tool.id}.out`);

      run(tool.label, tool.command(options.input, output));
      const points = tool.countPoints(readFileSync(output, "utf8"));
      if (points !== features) {
        throw new Error(`${tool.label} produced ${points} points for ${features} features`);
      }

      // Three runs of the same command, differing only in what they are asked to do:
      //   full     — the whole dataset, writing the result
      //   quiet    — the whole dataset, writing nothing, so the difference is serialisation
      //   startup  — one feature, writing the result, so what is left is the fixed process cost
      const full = measure(tool.label, tool.command(options.input, output), options);
      const quiet = measure(tool.label, tool.quiet(options.input), options);
      const startup = measure(tool.label, tool.command(single, output), options);
      const internal = tool.internalMillis ? tool.internalMillis(options.input) : null;
      rows.push({ tool, full, quiet, startup, internal });
      console.error(`${tool.label}: ${format(full.median)} ms`);
    }

    console.log("");
    console.log("| Tool | Full (ms) | min–max | Startup | Read + compute | Write | Self-timed |");
    console.log("| ---- | --------: | ------- | ------: | -------------: | ----: | ---------: |");
    for (const { tool, full, quiet, startup, internal } of rows) {
      const range = `${format(full.min)}–${format(full.max)}`;
      const read = quiet.median - startup.median;
      const write = full.median - quiet.median;
      console.log(
        `| ${tool.label} | ${format(full.median)} | ${range} | ${format(startup.median)} | ${format(read)} | ${format(write)} | ${format(internal)} |`,
      );
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
