//! In-process tests for the interior-point CLI: flag parsing, io, and run().
//!
//! @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
//!   prior art for the surface under test; the cases are original.

use interior_point::cli::args::{CliOptions, OutputFormat, help_text, parse_cli_args};

fn args(argv: &[&str]) -> Vec<String> {
    argv.iter().map(|a| a.to_string()).collect()
}

mod args_tests {
    use super::*;

    #[test]
    fn defaults_with_no_flags() {
        assert_eq!(
            parse_cli_args(&args(&[])).unwrap(),
            CliOptions {
                input: None,
                format: OutputFormat::Geojson,
                output: None,
                quiet: false,
                help: false,
            }
        );
    }

    #[test]
    fn carries_a_wkt_literal_through_short_input() {
        assert_eq!(
            parse_cli_args(&args(&["-i", "POINT (1 2)"]))
                .unwrap()
                .input
                .as_deref(),
            Some("POINT (1 2)")
        );
    }

    #[test]
    fn carries_a_geojson_literal_through_long_input_unaltered() {
        let literal = r#"{"type":"Point","coordinates":[1,2]}"#;
        assert_eq!(
            parse_cli_args(&args(&["--input", literal]))
                .unwrap()
                .input
                .as_deref(),
            Some(literal)
        );
    }

    #[test]
    fn accepts_format_wkt() {
        assert_eq!(
            parse_cli_args(&args(&["-f", "wkt"])).unwrap().format,
            OutputFormat::Wkt
        );
    }

    #[test]
    fn rejects_an_unknown_format() {
        let message = parse_cli_args(&args(&["-f", "xml"]))
            .unwrap_err()
            .to_string();
        assert!(message.contains("xml"), "{message}");
    }

    #[test]
    fn rejects_an_unknown_flag() {
        assert!(parse_cli_args(&args(&["--bogus"])).is_err());
    }

    #[test]
    fn rejects_a_positional_argument() {
        assert!(parse_cli_args(&args(&["POINT (1 2)"])).is_err());
    }

    #[test]
    fn sets_help_and_quiet_from_short_flags() {
        let options = parse_cli_args(&args(&["-h", "-q"])).unwrap();
        assert!(options.help);
        assert!(options.quiet);
    }

    #[test]
    fn help_text_names_every_long_flag() {
        let help = help_text();
        for flag in ["--input", "--format", "--output", "--quiet", "--help"] {
            assert!(help.contains(flag), "{flag} missing from help text");
        }
    }
}
