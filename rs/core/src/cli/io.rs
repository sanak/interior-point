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
use geojson::{Feature, FeatureCollection, GeoJson};

use super::args::OutputFormat;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InputKind {
    Geometry,
    Feature,
    FeatureCollection,
}

/// One input geometry with the envelope metadata it arrived in. `meta` is the
/// source Feature with its geometry and bbox cleared, and is `None` when the
/// input was a bare geometry.
#[derive(Debug)]
pub struct InputRecord {
    pub geometry: Option<Geometry<f64>>,
    pub meta: Option<Feature>,
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

fn parse_geojson(text: &str) -> Result<Input, InputError> {
    let parsed: GeoJson = text
        .parse()
        .map_err(|e: geojson::Error| InputError(e.to_string()))?;
    match parsed {
        GeoJson::Geometry(g) => {
            let geometry = Geometry::<f64>::try_from(g).map_err(|e| InputError(e.to_string()))?;
            Ok(Input {
                kind: InputKind::Geometry,
                records: vec![InputRecord {
                    geometry: Some(geometry),
                    meta: None,
                }],
            })
        }
        GeoJson::Feature(f) => Ok(Input {
            kind: InputKind::Feature,
            records: vec![split_feature(f)?],
        }),
        GeoJson::FeatureCollection(fc) => {
            let records = fc
                .features
                .into_iter()
                .map(split_feature)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Input {
                kind: InputKind::FeatureCollection,
                records,
            })
        }
    }
}

/// Splits a Feature into its geometry and the envelope that carried it. `bbox`
/// is dropped here rather than at output: it described the input geometry, and
/// nothing downstream would catch it surviving a substitution.
fn split_feature(mut feature: Feature) -> Result<InputRecord, InputError> {
    let geometry = match feature.geometry.take() {
        None => None,
        Some(g) => Some(Geometry::<f64>::try_from(g).map_err(|e| InputError(e.to_string()))?),
    };
    feature.bbox = None;
    Ok(InputRecord {
        geometry,
        meta: Some(feature),
    })
}

/// One computed interior point with the envelope metadata its input arrived in.
#[derive(Debug)]
pub struct OutputRecord {
    pub point: Option<Coord<f64>>,
    pub meta: Option<Feature>,
}

/// GeoJSON output preserves the envelope the input arrived in; WKT output
/// ignores the envelope and emits one line per record.
pub fn serialize(kind: InputKind, records: Vec<OutputRecord>, format: OutputFormat) -> String {
    match format {
        OutputFormat::Wkt => records
            .iter()
            .map(|r| format!("{}\n", point_wkt(r.point)))
            .collect(),
        OutputFormat::Geojson => match kind {
            InputKind::Geometry => {
                let text = match records.first().and_then(|r| r.point) {
                    None => "null".to_string(),
                    Some(p) => point_geometry(p).to_string(),
                };
                format!("{text}\n")
            }
            InputKind::Feature => {
                let feature = records
                    .into_iter()
                    .map(feature_for)
                    .next()
                    .unwrap_or_else(empty_feature);
                format!("{feature}\n")
            }
            InputKind::FeatureCollection => {
                let collection = FeatureCollection {
                    bbox: None,
                    features: records.into_iter().map(feature_for).collect(),
                    foreign_members: None,
                };
                format!("{collection}\n")
            }
        },
    }
}

fn point_geometry(point: Coord<f64>) -> geojson::Geometry {
    // Wrapping in `Geometry::new` rather than serialising the `Value` directly
    // is what puts the `type` member first.
    geojson::Geometry::new(geojson::Value::Point(vec![point.x, point.y]))
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

fn feature_for(record: OutputRecord) -> Feature {
    let mut feature = record.meta.unwrap_or_else(empty_feature);
    feature.bbox = None;
    feature.geometry = record.point.map(point_geometry);
    feature
}

fn empty_feature() -> Feature {
    Feature {
        bbox: None,
        geometry: None,
        id: None,
        properties: None,
        foreign_members: None,
    }
}

pub fn write_output(text: &str, output_path: Option<&str>, out: &mut dyn Write) -> io::Result<()> {
    match output_path {
        Some(path) => fs::write(path, text),
        None => out.write_all(text.as_bytes()),
    }
}
