//! Orchestration of the interior-point CLI: parse the flags, read the input,
//! map `interior_point` over its records, and serialise the results. Results
//! go to `out`, diagnostics to `err`, and the return value is the process exit
//! code. There is no process access here — `bin/` supplies the stdin reader
//! and every test replaces it.
//!
//! @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
//!   prior art for this CLI's surface; the code is original, nothing is ported.

use std::io::{self, Write};

use crate::interior_point;

use super::args::{help_text, parse_cli_args};
use super::io::{OutputRecord, read_input, serialize, write_output};

pub fn run(
    argv: &[String],
    out: &mut dyn Write,
    err: &mut dyn Write,
    read_stdin: &mut dyn FnMut() -> io::Result<String>,
) -> i32 {
    let options = match parse_cli_args(argv) {
        Ok(options) => options,
        Err(e) => {
            // clap's own exit code for a usage error is 2; this CLI answers 1.
            // clap's rendered error already carries its own `Usage:` paragraph
            // after a blank line; keep only the message paragraph ahead of it
            // and follow with the help block once, so `Usage:` doesn't print
            // twice.
            let message = e.to_string();
            let first_paragraph = message.split("\n\n").next().unwrap_or(&message);
            let _ = writeln!(err, "{first_paragraph}\n\n{}", help_text());
            return 1;
        }
    };
    if options.help {
        let _ = write!(out, "{}", help_text());
        return 0;
    }
    let input = match read_input(options.input.as_deref(), read_stdin) {
        Ok(input) => input,
        Err(e) => {
            let _ = writeln!(err, "{e}");
            return 1;
        }
    };
    let results: Vec<OutputRecord> = input
        .records
        .into_iter()
        .map(|record| OutputRecord {
            point: record.geometry.as_ref().and_then(interior_point),
            meta: record.meta,
        })
        .collect();
    // --quiet beats --output: nothing is written anywhere; the exit code is
    // the whole result.
    if !options.quiet {
        let text = serialize(input.kind, results, options.format);
        if let Err(e) = write_output(&text, options.output.as_deref(), out) {
            let _ = writeln!(err, "{e}");
            return 1;
        }
    }
    0
}
