/**
 * Orchestration of the interior-point CLI: parse the flags, read the input,
 * map `interiorPoint` over its records, and serialise the results. Results go
 * to `out`, diagnostics to `err`, and the return value is the process exit
 * code. The only process access is the stdin default, which `bin/` leaves in
 * place and every test replaces.
 *
 * @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
 *   prior art; the code is original, nothing is ported.
 */
import { readFileSync } from "node:fs";
import { interiorPoint } from "../algorithm/InteriorPoint.ts";
import { centroidFirstInteriorPoint } from "../CentroidFirstInteriorPoint.ts";
import { Verification, verifyInteriorPoint } from "../VerifyInteriorPoint.ts";
import { HELP_TEXT, parseCliArgs, type CliOptions } from "./args.ts";
import { readInput, serialize, writeOutput, type Sink } from "./io.ts";

/**
 * The four outcomes in the order the summary line lists them, which is the order
 * they are declared in. Both language ports print the same line for the same
 * input, so this order is part of the surface rather than an implementation
 * detail.
 */
const OUTCOME_ORDER = [
  Verification.Interior,
  Verification.OnGeometry,
  Verification.OffGeometry,
  Verification.Unverifiable,
];

export function run(
  argv: string[],
  out: Sink,
  err: Sink,
  readStdin: () => string = () => readFileSync(0, "utf-8"),
): number {
  let options: CliOptions;
  try {
    options = parseCliArgs(argv);
  } catch (e) {
    err(`${e instanceof Error ? e.message : String(e)}\n`);
    err(HELP_TEXT);
    return 1;
  }
  if (options.help) {
    out(HELP_TEXT);
    return 0;
  }
  const phases: Phase[] = [];
  try {
    const input = measured(phases, "read", () => readInput(options.input, readStdin));
    // One function is chosen for the whole run, so every record of a collection
    // is answered the same way and the flag cannot vary within one output.
    const computePoint = options.centroidFirst ? centroidFirstInteriorPoint : interiorPoint;
    const results = measured(phases, "compute", () =>
      input.records.map((record) => ({
        point: computePoint(record.geometry),
        meta: record.meta,
      })),
    );
    // Computed from the records this module already holds, before serialisation,
    // so nothing about what reaches `out` depends on the flag.
    const outcomes = options.verify
      ? measured(phases, "verify", () =>
          input.records.map((record, index) => verifyInteriorPoint(results[index].point, record.geometry)),
        )
      : [];
    // --quiet beats --output: nothing is written anywhere; the exit code is
    // the whole result.
    if (!options.quiet) {
      measured(phases, "write", () => writeOutput(serialize(input.kind, results, options.format), options.output, out));
    }
    const code = options.verify ? reportVerification(outcomes, options.quiet, err) : 0;
    // Last, so the verification lines keep the position they have without the
    // flag and the timing is the record of everything above it.
    if (options.time) err(timeReport(input.records.length, phases));
    return code;
  } catch (e) {
    err(`${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}

/** One phase of a run and what it cost, in milliseconds. */
interface Phase {
  name: string;
  ms: number;
}

/**
 * Runs `work`, recording what it took under `name`. The phase is recorded only
 * once `work` returns, so a run that threw carries no half-measured phase into
 * a report — and there is no report on that path anyway.
 */
function measured<T>(phases: Phase[], name: string, work: () => T): T {
  const started = performance.now();
  const result = work();
  phases.push({ name, ms: performance.now() - started });
  return result;
}

/**
 * The `--time` line: the record count, then each phase that actually ran, then
 * their sum. A phase that did not happen is not named, so `--quiet` reports no
 * `write` and a run without `--verify` reports no `verify`.
 *
 * `total` is that sum rather than the process's lifetime. `run` is handed
 * control after the runtime has started and gives it back before the process
 * exits, so startup and teardown are outside anything it could measure — which
 * is why this number is smaller than what `time interior-point ...` reports.
 *
 * jtsop's `-time` is the prior art, and it reports one figure covering the
 * operation alone. The phases are this CLI's own: measuring them separately is
 * what distinguishes a slow geometry from a slow file, and on real input the
 * operation has proven to be the smallest of the three.
 */
function timeReport(records: number, phases: Phase[]): string {
  const segments = phases.map((phase) => `${phase.name} ${phase.ms.toFixed(1)} ms`);
  const total = phases.reduce((sum, phase) => sum + phase.ms, 0);
  return `time: ${records} records, ${segments.join(", ")}, total ${total.toFixed(1)} ms\n`;
}

/**
 * Writes the verification messages to `err` and returns the exit code.
 *
 * The summary counts every outcome that occurred; the detail lines name only the
 * records that failed, which is why they survive `--quiet` — a failure notice is
 * not the result. Only an off-geometry record fails: an unverifiable one is the
 * absence of an answer rather than a wrong one, and an empty result already
 * exits 0 without the flag. The count noun stays `records` at every count, so
 * the two language ports cannot drift on the singular case.
 */
function reportVerification(outcomes: Verification[], quiet: boolean, err: Sink): number {
  if (!quiet) {
    let summary = `verify: ${outcomes.length} records`;
    for (const outcome of OUTCOME_ORDER) {
      const count = outcomes.filter((o) => o === outcome).length;
      if (count > 0) summary += `, ${count} ${outcome}`;
    }
    err(`${summary}\n`);
  }
  let failed = false;
  outcomes.forEach((outcome, index) => {
    if (outcome !== Verification.OffGeometry) return;
    failed = true;
    err(`verify: record ${index + 1}: ${outcome}\n`);
  });
  return failed ? 2 : 0;
}
