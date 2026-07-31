//! Process wiring for the interior-point CLI: argv, stdin, stdout/stderr, and
//! the exit code. Everything else lives in the crate's `cli::run`, which is
//! what the tests drive; this file is the one place with process access and is
//! not unit-tested.
//!
//! @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
//!   prior art; the code is original, nothing is ported.

use std::io::{self, Read, Write};
use std::process::ExitCode;

use interior_point::cli::run::run;

fn main() -> ExitCode {
    // `args()` panics on an argument that is not UTF-8, which is a crash on
    // input rather than the usage error such an argument deserves. `args_os()`
    // hands the bytes over intact, and the replacement character then travels
    // into the message naming the bad argument.
    let argv: Vec<String> = std::env::args_os()
        .skip(1)
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();
    let mut out = io::stdout().lock();
    let mut err = io::stderr().lock();
    let mut read_stdin = || -> io::Result<String> {
        let mut buffer = String::new();
        io::stdin().read_to_string(&mut buffer)?;
        Ok(buffer)
    };
    let code = run(&argv, &mut out, &mut err, &mut read_stdin);
    let _ = out.flush();
    ExitCode::from(code as u8)
}
