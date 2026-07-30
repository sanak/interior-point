//! In-process tests for the interior-point CLI: flag parsing, io, and run().
//!
//! @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
//!   prior art for the surface under test; the cases are original.

use interior_point::cli::args::{CliOptions, OutputFormat, help_text, parse_cli_args};
use interior_point::cli::io::{
    Input, InputKind, OutputRecord, read_input, serialize, write_output,
};

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
        assert!(meta.bbox.is_none());
        assert!(meta.geometry.is_none());
        assert_eq!(meta.id, Some(geojson::feature::Id::String("a".to_string())));
        assert_eq!(
            meta.properties.as_ref().unwrap()["name"],
            geojson::JsonValue::from("x")
        );
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
        assert!(matches!(
            input.records[0].meta.as_ref().unwrap().id,
            Some(geojson::feature::Id::Number(_))
        ));
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

    fn feature_with(id: &str, key: &str, value: i64) -> geojson::Feature {
        let mut properties = geojson::JsonObject::new();
        properties.insert(key.to_string(), geojson::JsonValue::from(value));
        geojson::Feature {
            bbox: None,
            geometry: None,
            id: Some(geojson::feature::Id::String(id.to_string())),
            properties: Some(properties),
            foreign_members: None,
        }
    }

    #[test]
    fn serialises_a_geometry_kind_point_as_bare_geojson() {
        let records = vec![OutputRecord {
            point: Some(coord! { x: 5.0, y: 5.0 }),
            meta: None,
        }];
        assert_eq!(
            serialize(InputKind::Geometry, records, OutputFormat::Geojson),
            "{\"type\":\"Point\",\"coordinates\":[5.0,5.0]}\n"
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
            "{\"type\":\"Feature\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[5.0,5.0]},\
             \"properties\":{\"n\":1},\"id\":\"a\"}\n"
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
