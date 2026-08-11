import type { Feature, Geometry, Position } from "geojson";

/** True when a geometry carries no coordinates at all, at any depth. */
export function isEmptyGeometry(geometry: Geometry): boolean {
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.every(isEmptyGeometry);
  }
  if (geometry.type === "Point") {
    return geometry.coordinates.length === 0;
  }
  return countPositions(geometry.coordinates as unknown[]) === 0;
}

function countPositions(coordinates: unknown[]): number {
  if (coordinates.length === 0) return 0;
  if (typeof coordinates[0] === "number") return 1;
  return (coordinates as unknown[][]).reduce((total, part) => total + countPositions(part), 0);
}

/** Bounding box of every feature, as `[west, south, east, north]`, or null when there is nothing to bound. */
export function boundsOf(features: readonly Feature[]): [number, number, number, number] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const feature of features) {
    if (!feature.geometry) continue;
    for (const [x, y] of positionsOf(feature.geometry)) {
      if (x < west) west = x;
      if (x > east) east = x;
      if (y < south) south = y;
      if (y > north) north = y;
    }
  }

  return west === Infinity ? null : [west, south, east, north];
}

function* positionsOf(geometry: Geometry): Generator<Position> {
  if (geometry.type === "GeometryCollection") {
    for (const part of geometry.geometries) yield* positionsOf(part);
    return;
  }
  if (geometry.type === "Point") {
    if (geometry.coordinates.length > 0) yield geometry.coordinates;
    return;
  }
  yield* flatten(geometry.coordinates as unknown[]);
}

function* flatten(coordinates: unknown[]): Generator<Position> {
  if (coordinates.length === 0) return;
  if (typeof coordinates[0] === "number") {
    yield coordinates as Position;
    return;
  }
  for (const part of coordinates as unknown[][]) yield* flatten(part);
}
