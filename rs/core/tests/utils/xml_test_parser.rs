use geo_types::{Coord, Geometry};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::fs;
use std::str::FromStr;
use wkt::Wkt;

pub struct XmlTestCase {
    pub desc: String,
    pub input: Option<Geometry<f64>>,
    pub expected: Option<Coord<f64>>,
}

/// Normalize whitespace in WKT: collapse newlines, tabs, and multiple spaces into single spaces.
fn normalize_wkt(wkt: &str) -> String {
    wkt.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Remove EMPTY members from MULTI* WKT strings.
/// The `wkt` crate cannot parse `MULTIPOINT((0 0), EMPTY)` etc.
fn strip_multi_empty(wkt: &str) -> String {
    let upper = wkt.trim().to_uppercase();
    if !upper.starts_with("MULTI") {
        return wkt.to_string();
    }
    // After whitespace normalization, ", EMPTY" is the only pattern to match
    let mut result = wkt.to_string();
    while let Some(pos) = result.to_uppercase().find(", EMPTY") {
        result.replace_range(pos..pos + 7, "");
    }
    result
}

/// Parse a WKT string into a geo-types Geometry, returning None for EMPTY geometries.
fn parse_wkt_geometry(wkt: &str) -> Option<Geometry<f64>> {
    let normalized = normalize_wkt(wkt);
    // Check for top-level EMPTY (e.g. "POINT EMPTY", "POLYGON EMPTY")
    let upper = normalized.to_uppercase();
    if upper.ends_with(" EMPTY") && !upper.contains('(') {
        return None;
    }
    let preprocessed = strip_multi_empty(&normalized);
    let wkt_obj = Wkt::from_str(&preprocessed).ok()?;
    let geom: Geometry<f64> = wkt_obj.try_into().ok()?;
    Some(geom)
}

/// Parse a POINT WKT into a Coord, returning None for POINT EMPTY.
fn parse_expected_point(wkt: &str) -> Option<Coord<f64>> {
    let normalized = normalize_wkt(wkt);
    if normalized.to_uppercase() == "POINT EMPTY" {
        return None;
    }
    // Parse "POINT (x y)" or "POINT(x y)"
    let inner = normalized
        .trim()
        .strip_prefix("POINT")
        .unwrap()
        .trim()
        .strip_prefix('(')
        .unwrap()
        .strip_suffix(')')
        .unwrap()
        .trim();
    let parts: Vec<&str> = inner.split_whitespace().collect();
    Some(Coord {
        x: parts[0].parse().unwrap(),
        y: parts[1].parse().unwrap(),
    })
}

/// Parse JTS TestInteriorPoint.xml and return test cases.
pub fn parse_test_interior_point_xml(path: &str) -> Vec<XmlTestCase> {
    let xml = fs::read_to_string(path).unwrap_or_else(|e| panic!("Failed to read {path}: {e}"));
    let mut reader = Reader::from_str(&xml);

    let mut cases = Vec::new();
    let mut in_case = false;
    let mut current_tag = String::new();
    let mut desc = String::new();
    let mut input_wkt = String::new();
    let mut expected_wkt = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "case" => {
                        in_case = true;
                        desc.clear();
                        input_wkt.clear();
                        expected_wkt.clear();
                    }
                    "desc" | "a" | "op" => {
                        if in_case {
                            current_tag = name;
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_case {
                    let text = e.unescape().unwrap().to_string();
                    match current_tag.as_str() {
                        "desc" => desc.push_str(&text),
                        "a" => input_wkt.push_str(&text),
                        "op" => expected_wkt.push_str(&text),
                        _ => {}
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "case" && in_case {
                    cases.push(XmlTestCase {
                        desc: desc.trim().to_string(),
                        input: parse_wkt_geometry(&input_wkt),
                        expected: parse_expected_point(&expected_wkt),
                    });
                    in_case = false;
                }
                if name == current_tag {
                    current_tag.clear();
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => panic!("XML parse error: {e}"),
            _ => {}
        }
    }

    cases
}
