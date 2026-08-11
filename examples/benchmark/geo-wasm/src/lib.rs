use geo::{Geometry, InteriorPoint, Point};
use geojson::GeoJson;
use std::convert::TryFrom;
use wasm_bindgen::prelude::*;

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
        GeoJson::FeatureCollection(_) => Err(JsValue::from_str(
            "Expected a GeoJSON Geometry or Feature object",
        )),
    }
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
