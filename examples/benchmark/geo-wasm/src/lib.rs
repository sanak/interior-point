mod flat;

use geo::{Geometry, InteriorPoint, Point};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

#[wasm_bindgen(module = "/js/flatten.js")]
extern "C" {
    /// Returns `[coords: Float64Array, structure: Uint32Array]`, or throws a `TypeError`.
    #[wasm_bindgen(js_name = "flattenGeometry", catch)]
    fn flatten_geometry(geometry: &JsValue) -> Result<js_sys::Array, JsValue>;
}

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

fn point_to_js(point: Point<f64>) -> JsValue {
    let arr = js_sys::Array::new();
    arr.push(&JsValue::from_f64(point.x()));
    arr.push(&JsValue::from_f64(point.y()));
    arr.into()
}

fn is_nullish(value: &JsValue) -> bool {
    value.is_null() || value.is_undefined()
}

#[wasm_bindgen]
pub fn interior_point(geometry: &JsValue) -> Result<JsValue, JsValue> {
    if is_nullish(geometry) {
        return Ok(JsValue::NULL);
    }
    let geo_geom = js_to_geometry(geometry)?;
    match geo_geom.interior_point() {
        Some(point) => Ok(point_to_js(point)),
        None => Ok(JsValue::NULL),
    }
}
