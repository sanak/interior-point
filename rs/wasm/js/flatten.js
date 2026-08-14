// Flattens a GeoJSON geometry into the one typed array the wasm bindings decode.
//
// This file is a wasm-bindgen JS snippet (`#[wasm_bindgen(module = "/js/flatten.js")]`), so it
// must stay a self-contained ES module: snippets cannot carry `import` statements.
//
// The buffer is [structureLength, ...structure, ...coords].
//
// structure holds a type tag followed by counts, in preorder. The tags are WKB's geometry type
//           codes, which GeoArrow's union type ids also follow, so no numbering is invented here.
// coords    holds every vertex in preorder as [x0, y0, x1, y1, ...].
//
// The counts share the coordinates' f64 slots because each one is an integer far below 2^53,
// where f64 is exact. Sending one array rather than a [Float64Array, Uint32Array] pair leaves
// the wasm side a single bulk copy to make instead of unpacking a JS array first.
const TAGS = {
  Point: 1,
  LineString: 2,
  Polygon: 3,
  MultiPoint: 4,
  MultiLineString: 5,
  MultiPolygon: 6,
  GeometryCollection: 7,
};

/**
 * @param {unknown} input a GeoJSON Geometry or Feature
 * @returns {Float64Array} `[structureLength, ...structure, ...coords]`
 */
export function flattenGeometry(input) {
  const coords = [];
  const structure = [];
  writeGeometry(unwrapFeature(input), coords, structure);
  const buffer = new Float64Array(1 + structure.length + coords.length);
  buffer[0] = structure.length;
  buffer.set(structure, 1);
  buffer.set(coords, 1 + structure.length);
  return buffer;
}

function unwrapFeature(input) {
  if (input === null || typeof input !== "object" || input.type !== "Feature") {
    return input;
  }
  if (input.geometry === null || input.geometry === undefined) {
    throw new TypeError("Feature has no geometry");
  }
  return input.geometry;
}

function writeGeometry(geometry, coords, structure) {
  const tag = geometry === null || typeof geometry !== "object" ? undefined : TAGS[geometry.type];
  if (tag === undefined) {
    throw new TypeError("Expected a GeoJSON Geometry or Feature object");
  }
  structure.push(tag);
  switch (tag) {
    case TAGS.Point:
      writePosition(geometry.coordinates, coords);
      break;
    case TAGS.LineString:
    case TAGS.MultiPoint:
      writePositions(geometry.coordinates, coords, structure);
      break;
    case TAGS.Polygon:
    case TAGS.MultiLineString:
      writeRings(geometry.coordinates, coords, structure);
      break;
    case TAGS.MultiPolygon:
      structure.push(geometry.coordinates.length);
      for (const polygon of geometry.coordinates) {
        writeRings(polygon, coords, structure);
      }
      break;
    case TAGS.GeometryCollection:
      structure.push(geometry.geometries.length);
      for (const child of geometry.geometries) {
        writeGeometry(child, coords, structure);
      }
      break;
    // Unreachable while every tag above has a case, which is the point: a tag added to TAGS and
    // not handled here stops loudly instead of being read as a GeometryCollection.
    default:
      throw new TypeError(`No encoding for geometry tag ${tag}`);
  }
}

// Every ring length goes down before any of their coordinates, so a decoder can size its
// buffers before it starts reading vertices.
function writeRings(rings, coords, structure) {
  structure.push(rings.length);
  for (const ring of rings) {
    structure.push(ring.length);
  }
  for (const ring of rings) {
    for (const position of ring) {
      writePosition(position, coords);
    }
  }
}

function writePositions(positions, coords, structure) {
  structure.push(positions.length);
  for (const position of positions) {
    writePosition(position, coords);
  }
}

// A third ordinate is dropped: geo_types::Coord<f64> carries no Z, which is what the previous
// geojson -> geo-types conversion did too.
//
// The guard reads the ordinate it is about to write rather than the position's length, which
// costs a comparison the write already paid for. Without it a short position reaches the buffer
// as undefined, Float64Array stores NaN, and the decoder hands the algorithm a point it cannot
// work with — the JSON boundary this replaced rejected the same input outright.
function writePosition(position, coords) {
  const y = position[1];
  if (y === undefined) {
    throw new TypeError("A position must contain two or more elements");
  }
  coords.push(position[0], y);
}
