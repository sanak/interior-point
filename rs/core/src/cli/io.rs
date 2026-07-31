//! Input and output for the interior-point CLI. Both halves of format
//! knowledge live here: this module turns bytes into an `Input` and turns an
//! `InputKind` plus the computed points back into bytes, so `run` never names
//! a format.
//!
//! @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
//!   prior art for this CLI's surface; the code is original, nothing is ported.

use std::fmt;
use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::str::FromStr;

use geo_types::{Coord, Geometry};
use serde::Deserialize;
use serde_json_lenient::{Map, Value};

use super::args::OutputFormat;

/// The members of a JSON object, in the order they were read.
///
/// `serde_json::Value` cannot carry that order here. Its `Map` is a `BTreeMap`
/// unless serde_json's `preserve_order` feature is on, that feature is additive
/// across the whole dependency graph, and it also turns `Map::remove` into
/// `swap_remove` — which `geojson` 0.24's Feature parser calls for `type`,
/// `geometry`, `properties`, `id` and `bbox`, so turning it on would scramble
/// the remaining members rather than order them. `serde_json_lenient` is a
/// separate crate whose own `preserve_order` feature reaches nothing else.
pub type Members = Map<String, Value>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputKind {
    Geometry,
    Feature,
    FeatureCollection,
}

/// One input geometry with the envelope metadata it arrived in. `meta` is every
/// member of the source Feature except `type`, `bbox` and `geometry`, in input
/// order, and is `None` when the input was a bare geometry.
#[derive(Debug)]
pub struct InputRecord {
    pub geometry: Option<Geometry<f64>>,
    pub meta: Option<Members>,
}

#[derive(Debug)]
pub struct Input {
    pub kind: InputKind,
    pub records: Vec<InputRecord>,
}

/// Unreadable input or an unparseable geometry.
#[derive(Debug)]
pub struct InputError(pub String);

impl fmt::Display for InputError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for InputError {}

const GEOMETRY_TYPES: [&str; 7] = [
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
    "GeometryCollection",
];

/// A leading `{` marks a GeoJSON literal, an existing path marks a file, and
/// anything else is a WKT literal. A file's contents are classified by the
/// same rule.
pub fn read_input(
    input_arg: Option<&str>,
    read_stdin: &mut dyn FnMut() -> io::Result<String>,
) -> Result<Input, InputError> {
    let text = match input_arg {
        None => read_stdin().map_err(|e| InputError(e.to_string()))?,
        Some(arg) if is_geojson(arg) => arg.to_string(),
        Some(arg) if Path::new(arg).is_file() => {
            fs::read_to_string(arg).map_err(|e| InputError(format!("{arg}: {e}")))?
        }
        Some(arg) => arg.to_string(),
    };
    if is_geojson(&text) {
        parse_geojson(&text)
    } else {
        parse_wkt(&text)
    }
}

fn is_geojson(text: &str) -> bool {
    text.trim_start().starts_with('{')
}

fn parse_wkt(text: &str) -> Result<Input, InputError> {
    let parsed = wkt::Wkt::<f64>::from_str(text.trim()).map_err(|e| InputError(e.to_string()))?;
    let geometry: Geometry<f64> = parsed.try_into().map_err(|e| InputError(format!("{e}")))?;
    Ok(Input {
        kind: InputKind::Geometry,
        records: vec![InputRecord {
            geometry: Some(geometry),
            meta: None,
        }],
    })
}

/// Parses strict JSON — what `JSON.parse`, and so the TypeScript CLI, accepts.
///
/// `serde_json_lenient::from_str` is not that: its `Deserializer` is built with
/// `ignore_trailing_commas` and `allow_comments` both on, so it would take input
/// the other CLI rejects. Both are switched off here, and `end()` reproduces the
/// consumed-the-whole-input check `from_str` makes once the value is read.
fn parse_json(text: &str) -> Result<Value, serde_json_lenient::Error> {
    let mut deserializer = serde_json_lenient::Deserializer::from_str(text);
    deserializer.set_ignore_trailing_commas(false);
    deserializer.set_allow_comments(false);
    let value = Value::deserialize(&mut deserializer)?;
    deserializer.end()?;
    Ok(value)
}

fn parse_geojson(text: &str) -> Result<Input, InputError> {
    let value = parse_json(text).map_err(|e| InputError(format!("Invalid JSON: {e}")))?;
    match type_member(&value) {
        Some("FeatureCollection") => {
            let features = value
                .get("features")
                .and_then(Value::as_array)
                .ok_or_else(|| InputError("FeatureCollection has no features array".to_string()))?;
            Ok(Input {
                kind: InputKind::FeatureCollection,
                records: features
                    .iter()
                    .map(split_feature)
                    .collect::<Result<Vec<_>, _>>()?,
            })
        }
        Some("Feature") => Ok(Input {
            kind: InputKind::Feature,
            records: vec![split_feature(&value)?],
        }),
        Some(name) if GEOMETRY_TYPES.contains(&name) => Ok(Input {
            kind: InputKind::Geometry,
            records: vec![InputRecord {
                geometry: Some(parse_geometry(&value)?),
                meta: None,
            }],
        }),
        other => Err(InputError(format!(
            "Unsupported GeoJSON type '{}'",
            other.unwrap_or("undefined")
        ))),
    }
}

fn type_member(value: &Value) -> Option<&str> {
    value.get("type").and_then(Value::as_str)
}

/// Hands one geometry member to `geojson`, whose own reader owns every geometry
/// shape. The member is re-rendered rather than passed as a value because
/// `geojson` reads `serde_json`'s tree and this module reads an ordered one;
/// both writers are exact for `f64`, so no coordinate moves in the process.
fn parse_geometry(value: &Value) -> Result<Geometry<f64>, InputError> {
    let text = serde_json_lenient::to_string(value).map_err(|e| InputError(e.to_string()))?;
    let parsed = geojson::Geometry::from_str(&text).map_err(|e| InputError(e.to_string()))?;
    Geometry::<f64>::try_from(parsed).map_err(|e| InputError(e.to_string()))
}

/// Splits a Feature into its geometry and everything worth carrying to the
/// output. `properties`, `id` and foreign members survive in input order;
/// `bbox` is dropped deliberately — it described the input geometry, and
/// carrying it past the substitution would wrap a box around a single point.
fn split_feature(value: &Value) -> Result<InputRecord, InputError> {
    let members = match (type_member(value), value.as_object()) {
        (Some("Feature"), Some(members)) => members,
        _ => return Err(InputError("Expected a Feature".to_string())),
    };
    let mut meta = Members::new();
    let mut geometry = None;
    for (key, member) in members {
        match key.as_str() {
            "geometry" => {
                if !member.is_null() {
                    geometry = Some(parse_geometry(member)?);
                }
            }
            "type" | "bbox" => {}
            _ => {
                meta.insert(key.clone(), member.clone());
            }
        }
    }
    Ok(InputRecord {
        geometry,
        meta: Some(meta),
    })
}

/// One computed interior point with the envelope metadata its input arrived in.
#[derive(Debug)]
pub struct OutputRecord {
    pub point: Option<Coord<f64>>,
    pub meta: Option<Members>,
}

/// GeoJSON output preserves the envelope the input arrived in; WKT output
/// ignores the envelope and emits one line per record.
pub fn serialize(kind: InputKind, records: Vec<OutputRecord>, format: OutputFormat) -> String {
    match format {
        OutputFormat::Wkt => records
            .iter()
            .map(|r| format!("{}\n", point_wkt(r.point)))
            .collect(),
        OutputFormat::Geojson => {
            let value = match kind {
                InputKind::Geometry => {
                    point_geometry(records.first().and_then(|record| record.point))
                }
                InputKind::Feature => {
                    let record = records.into_iter().next().unwrap_or(OutputRecord {
                        point: None,
                        meta: None,
                    });
                    feature_for(record)
                }
                InputKind::FeatureCollection => {
                    let mut collection = Members::new();
                    collection.insert("type".to_string(), Value::from("FeatureCollection"));
                    collection.insert(
                        "features".to_string(),
                        Value::Array(records.into_iter().map(feature_for).collect()),
                    );
                    Value::Object(collection)
                }
            };
            format!("{value}\n")
        }
    }
}

/// `type` leads and `geometry` trails, with the metadata the input carried in
/// between, in its original order.
fn feature_for(record: OutputRecord) -> Value {
    let mut members = Members::new();
    members.insert("type".to_string(), Value::from("Feature"));
    if let Some(meta) = record.meta {
        for (key, value) in meta {
            members.insert(key, value);
        }
    }
    members.insert("geometry".to_string(), point_geometry(record.point));
    Value::Object(members)
}

fn point_geometry(point: Option<Coord<f64>>) -> Value {
    match point {
        None => Value::Null,
        Some(p) => {
            let mut members = Members::new();
            members.insert("type".to_string(), Value::from("Point"));
            members.insert(
                "coordinates".to_string(),
                Value::Array(vec![Value::from(p.x), Value::from(p.y)]),
            );
            Value::Object(members)
        }
    }
}

/// @jts-adapter WKTWriter — JTS writes a space between the type name and the
///   coordinate list, and writes `POINT EMPTY` for an empty point. The `wkt`
///   crate writes neither: it omits the space, and `geo_types::Point<f64>` has
///   no empty value to hand it. Both shapes are produced here instead.
fn point_wkt(point: Option<Coord<f64>>) -> String {
    match point {
        Some(p) => format!("POINT ({} {})", p.x, p.y),
        None => "POINT EMPTY".to_string(),
    }
}

pub fn write_output(text: &str, output_path: Option<&str>, out: &mut dyn Write) -> io::Result<()> {
    match output_path {
        Some(path) => fs::write(path, text),
        None => out.write_all(text.as_bytes()),
    }
}
