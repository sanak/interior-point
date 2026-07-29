#!/usr/bin/env node
/**
 * Process wiring for the interior-point CLI: argv, stdout/stderr, exit code.
 * Everything else lives in ../cli/run.ts, which is what the tests drive; this
 * file is the one place with process access and is not unit-tested.
 *
 * @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
 *   prior art; the code is original, nothing is ported.
 */
import { run } from "../cli/run.ts";

process.exitCode = run(
  process.argv.slice(2),
  (text) => {
    process.stdout.write(text);
  },
  (text) => {
    process.stderr.write(text);
  },
);
