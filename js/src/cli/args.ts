/**
 * Flag table and parsing for the interior-point CLI: argv in, an options
 * record out. Anything the user got wrong surfaces as a `UsageError`.
 *
 * @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
 *   prior art for this CLI's surface; the code is original, nothing is ported.
 */
import { parseArgs } from "node:util";

/** A command-line mistake: unknown flag, positional argument, unknown format. */
export class UsageError extends Error {}

export type OutputFormat = "geojson" | "wkt";

export interface CliOptions {
  input: string | undefined;
  format: OutputFormat;
  output: string | undefined;
  quiet: boolean;
  verify: boolean;
  help: boolean;
}

export const HELP_TEXT = `Usage: interior-point [options]
  -i, --input <geom|file>   WKT literal, GeoJSON literal, or a path.
                            Defaults to stdin.
  -f, --format <fmt>        Output format: geojson (default) or wkt.
  -o, --output <file>       Write to a file instead of stdout.
  -q, --quiet               Suppress the result; exit code only.
  -v, --verify              Check each result against its input geometry.
  -h, --help                Print this help.
`;

export function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parsedArgs(argv);
  return {
    input: values.input,
    format: parseFormat(values.format),
    output: values.output,
    quiet: values.quiet ?? false,
    verify: values.verify ?? false,
    help: values.help ?? false,
  };
}

// A wrapper rather than an inline try: it keeps `parseArgs`'s inferred
// `values` type while rethrowing its errors as UsageError.
function parsedArgs(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      options: {
        input: { type: "string", short: "i" },
        format: { type: "string", short: "f" },
        output: { type: "string", short: "o" },
        quiet: { type: "boolean", short: "q" },
        verify: { type: "boolean", short: "v" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: false,
    });
  } catch (e) {
    throw new UsageError(e instanceof Error ? e.message : String(e));
  }
}

function parseFormat(value: string | undefined): OutputFormat {
  const format = value ?? "geojson";
  if (format === "geojson" || format === "wkt") {
    return format;
  }
  throw new UsageError(`Unknown format '${format}'`);
}
