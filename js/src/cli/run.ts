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
  try {
    const input = readInput(options.input, readStdin);
    // One function is chosen for the whole run, so every record of a collection
    // is answered the same way and the flag cannot vary within one output.
    const computePoint = options.centroidFirst ? centroidFirstInteriorPoint : interiorPoint;
    const results = input.records.map((record) => ({
      point: computePoint(record.geometry),
      meta: record.meta,
    }));
    // Computed from the records this module already holds, before serialisation,
    // so nothing about what reaches `out` depends on the flag.
    const outcomes = options.verify
      ? input.records.map((record, index) => verifyInteriorPoint(results[index].point, record.geometry))
      : [];
    // --quiet beats --output: nothing is written anywhere; the exit code is
    // the whole result.
    if (!options.quiet) {
      writeOutput(serialize(input.kind, results, options.format), options.output, out);
    }
    if (!options.verify) return 0;
    return reportVerification(outcomes, options.quiet, err);
  } catch (e) {
    err(`${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
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
