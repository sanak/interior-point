//! WASM bindings for the interior point algorithm.
//!
//! Exposes the interior point functions to JavaScript via wasm-bindgen.
//! Input is a GeoJSON Geometry object (as a JS value), and the output
//! is a `[x, y]` array or `null` if the geometry is empty.
//!
//! The geometry crosses the boundary as two typed arrays rather than as JSON text: `js/flatten.js`
//! flattens it on the JS side, so one call and two bulk copies replace a `JSON.stringify` and a
//! text parse. `flat.rs` turns those arrays back into a geometry.

mod flat;

use geo_types::Geometry;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

#[wasm_bindgen(module = "/js/flatten.js")]
extern "C" {
    /// Returns `[coords: Float64Array, structure: Uint32Array]`, or throws a `TypeError`.
    #[wasm_bindgen(js_name = "flattenGeometry", catch)]
    fn flatten_geometry(geometry: &JsValue) -> Result<js_sys::Array, JsValue>;
}

/// Converts a JsValue (GeoJSON Geometry object) into a `geo::Geometry<f64>`.
fn js_to_geometry(input: &JsValue) -> Result<Geometry<f64>, JsValue> {
    let pair = flatten_geometry(input)?;
    let coords: js_sys::Float64Array = pair
        .get(0)
        .dyn_into()
        .map_err(|_| JsValue::from_str("flattenGeometry did not return a Float64Array"))?;
    let structure: js_sys::Uint32Array = pair
        .get(1)
        .dyn_into()
        .map_err(|_| JsValue::from_str("flattenGeometry did not return a Uint32Array"))?;
    flat::decode(&coords.to_vec(), &structure.to_vec())
        .map_err(|e| JsValue::from_str(&format!("Invalid geometry: {e}")))
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
