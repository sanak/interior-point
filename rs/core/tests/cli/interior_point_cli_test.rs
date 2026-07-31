//! In-process tests for the interior-point CLI: flag parsing, io, and run().
//!
//! @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
//!   prior art for the surface under test; the cases are original.

use interior_point::cli::args::{CliOptions, OutputFormat, help_text, parse_cli_args};
use interior_point::cli::io::{
    Input, InputKind, Members, OutputRecord, read_input, serialize, write_output,
};
use interior_point::cli::run::run;

fn args(argv: &[&str]) -> Vec<String> {
    argv.iter().map(|a| a.to_string()).collect()
}

/// A scratch path unique to this process, so a test that writes a file cannot
/// collide with a concurrently running one.
fn temp_path(name: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("interior-point-cli-{}-{name}", std::process::id()))
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

mod io_input_tests {
    use super::*;
    use std::fs;

    fn no_stdin() -> impl FnMut() -> std::io::Result<String> {
        || panic!("stdin must not be read when --input is given")
    }

    fn read(arg: &str) -> Input {
        read_input(Some(arg), &mut no_stdin()).unwrap()
    }

    #[test]
    fn parses_a_wkt_literal_to_kind_geometry_with_one_record() {
        let input = read("POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))");
        assert_eq!(input.kind, InputKind::Geometry);
        assert_eq!(input.records.len(), 1);
        assert!(input.records[0].geometry.is_some());
        assert!(input.records[0].meta.is_none());
    }

    #[test]
    fn parses_a_geojson_geometry_literal_to_kind_geometry() {
        let input = read(r#"{"type":"Point","coordinates":[1,2]}"#);
        assert_eq!(input.kind, InputKind::Geometry);
        assert_eq!(input.records.len(), 1);
        assert!(input.records[0].meta.is_none());
    }

    #[test]
    fn parses_a_feature_keeping_properties_and_id_dropping_bbox() {
        let input = read(
            r#"{"type":"Feature","bbox":[0,0,10,10],"id":"a","properties":{"name":"x"},
                "geometry":{"type":"Point","coordinates":[1,2]}}"#,
        );
        assert_eq!(input.kind, InputKind::Feature);
        let meta = input.records[0].meta.as_ref().unwrap();
        assert!(!meta.contains_key("bbox"));
        assert!(!meta.contains_key("geometry"));
        assert!(!meta.contains_key("type"));
        assert_eq!(meta["id"], "a");
        assert_eq!(meta["properties"]["name"], "x");
        // The two surviving members keep the order they were read in.
        assert_eq!(meta.keys().collect::<Vec<_>>(), ["id", "properties"]);
    }

    #[test]
    fn parses_a_feature_collection_in_order_keeping_a_null_geometry() {
        let input = read(
            r#"{"type":"FeatureCollection","features":[
                {"type":"Feature","id":1,"properties":{"n":1},
                 "geometry":{"type":"Point","coordinates":[1,2]}},
                {"type":"Feature","properties":null,"geometry":null}]}"#,
        );
        assert_eq!(input.kind, InputKind::FeatureCollection);
        assert_eq!(input.records.len(), 2);
        assert!(input.records[0].geometry.is_some());
        assert!(input.records[1].geometry.is_none());
        assert_eq!(input.records[0].meta.as_ref().unwrap()["id"], 1);
        // `"properties": null` is kept as null, not dropped.
        assert!(input.records[1].meta.as_ref().unwrap()["properties"].is_null());
    }

    #[test]
    fn reads_stdin_when_input_is_absent() {
        let mut stdin = || Ok("POINT (1 2)".to_string());
        let input = read_input(None, &mut stdin).unwrap();
        assert_eq!(input.kind, InputKind::Geometry);
        assert_eq!(input.records.len(), 1);
    }

    #[test]
    fn reads_an_existing_file_and_classifies_its_contents_by_the_same_rule() {
        let path = temp_path("input.geojson");
        fs::write(
            &path,
            r#"{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[1,2]}}"#,
        )
        .unwrap();
        let input = read(path.to_str().unwrap());
        let _ = fs::remove_file(&path);
        assert_eq!(input.kind, InputKind::Feature);
    }

    #[test]
    fn accepts_newlines_inside_a_wkt_coordinate_list() {
        let input = read("POLYGON ((0 0,\n 10 0,\n 10 10, 0 10, 0 0))");
        assert_eq!(input.kind, InputKind::Geometry);
        assert!(input.records[0].geometry.is_some());
    }

    #[test]
    fn errors_on_unparseable_wkt() {
        assert!(read_input(Some("NOTAGEOM (1 2)"), &mut no_stdin()).is_err());
    }

    #[test]
    fn errors_on_invalid_json() {
        assert!(read_input(Some("{not json"), &mut no_stdin()).is_err());
    }

    #[test]
    fn errors_on_an_unsupported_type_member() {
        assert!(read_input(Some(r#"{"type":"Bogus"}"#), &mut no_stdin()).is_err());
    }

    #[test]
    fn treats_a_path_that_does_not_exist_as_a_wkt_literal() {
        // Matching the TypeScript CLI: only an existing path is a file, so a
        // typo surfaces as an unparseable geometry rather than a stat error.
        let error = read_input(Some("/nope/missing.geojson"), &mut no_stdin()).unwrap_err();
        assert!(!error.to_string().is_empty());
    }
}

mod io_output_tests {
    use super::*;
    use geo_types::coord;
    use std::fs;

    /// Metadata in the order a Feature carrying `id` before `properties`
    /// would have been read in.
    fn feature_with(id: &str, key: &str, value: i64) -> Members {
        let mut properties = Members::new();
        properties.insert(key.to_string(), value.into());
        let mut meta = Members::new();
        meta.insert("id".to_string(), id.into());
        meta.insert("properties".to_string(), properties.into());
        meta
    }

    #[test]
    fn serialises_a_geometry_kind_point_as_bare_geojson() {
        let records = vec![OutputRecord {
            point: Some(coord! { x: 5.0, y: 5.0 }),
            meta: None,
        }];
        assert_eq!(
            serialize(InputKind::Geometry, records, OutputFormat::Geojson),
            "{\"type\":\"Point\",\"coordinates\":[5,5]}\n"
        );
    }

    /// The three number shapes `JSON.stringify` writes: plain decimal, and the
    /// exponential form it switches to above 1e21 and below 1e-6.
    #[test]
    fn serialises_coordinates_outside_the_plain_decimal_band_in_exponential_form() {
        let records = vec![OutputRecord {
            point: Some(coord! { x: 1e21, y: 1e-7 }),
            meta: None,
        }];
        assert_eq!(
            serialize(InputKind::Geometry, records, OutputFormat::Geojson),
            "{\"type\":\"Point\",\"coordinates\":[1e+21,1e-7]}\n"
        );
    }

    /// Two seventeen-digit strings round-trip to this double and sit equally
    /// close to it. ECMAScript takes the one ending in an even digit, and so
    /// must this; the standard library's own shortest form ends in `3`.
    #[test]
    fn breaks_a_tie_between_equally_short_forms_towards_the_even_digit() {
        let records = vec![OutputRecord {
            point: Some(coord! { x: 1186772172624852.2, y: 0.0 }),
            meta: None,
        }];
        assert_eq!(
            serialize(InputKind::Geometry, records, OutputFormat::Geojson),
            "{\"type\":\"Point\",\"coordinates\":[1186772172624852.2,0]}\n"
        );
    }

    #[test]
    fn serialises_negative_zero_as_zero() {
        let records = vec![OutputRecord {
            point: Some(coord! { x: -0.0, y: 0.0 }),
            meta: None,
        }];
        assert_eq!(
            serialize(InputKind::Geometry, records, OutputFormat::Geojson),
            "{\"type\":\"Point\",\"coordinates\":[0,0]}\n"
        );
    }

    /// A number carried through from the input is rendered the same way, so a
    /// property that arrived as `1.0` leaves as `1`, as it would from
    /// `JSON.parse` and back out through `JSON.stringify`.
    #[test]
    fn serialises_a_whole_pass_through_property_without_a_decimal_point() {
        let mut properties = Members::new();
        properties.insert("n".to_string(), 1.0.into());
        let mut meta = Members::new();
        meta.insert("properties".to_string(), properties.into());
        let records = vec![OutputRecord {
            point: Some(coord! { x: 5.0, y: 5.0 }),
            meta: Some(meta),
        }];
        assert_eq!(
            serialize(InputKind::Feature, records, OutputFormat::Geojson),
            "{\"type\":\"Feature\",\"properties\":{\"n\":1},\
             \"geometry\":{\"type\":\"Point\",\"coordinates\":[5,5]}}\n"
        );
    }

    #[test]
    fn serialises_a_geometry_kind_empty_result_as_json_null() {
        let records = vec![OutputRecord {
            point: None,
            meta: None,
        }];
        assert_eq!(
            serialize(InputKind::Geometry, records, OutputFormat::Geojson),
            "null\n"
        );
    }

    #[test]
    fn serialises_wkt_one_line_per_record_point_empty_for_an_empty_result() {
        let records = vec![
            OutputRecord {
                point: Some(coord! { x: 5.0, y: 5.0 }),
                meta: None,
            },
            OutputRecord {
                point: None,
                meta: None,
            },
        ];
        assert_eq!(
            serialize(InputKind::FeatureCollection, records, OutputFormat::Wkt),
            "POINT (5 5)\nPOINT EMPTY\n"
        );
    }

    #[test]
    fn rebuilds_a_feature_around_the_point_with_meta_intact() {
        let records = vec![OutputRecord {
            point: Some(coord! { x: 5.0, y: 5.0 }),
            meta: Some(feature_with("a", "n", 1)),
        }];
        assert_eq!(
            serialize(InputKind::Feature, records, OutputFormat::Geojson),
            "{\"type\":\"Feature\",\"id\":\"a\",\"properties\":{\"n\":1},\
             \"geometry\":{\"type\":\"Point\",\"coordinates\":[5,5]}}\n"
        );
    }

    #[test]
    fn rebuilds_a_feature_collection_in_record_order_null_geometries_kept() {
        let records = vec![
            OutputRecord {
                point: Some(coord! { x: 5.0, y: 5.0 }),
                meta: Some(feature_with("a", "n", 1)),
            },
            OutputRecord {
                point: None,
                meta: Some(feature_with("b", "n", 2)),
            },
        ];
        let text = serialize(InputKind::FeatureCollection, records, OutputFormat::Geojson);
        assert!(
            text.starts_with("{\"type\":\"FeatureCollection\",\"features\":["),
            "{text}"
        );
        assert!(text.contains("\"id\":\"a\""), "{text}");
        assert!(text.contains("\"geometry\":null"), "{text}");
        assert!(text.ends_with("}\n"), "{text}");
        assert!(
            text.find("\"id\":\"a\"").unwrap() < text.find("\"id\":\"b\"").unwrap(),
            "{text}"
        );
    }

    #[test]
    fn serialises_zero_records_in_wkt_mode_as_zero_lines() {
        assert_eq!(
            serialize(InputKind::FeatureCollection, vec![], OutputFormat::Wkt),
            ""
        );
    }

    #[test]
    fn serialises_zero_records_in_geojson_mode_as_an_empty_collection() {
        assert_eq!(
            serialize(InputKind::FeatureCollection, vec![], OutputFormat::Geojson),
            "{\"type\":\"FeatureCollection\",\"features\":[]}\n"
        );
    }

    #[test]
    fn write_output_writes_the_file_instead_of_the_sink_when_a_path_is_given() {
        let path = temp_path("output.txt");
        let mut sink: Vec<u8> = Vec::new();
        write_output("POINT (5 5)\n", Some(path.to_str().unwrap()), &mut sink).unwrap();
        let written = fs::read_to_string(&path).unwrap();
        let _ = fs::remove_file(&path);
        assert_eq!(written, "POINT (5 5)\n");
        assert!(sink.is_empty());
    }

    #[test]
    fn write_output_uses_the_sink_when_no_path_is_given() {
        let mut sink: Vec<u8> = Vec::new();
        write_output("POINT (5 5)\n", None, &mut sink).unwrap();
        assert_eq!(String::from_utf8(sink).unwrap(), "POINT (5 5)\n");
    }
}

mod run_tests {
    use super::*;
    use std::fs;

    /// Drives `run` against in-memory sinks and returns (exit code, stdout, stderr).
    fn drive(argv: &[&str], stdin: &str) -> (i32, String, String) {
        let (mut out, mut err) = (Vec::new(), Vec::new());
        let mut read_stdin = || Ok(stdin.to_string());
        let code = run(&args(argv), &mut out, &mut err, &mut read_stdin);
        (
            code,
            String::from_utf8(out).unwrap(),
            String::from_utf8(err).unwrap(),
        )
    }

    #[test]
    fn wkt_literal_in_geojson_out_by_default() {
        let (code, out, err) = drive(&["-i", "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))"], "");
        assert_eq!(code, 0);
        assert_eq!(out, "{\"type\":\"Point\",\"coordinates\":[5,5]}\n");
        assert!(err.is_empty());
    }

    /// A coordinate has to survive the read as well as the write. Both JSON
    /// readers on this path are only exact because they carry `float_roundtrip`;
    /// without it this value comes back one ULP away, as `…456e-51`.
    #[test]
    fn reads_a_coordinate_back_as_the_double_it_was_written_as() {
        let (code, out, _) = drive(
            &[
                "-i",
                r#"{"type":"Point","coordinates":[-7.464683915807455e-51,1.1867721726248522e15]}"#,
            ],
            "",
        );
        assert_eq!(code, 0);
        assert_eq!(
            out,
            "{\"type\":\"Point\",\"coordinates\":[-7.464683915807455e-51,1186772172624852.2]}\n"
        );
    }

    #[test]
    fn geojson_geometry_literal_in_wkt_out() {
        let (code, out, _) = drive(
            &[
                "-i",
                r#"{"type":"Polygon","coordinates":[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}"#,
                "-f",
                "wkt",
            ],
            "",
        );
        assert_eq!(code, 0);
        assert_eq!(out, "POINT (5 5)\n");
    }

    #[test]
    fn feature_in_feature_out_properties_and_id_intact_bbox_gone() {
        let (code, out, _) = drive(
            &[
                "-i",
                r#"{"type":"Feature","bbox":[0,0,10,10],"id":"a","properties":{"name":"x"},
                    "geometry":{"type":"Polygon","coordinates":[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}}"#,
            ],
            "",
        );
        assert_eq!(code, 0);
        assert!(!out.contains("bbox"), "{out}");
        assert!(out.contains("\"id\":\"a\""), "{out}");
        assert!(out.contains("\"name\":\"x\""), "{out}");
        assert!(out.contains("\"coordinates\":[5,5]"), "{out}");
    }

    #[test]
    fn feature_collection_file_in_feature_collection_out_order_kept_bbox_gone() {
        let path = temp_path("collection.geojson");
        fs::write(
            &path,
            r#"{"type":"FeatureCollection","bbox":[0,0,30,10],"features":[
                {"type":"Feature","id":1,"properties":{"n":1},
                 "geometry":{"type":"Polygon","coordinates":[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}},
                {"type":"Feature","id":2,"properties":{"n":2},
                 "geometry":{"type":"Polygon","coordinates":[[[20,0],[30,0],[30,10],[20,10],[20,0]]]}}]}"#,
        )
        .unwrap();
        let (code, out, _) = drive(&["-i", path.to_str().unwrap()], "");
        let _ = fs::remove_file(&path);
        assert_eq!(code, 0);
        assert!(!out.contains("bbox"), "{out}");
        assert!(out.contains("\"coordinates\":[5,5]"), "{out}");
        assert!(out.contains("\"coordinates\":[25,5]"), "{out}");
        assert!(
            out.find("[5,5]").unwrap() < out.find("[25,5]").unwrap(),
            "{out}"
        );
    }

    #[test]
    fn feature_collection_in_with_format_wkt_one_line_per_feature_in_order() {
        let (code, out, _) = drive(
            &[
                "-f",
                "wkt",
                "-i",
                r#"{"type":"FeatureCollection","features":[
                    {"type":"Feature","properties":null,
                     "geometry":{"type":"Polygon","coordinates":[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}},
                    {"type":"Feature","properties":null,
                     "geometry":{"type":"Polygon","coordinates":[]}}]}"#,
            ],
            "",
        );
        assert_eq!(code, 0);
        assert_eq!(out, "POINT (5 5)\nPOINT EMPTY\n");
    }

    #[test]
    fn an_empty_result_stays_inside_the_envelope() {
        let (code, out, _) = drive(
            &[
                "-i",
                r#"{"type":"FeatureCollection","features":[
                    {"type":"Feature","properties":{"n":1},
                     "geometry":{"type":"Polygon","coordinates":[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}},
                    {"type":"Feature","properties":{"n":2},
                     "geometry":{"type":"Polygon","coordinates":[]}}]}"#,
            ],
            "",
        );
        assert_eq!(code, 0);
        assert!(out.contains("\"geometry\":null"), "{out}");
        assert_eq!(out.matches("\"type\":\"Feature\"").count(), 2, "{out}");
    }

    /// Numbers survive the round trip in `JSON.stringify` form at every depth,
    /// whatever shape they were written in.
    #[test]
    fn property_numbers_come_back_out_the_way_json_stringify_writes_them() {
        let (code, out, _) = drive(
            &[
                "-i",
                r#"{"type":"Feature","properties":{"a":1.0,"b":2.50,"c":1e2,"d":3,"e":-0,
                    "nest":{"x":4.0,"y":[1.0,1e21]}},
                    "geometry":{"type":"Polygon","coordinates":[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}}"#,
            ],
            "",
        );
        assert_eq!(code, 0);
        assert_eq!(
            out,
            "{\"type\":\"Feature\",\"properties\":{\"a\":1,\"b\":2.5,\"c\":100,\"d\":3,\"e\":0,\
             \"nest\":{\"x\":4,\"y\":[1,1e+21]}},\
             \"geometry\":{\"type\":\"Point\",\"coordinates\":[5,5]}}\n"
        );
    }

    #[test]
    fn reads_stdin_when_input_is_absent() {
        let (code, out, _) = drive(&[], "POINT (1 2)");
        assert_eq!(code, 0);
        assert_eq!(out, "{\"type\":\"Point\",\"coordinates\":[1,2]}\n");
    }

    #[test]
    fn output_writes_the_file_and_nothing_reaches_stdout() {
        let path = temp_path("run-output.txt");
        let (code, out, _) = drive(
            &[
                "-f",
                "wkt",
                "-o",
                path.to_str().unwrap(),
                "-i",
                "POINT (1 2)",
            ],
            "",
        );
        let written = fs::read_to_string(&path).unwrap();
        let _ = fs::remove_file(&path);
        assert_eq!(code, 0);
        assert!(out.is_empty());
        assert_eq!(written, "POINT (1 2)\n");
    }

    #[test]
    fn quiet_suppresses_the_result_entirely_and_beats_output() {
        let path = temp_path("must-not-exist.txt");
        let _ = fs::remove_file(&path);
        let (code, out, err) = drive(
            &["-q", "-o", path.to_str().unwrap(), "-i", "POINT (1 2)"],
            "",
        );
        assert_eq!(code, 0);
        assert!(out.is_empty());
        assert!(err.is_empty());
        assert!(!path.exists(), "--quiet must beat --output");
    }

    #[test]
    fn help_prints_usage_to_out_and_exits_zero() {
        let (code, out, err) = drive(&["--help"], "");
        assert_eq!(code, 0);
        assert!(out.contains("--input"), "{out}");
        assert!(err.is_empty());
    }

    #[test]
    fn unparseable_geometry_exit_one_stdout_empty_stderr_non_empty() {
        let (code, out, err) = drive(&["-i", "NOTAGEOM (1 2)"], "");
        assert_eq!(code, 1);
        assert!(out.is_empty());
        assert!(!err.is_empty());
    }

    #[test]
    fn missing_file_exit_one_stdout_empty_stderr_non_empty() {
        let (code, out, err) = drive(&["-i", "/nope/missing.geojson"], "");
        assert_eq!(code, 1);
        assert!(out.is_empty());
        assert!(!err.is_empty());
    }

    #[test]
    fn unwritable_output_path_exit_one_stdout_empty_stderr_non_empty() {
        let path = temp_path("no-such-dir").join("output.txt");
        let (code, out, err) = drive(&["-o", path.to_str().unwrap(), "-i", "POINT (1 2)"], "");
        assert_eq!(code, 1);
        assert!(out.is_empty());
        assert!(!err.is_empty());
    }

    #[test]
    fn unknown_flag_exit_one_stdout_empty_usage_on_stderr() {
        let (code, out, err) = drive(&["--bogus"], "");
        assert_eq!(code, 1);
        assert!(out.is_empty());
        assert!(err.contains("--input"), "{err}");
        assert_eq!(err.matches("Usage:").count(), 1, "{err}");
    }
}
