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
import { HELP_TEXT, parseCliArgs, type CliOptions } from "./args.ts";
import { readInput, serialize, writeOutput, type Sink } from "./io.ts";

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
    const results = input.records.map((record) => ({
      point: interiorPoint(record.geometry),
      meta: record.meta,
    }));
    // --quiet beats --output: nothing is written anywhere; the exit code is
    // the whole result.
    if (!options.quiet) {
      writeOutput(serialize(input.kind, results, options.format), options.output, out);
    }
    return 0;
  } catch (e) {
    err(`${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}
