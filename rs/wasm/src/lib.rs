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

/// True for the two JS values the TypeScript port spells `null`. `undefined`
/// reaches here from an omitted argument, which `null` covers on the TS side.
fn is_nullish(value: &JsValue) -> bool {
    value.is_null() || value.is_undefined()
}

/// Converts a JS `[x, y]` array into a `Coord`. A nullish input is `None`,
/// matching the `Coordinate | null` the TypeScript port takes.
fn js_to_coord(input: &JsValue) -> Result<Option<geo_types::Coord<f64>>, JsValue> {
    if is_nullish(input) {
        return Ok(None);
    }
    let arr: js_sys::Array = input
        .clone()
        .dyn_into()
        .map_err(|_| JsValue::from_str("Expected a [x, y] array"))?;
    let x = arr
        .get(0)
        .as_f64()
        .ok_or_else(|| JsValue::from_str("Expected a number at [0]"))?;
    let y = arr
        .get(1)
        .as_f64()
        .ok_or_else(|| JsValue::from_str("Expected a number at [1]"))?;
    Ok(Some(geo_types::Coord { x, y }))
}

/// Computes an interior point of a GeoJSON geometry.
///
/// Accepts a GeoJSON Geometry object or `null`, and returns `[x, y]` or `null`.
/// For polygons, uses the scanline algorithm. For lines, finds the
/// vertex closest to centroid. For points, returns the point closest
/// to centroid.
#[wasm_bindgen(js_name = "interiorPoint")]
pub fn interior_point_wasm(geometry: &JsValue) -> Result<JsValue, JsValue> {
    if is_nullish(geometry) {
        return Ok(JsValue::NULL);
    }
    let geo_geom = js_to_geometry(geometry)?;
    match interior_point::interior_point(&geo_geom) {
        Some(coord) => Ok(coord_to_js(coord)),
        None => Ok(JsValue::NULL),
    }
}

/// Computes the geometry's centroid and returns it when it lies strictly
/// inside the geometry, falling back to `interiorPoint` when it does not.
///
/// Accepts a GeoJSON Geometry object or `null`, and returns `[x, y]` or `null`.
#[wasm_bindgen(js_name = "centroidFirstInteriorPoint")]
pub fn centroid_first_interior_point_wasm(geometry: &JsValue) -> Result<JsValue, JsValue> {
    if is_nullish(geometry) {
        return Ok(JsValue::NULL);
    }
    let geo_geom = js_to_geometry(geometry)?;
    match interior_point::centroid_first_interior_point(&geo_geom) {
        Some(coord) => Ok(coord_to_js(coord)),
        None => Ok(JsValue::NULL),
    }
}

/// Checks a computed point against the geometry it came from.
///
/// Takes `[x, y]` or `null` and a GeoJSON Geometry object or `null`. Returns
/// one of `"interior"`, `"on-geometry"`, `"off-geometry"` or `"unverifiable"`
/// — the four strings the TypeScript port's enum holds as its values, so a
/// caller can compare the two implementations' results directly.
#[wasm_bindgen(js_name = "verifyInteriorPoint")]
pub fn verify_interior_point_wasm(point: &JsValue, geometry: &JsValue) -> Result<String, JsValue> {
    let point = js_to_coord(point)?;
    let geometry = if is_nullish(geometry) {
        None
    } else {
        Some(js_to_geometry(geometry)?)
    };
    Ok(interior_point::verify_interior_point(point, geometry.as_ref()).to_string())
}

/// True when the outcome is a pass — the point lies on or in its geometry.
///
/// A free function taking the string, because that is the shape the outcome
/// arrives in on this side of the boundary. The crate's
/// `InteriorPointVerification::is_verified` is an inherent method and cannot be
/// reached from a string without a conversion the crate does not expose, so the
/// pass set is spelled out a second time here.
#[wasm_bindgen(js_name = "isVerified")]
pub fn is_verified_wasm(outcome: &str) -> bool {
    matches!(outcome, "interior" | "on-geometry")
}
