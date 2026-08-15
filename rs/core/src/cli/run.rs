//! Orchestration of the interior-point CLI: parse the flags, read the input,
//! map `interior_point` over its records, and serialise the results. Results
//! go to `out`, diagnostics to `err`, and the return value is the process exit
//! code. There is no process access here — `bin/` supplies the stdin reader
//! and every test replaces it.
//!
//! @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
//!   prior art for this CLI's surface; the code is original, nothing is ported.

use std::io::{self, Write};
use std::time::{Duration, Instant};

use crate::{Verification, centroid_first_interior_point, interior_point, verify_interior_point};

use super::args::{help_text, parse_cli_args};
use super::io::{OutputRecord, read_input, serialize, write_output};

/// The outcomes a summary line lists, in the order it lists them, which is the
/// order the four are declared in. Only the ones that occurred are printed.
const VERIFICATION_OUTCOMES: [Verification; 4] = [
    Verification::Interior,
    Verification::OnGeometry,
    Verification::OffGeometry,
    Verification::Unverifiable,
];

/// `verify: 3 records, 1 interior, 1 on-geometry, 1 off-geometry`, or the bare
/// `verify: 0 records` when there is nothing to report. The noun stays `records`
/// at every count, so the two command lines cannot drift on the singular case.
fn verify_summary(verifications: &[Verification]) -> String {
    let mut line = format!("verify: {} records", verifications.len());
    for outcome in VERIFICATION_OUTCOMES {
        let count = verifications.iter().filter(|v| **v == outcome).count();
        if count > 0 {
            line.push_str(&format!(", {count} {outcome}"));
        }
    }
    line
}

/// One phase of a run and what it cost.
struct Phase {
    name: &'static str,
    elapsed: Duration,
}

/// The `--time` line: the record count, then each phase that actually ran, then
/// their sum. A phase that did not happen is not named, so `--quiet` reports no
/// `write` and a run without `--verify` reports no `verify`.
///
/// `total` is that sum rather than the process's lifetime. `run` is handed
/// control after the runtime has started and gives it back before the process
/// exits, so startup and teardown are outside anything it could measure — which
/// is why this number is smaller than what `time interior-point ...` reports.
///
/// jtsop's `-time` is the prior art, and it reports one figure covering the
/// operation alone. The phases are this CLI's own: measuring them separately is
/// what distinguishes a slow geometry from a slow file, and on real input the
/// operation has proven to be the smallest of the three.
fn time_report(records: usize, phases: &[Phase]) -> String {
    let segments: Vec<String> = phases
        .iter()
        .map(|phase| format!("{} {:.1} ms", phase.name, millis(phase.elapsed)))
        .collect();
    let total: Duration = phases.iter().map(|phase| phase.elapsed).sum();
    format!(
        "time: {records} records, {}, total {:.1} ms",
        segments.join(", "),
        millis(total)
    )
}

fn millis(elapsed: Duration) -> f64 {
    elapsed.as_secs_f64() * 1000.0
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
    let mut phases: Vec<Phase> = Vec::new();
    let read_started = Instant::now();
    let input = match read_input(options.input.as_deref(), read_stdin) {
        Ok(input) => input,
        Err(e) => {
            let _ = writeln!(err, "{e}");
            return 1;
        }
    };
    phases.push(Phase {
        name: "read",
        elapsed: read_started.elapsed(),
    });
    let records = input.records.len();
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
    let mut verifications: Vec<Verification> = Vec::new();
    let mut verify_elapsed = Duration::ZERO;
    let compute_started = Instant::now();
    let results: Vec<OutputRecord> = input
        .records
        .into_iter()
        .map(|record| {
            let point = record.geometry.as_ref().and_then(compute_point);
            if options.verify {
                // Verification is clocked here rather than in a pass of its own
                // for the same reason it is computed here: after `into_iter` the
                // geometry is in hand nowhere else. The clock is read only when
                // a report will use it, so an ordinary `--verify` run pays for
                // no `Instant` at all.
                let started = options.time.then(Instant::now);
                verifications.push(verify_interior_point(point, record.geometry.as_ref()));
                if let Some(started) = started {
                    verify_elapsed += started.elapsed();
                }
            }
            OutputRecord {
                point,
                meta: record.meta,
            }
        })
        .collect();
    phases.push(Phase {
        name: "compute",
        // The verification above ran inside this span, so it is taken back out
        // and reported on its own; the two phases then sum to the loop.
        elapsed: compute_started.elapsed().saturating_sub(verify_elapsed),
    });
    if options.verify {
        phases.push(Phase {
            name: "verify",
            elapsed: verify_elapsed,
        });
    }
    // --quiet beats --output: nothing is written anywhere; the exit code is
    // the whole result.
    if !options.quiet {
        let write_started = Instant::now();
        let text = serialize(input.kind, results, options.format);
        if let Err(e) = write_output(&text, options.output.as_deref(), out) {
            let _ = writeln!(err, "{e}");
            return 1;
        }
        phases.push(Phase {
            name: "write",
            elapsed: write_started.elapsed(),
        });
    }
    // After the result, so a failed write returns 1 with only its own message on
    // stderr: an unwritable output path outranks a verification verdict.
    let mut code = 0;
    if options.verify {
        if !options.quiet {
            let _ = writeln!(err, "{}", verify_summary(&verifications));
        }
        // Only a failure gets a line of its own; those are what survive --quiet.
        for (index, verification) in verifications.iter().enumerate() {
            if *verification == Verification::OffGeometry {
                let _ = writeln!(err, "verify: record {}: {verification}", index + 1);
            }
        }
        if verifications.contains(&Verification::OffGeometry) {
            code = 2;
        }
    }
    // Last, so the verification lines keep the position they have without the
    // flag and the timing is the record of everything above it.
    if options.time {
        let _ = writeln!(err, "{}", time_report(records, &phases));
    }
    code
}
