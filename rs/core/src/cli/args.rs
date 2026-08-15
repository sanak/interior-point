//! Flag declarations and parsing for the interior-point CLI. The surface is
//! `-i/--input`, `-f/--format`, `-o/--output`, `-v/--verify`,
//! `-c/--centroid-first`, `-t/--time`, `-q/--quiet` and `-h/--help`; there are
//! no positional arguments and no version flag.
//!
//! That order is the surface, not an accident of declaration: what the input is
//! and what comes out of it first, then the flags that check or change the
//! result, then measurement, with `--quiet` and `--help` last because they
//! answer whether there is any output at all. `clap` renders `--help` in
//! declaration order, so the struct below is where the order lives.
//!
//! @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
//!   prior art for this CLI's surface; the code is original, nothing is ported.

use std::fmt;

use clap::{CommandFactory, Parser, ValueEnum};

/// A bad command line: an unknown flag, a positional argument, or an
/// unrecognised value. Carries the message already rendered by `clap`.
#[derive(Debug)]
pub struct UsageError(pub String);

impl fmt::Display for UsageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for UsageError {}

#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
pub enum OutputFormat {
    Geojson,
    Wkt,
}

/// The parsed command line. Mirrors the TypeScript CLI's options record field
/// for field, including `help` as a plain flag rather than an early exit.
#[derive(Debug, PartialEq)]
pub struct CliOptions {
    pub input: Option<String>,
    pub format: OutputFormat,
    pub output: Option<String>,
    pub verify: bool,
    pub centroid_first: bool,
    pub time: bool,
    pub quiet: bool,
    pub help: bool,
}

/// Every flag overrides itself, which is what turns a repetition into its last
/// occurrence rather than an error. `clap` rejects a repeated flag by default,
/// where later-wins is both the ordinary command-line convention and what the
/// TypeScript CLI's `parseArgs` does, so a command line accepted by one CLI is
/// accepted by the other.
#[derive(Debug, Parser)]
#[command(
    name = "interior-point",
    about = "Compute an interior point of each input geometry.",
    disable_help_flag = true,
    disable_version_flag = true
)]
struct Cli {
    /// WKT literal, GeoJSON literal, or a path. Defaults to stdin
    #[arg(short, long, value_name = "geom|file", overrides_with = "input")]
    input: Option<String>,
    /// Output format: geojson (default) or wkt
    #[arg(short, long, value_name = "fmt", value_enum, default_value_t = OutputFormat::Geojson, overrides_with = "format")]
    format: OutputFormat,
    /// Write to a file instead of stdout
    #[arg(short, long, value_name = "file", overrides_with = "output")]
    output: Option<String>,
    /// Check each result against its input geometry
    #[arg(short, long, overrides_with = "verify")]
    verify: bool,
    /// Prefer the centroid when it lies inside
    #[arg(short, long, overrides_with = "centroid_first")]
    centroid_first: bool,
    /// Report elapsed time per phase on stderr
    #[arg(short, long, overrides_with = "time")]
    time: bool,
    /// Suppress the result; exit code only
    #[arg(short, long, overrides_with = "quiet")]
    quiet: bool,
    /// Print this help
    #[arg(short, long, overrides_with = "help")]
    help: bool,
}

pub fn help_text() -> String {
    Cli::command().render_help().to_string()
}

pub fn parse_cli_args(argv: &[String]) -> Result<CliOptions, UsageError> {
    let with_name = std::iter::once("interior-point").chain(argv.iter().map(String::as_str));
    let cli = Cli::try_parse_from(with_name).map_err(|e| UsageError(e.to_string()))?;
    Ok(CliOptions {
        input: cli.input,
        format: cli.format,
        output: cli.output,
        verify: cli.verify,
        centroid_first: cli.centroid_first,
        time: cli.time,
        quiet: cli.quiet,
        help: cli.help,
    })
}
