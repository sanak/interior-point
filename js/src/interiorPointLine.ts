import type { Geometry, Position } from "geojson";

/**
 * Computes an interior point of a line geometry (LineString/MultiLineString).
 *
 * Algorithm (ported from JTS InteriorPointLine.java):
 * 1. Compute the centroid of all linear components.
 * 2. Find the interior vertex (not an endpoint) closest to the centroid.
 * 3. If no interior vertices exist, fall back to the closest endpoint.
 *
 * @param geometry - A GeoJSON geometry (LineString, MultiLineString, or GeometryCollection containing lines)
 * @returns A position [x, y] on the geometry, or null if the geometry has no linear components
 */
export function interiorPointLine(geometry: Geometry): Position | null {
  const lines = collectLineCoords(geometry);
  if (lines.length === 0) return null;

  const centroid = computeLineCentroid(lines);

  // Phase 1: try interior vertices (indices 1..n-2)
  let best: Position | null = null;
  let bestDist = Infinity;

  for (const coords of lines) {
    for (let i = 1; i < coords.length - 1; i++) {
      const dist = distanceSq(coords[i], centroid);
      if (dist < bestDist) {
        bestDist = dist;
        best = coords[i];
      }
    }
  }

  // Phase 2: fall back to endpoints if no interior vertices found
  if (best === null) {
    for (const coords of lines) {
      for (const p of [coords[0], coords[coords.length - 1]]) {
        const dist = distanceSq(p, centroid);
        if (dist < bestDist) {
          bestDist = dist;
          best = p;
        }
      }
    }
  }

  return best;
}

/** Recursively collect coordinate arrays from all linear components. */
function collectLineCoords(geometry: Geometry): Position[][] {
  switch (geometry.type) {
    case "LineString":
      return geometry.coordinates.length > 0 ? [geometry.coordinates] : [];
    case "MultiLineString":
      return geometry.coordinates.filter((c) => c.length > 0);
    case "GeometryCollection":
      return geometry.geometries.flatMap(collectLineCoords);
    default:
      return [];
  }
}

/**
 * Compute the length-weighted centroid of line segments.
 * Each segment's midpoint is weighted by its length.
 */
function computeLineCentroid(lines: Position[][]): Position {
  let totalLen = 0;
  let cx = 0;
  let cy = 0;

  for (const coords of lines) {
    for (let i = 0; i < coords.length - 1; i++) {
      const dx = coords[i + 1][0] - coords[i][0];
      const dy = coords[i + 1][1] - coords[i][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      totalLen += len;
      cx += (len * (coords[i][0] + coords[i + 1][0])) / 2;
      cy += (len * (coords[i][1] + coords[i + 1][1])) / 2;
    }
  }

  if (totalLen === 0) {
    // Degenerate: all zero-length segments — use first point
    return lines[0][0];
  }
  return [cx / totalLen, cy / totalLen];
}

function distanceSq(a: Position, b: Position): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}
