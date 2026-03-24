//! WASM bindings for the interior point algorithm.
//!
//! Exposes the interior point functions to JavaScript via wasm-bindgen.
//! Input is a GeoJSON Geometry object (as a JS value), and the output
//! is a `[x, y]` array or `null` if the geometry is empty.

use geo_types::Geometry;
use geojson::GeoJson;
use std::convert::TryFrom;
use wasm_bindgen::prelude::*;

/// Converts a JsValue (GeoJSON Geometry object) into a `geo::Geometry<f64>`.
fn js_to_geometry(input: &JsValue) -> Result<Geometry<f64>, JsValue> {
    let geojson_str: String = js_sys::JSON::stringify(input)
        .map(|s: js_sys::JsString| String::from(s))
        .map_err(|_| JsValue::from_str("Failed to stringify input"))?;

    let geojson: GeoJson = geojson_str
        .parse()
        .map_err(|e: geojson::Error| JsValue::from_str(&format!("Invalid GeoJSON: {e}")))?;

    match geojson {
        GeoJson::Geometry(geom) => {
            let geo_geom = Geometry::try_from(geom)
                .map_err(|e| JsValue::from_str(&format!("Geometry conversion error: {e}")))?;
            Ok(geo_geom)
        }
        GeoJson::Feature(feature) => {
            let geom = feature
                .geometry
                .ok_or_else(|| JsValue::from_str("Feature has no geometry"))?;
            let geo_geom = Geometry::try_from(geom)
                .map_err(|e| JsValue::from_str(&format!("Geometry conversion error: {e}")))?;
            Ok(geo_geom)
        }
        _ => Err(JsValue::from_str(
            "Expected a GeoJSON Geometry or Feature object",
        )),
    }
}

/// Converts a `geo::Coord` to a JS array `[x, y]`.
fn coord_to_js(coord: geo_types::Coord<f64>) -> JsValue {
    let arr = js_sys::Array::new();
    arr.push(&JsValue::from_f64(coord.x));
    arr.push(&JsValue::from_f64(coord.y));
    arr.into()
}

/// Computes an interior point of a GeoJSON geometry.
///
/// Accepts a GeoJSON Geometry object and returns `[x, y]` or `null`.
/// For polygons, uses the scanline algorithm. For lines, finds the
/// vertex closest to centroid. For points, returns the point closest
/// to centroid.
#[wasm_bindgen(js_name = "interiorPoint")]
pub fn interior_point_wasm(geometry: &JsValue) -> Result<JsValue, JsValue> {
    let geo_geom = js_to_geometry(geometry)?;
    match interior_point::interior_point(&geo_geom) {
        Some(coord) => Ok(coord_to_js(coord)),
        None => Ok(JsValue::NULL),
    }
}
