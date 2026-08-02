//! Orchestration of the interior-point CLI: parse the flags, read the input,
//! map `interior_point` over its records, and serialise the results. Results
//! go to `out`, diagnostics to `err`, and the return value is the process exit
//! code. There is no process access here — `bin/` supplies the stdin reader
//! and every test replaces it.
//!
//! @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
//!   prior art for this CLI's surface; the code is original, nothing is ported.

use std::io::{self, Write};

use crate::{
    InteriorPointVerification, centroid_first_interior_point, interior_point, verify_interior_point,
};

use super::args::{help_text, parse_cli_args};
use super::io::{OutputRecord, read_input, serialize, write_output};

/// The outcomes a summary line lists, in the order it lists them, which is the
/// order the four are declared in. Only the ones that occurred are printed.
const VERIFICATION_OUTCOMES: [InteriorPointVerification; 4] = [
    InteriorPointVerification::Interior,
    InteriorPointVerification::OnGeometry,
    InteriorPointVerification::OffGeometry,
    InteriorPointVerification::Unverifiable,
];

/// `verify: 3 records, 1 interior, 1 on-geometry, 1 off-geometry`, or the bare
/// `verify: 0 records` when there is nothing to report. The noun stays `records`
/// at every count, so the two command lines cannot drift on the singular case.
fn verify_summary(verifications: &[InteriorPointVerification]) -> String {
    let mut line = format!("verify: {} records", verifications.len());
    for outcome in VERIFICATION_OUTCOMES {
        let count = verifications.iter().filter(|v| **v == outcome).count();
        if count > 0 {
            line.push_str(&format!(", {count} {outcome}"));
        }
    }
    line
}

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
    // One function is chosen for the whole run, so every record of a collection
    // is answered the same way and the flag cannot vary within one output.
    let compute_point: fn(&geo_types::Geometry<f64>) -> Option<geo_types::Coord<f64>> =
        if options.centroid_first {
            centroid_first_interior_point
        } else {
            interior_point
        };
    // `into_iter` consumes each record, so the verdict is computed here, where
    // the point and the geometry it came from are both still in hand.
    let mut verifications: Vec<InteriorPointVerification> = Vec::new();
    let results: Vec<OutputRecord> = input
        .records
        .into_iter()
        .map(|record| {
            let point = record.geometry.as_ref().and_then(compute_point);
            if options.verify {
                verifications.push(verify_interior_point(point, record.geometry.as_ref()));
            }
            OutputRecord {
                point,
                meta: record.meta,
            }
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
    // After the result, so a failed write returns 1 with only its own message on
    // stderr: an unwritable output path outranks a verification verdict.
    if options.verify {
        if !options.quiet {
            let _ = writeln!(err, "{}", verify_summary(&verifications));
        }
        // Only a failure gets a line of its own; those are what survive --quiet.
        for (index, verification) in verifications.iter().enumerate() {
            if *verification == InteriorPointVerification::OffGeometry {
                let _ = writeln!(err, "verify: record {}: {verification}", index + 1);
            }
        }
        if verifications.contains(&InteriorPointVerification::OffGeometry) {
            return 2;
        }
    }
    0
}
