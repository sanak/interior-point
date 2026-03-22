import type { Geometry, Position } from "geojson";

/**
 * Computes an interior point of a point geometry (Point/MultiPoint).
 *
 * The computed point is the point closest to the centroid of the geometry.
 * Ported from JTS InteriorPointPoint.java.
 *
 * @param geometry - A GeoJSON geometry (Point, MultiPoint, or GeometryCollection containing points)
 * @returns A position [x, y], or null if the geometry has no puntal components
 */
export function interiorPointPoint(geometry: Geometry): Position | null {
  const points = collectPoints(geometry);
  if (points.length === 0) return null;

  const centroid = computeCentroid(points);
  return findClosest(points, centroid);
}

/** Recursively collect all Point coordinates from the geometry. */
function collectPoints(geometry: Geometry): Position[] {
  switch (geometry.type) {
    case "Point":
      return geometry.coordinates.length > 0 ? [geometry.coordinates] : [];
    case "MultiPoint":
      return geometry.coordinates.filter((c) => c.length > 0);
    case "GeometryCollection":
      return geometry.geometries.flatMap(collectPoints);
    default:
      // Non-point geometry types are ignored
      return [];
  }
}

/** Compute the arithmetic-mean centroid of a set of positions. */
function computeCentroid(points: Position[]): Position {
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p[0];
    sumY += p[1];
  }
  return [sumX / points.length, sumY / points.length];
}

/** Find the point closest to the target using squared Euclidean distance. */
function findClosest(points: Position[], target: Position): Position {
  let best: Position = points[0];
  let bestDist = Infinity;
  for (const p of points) {
    const dx = p[0] - target[0];
    const dy = p[1] - target[1];
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}
