import type { Geometry, Position } from "geojson";

/**
 * Computes an interior point of an area geometry (Polygon/MultiPolygon)
 * using a scanline algorithm ported from JTS InteriorPointArea.java.
 *
 * The computed point is guaranteed to lie inside the polygon
 * (except for certain degenerate/zero-area cases).
 *
 * @param geometry - A GeoJSON geometry (Polygon, MultiPolygon, or GeometryCollection containing areas)
 * @returns A position [x, y] inside the geometry, or null if the geometry has no areal components
 */
export function interiorPointArea(geometry: Geometry): Position | null {
  let interiorPoint: Position | null = null;
  let maxWidth = -1;

  processGeometry(geometry);
  return interiorPoint;

  function processGeometry(geom: Geometry): void {
    switch (geom.type) {
      case "Polygon":
        processPolygon(geom.coordinates);
        break;
      case "MultiPolygon":
        for (const polyCoords of geom.coordinates) {
          processPolygon(polyCoords);
        }
        break;
      case "GeometryCollection":
        for (const g of geom.geometries) {
          processGeometry(g);
        }
        break;
    }
  }

  function processPolygon(rings: Position[][]): void {
    if (rings.length === 0 || rings[0].length === 0) return;

    const exteriorRing = rings[0];
    const interiorRings = rings.slice(1);

    // Default interior point for zero-area polygons
    const defaultPoint: Position = [exteriorRing[0][0], exteriorRing[0][1]];

    const scanY = findScanLineY(exteriorRing, interiorRings);
    const crossings: number[] = [];

    scanRing(exteriorRing, scanY, crossings);
    for (const hole of interiorRings) {
      scanRing(hole, scanY, crossings);
    }

    // Find best midpoint from crossings
    if (crossings.length === 0) {
      // Zero-area polygon — use default point (first coordinate)
      if (maxWidth < 0) {
        maxWidth = 0;
        interiorPoint = defaultPoint;
      }
      return;
    }

    crossings.sort((a, b) => a - b);

    let bestWidth = 0;
    let bestPoint: Position = defaultPoint;

    for (let i = 0; i < crossings.length - 1; i += 2) {
      const x1 = crossings[i];
      const x2 = crossings[i + 1];
      const width = x2 - x1;
      if (width > bestWidth) {
        bestWidth = width;
        bestPoint = [(x1 + x2) / 2, scanY];
      }
    }

    if (bestWidth > maxWidth) {
      maxWidth = bestWidth;
      interiorPoint = bestPoint;
    }
  }
}

/**
 * Scan a ring's edges for intersections with a horizontal line at the given Y.
 */
function scanRing(ring: Position[], scanY: number, crossings: number[]): void {
  // Skip rings whose Y-extent doesn't include scanY
  if (!ringIntersectsY(ring, scanY)) return;

  for (let i = 1; i < ring.length; i++) {
    const p0 = ring[i - 1];
    const p1 = ring[i];
    addEdgeCrossing(p0, p1, scanY, crossings);
  }
}

function addEdgeCrossing(p0: Position, p1: Position, scanY: number, crossings: number[]): void {
  // Skip non-crossing segments
  if (!segmentIntersectsY(p0, p1, scanY)) return;
  if (!isEdgeCrossingCounted(p0, p1, scanY)) return;

  crossings.push(intersectionX(p0, p1, scanY));
}

/**
 * Determines if an edge crossing contributes to the crossing count.
 * Implements consistent topology rules to ensure correct inside/outside detection.
 */
function isEdgeCrossingCounted(p0: Position, p1: Position, scanY: number): boolean {
  const y0 = p0[1];
  const y1 = p1[1];
  // Skip horizontal lines
  if (y0 === y1) return false;
  // Downward segment does not include start point
  if (y0 === scanY && y1 < scanY) return false;
  // Upward segment does not include endpoint
  if (y1 === scanY && y0 < scanY) return false;
  return true;
}

/**
 * Compute the X-coordinate where a segment crosses a horizontal line at Y.
 */
function intersectionX(p0: Position, p1: Position, y: number): number {
  const x0 = p0[0];
  const x1 = p1[0];
  if (x0 === x1) return x0;

  const segDX = x1 - x0;
  const segDY = p1[1] - p0[1];
  const m = segDY / segDX;
  return x0 + (y - p0[1]) / m;
}

/** Tests if a ring's Y-extent includes the given Y. */
function ringIntersectsY(ring: Position[], y: number): boolean {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return y >= minY && y <= maxY;
}

/** Tests if a segment's Y-extent includes the given Y. */
function segmentIntersectsY(p0: Position, p1: Position, y: number): boolean {
  if (p0[1] > y && p1[1] > y) return false;
  if (p0[1] < y && p1[1] < y) return false;
  return true;
}

// ---------------------------------------------------------------------------
// ScanLineYOrdinateFinder
// ---------------------------------------------------------------------------

/**
 * Finds a Y-ordinate for the scan line that bisects the polygon's Y-extent
 * while avoiding all vertex Y-coordinates.
 *
 * Algorithm: start with the center of the bounding box Y-extent, then
 * narrow the interval [loY, hiY] to the closest vertex below and above
 * the center. Return the midpoint of that interval.
 */
function findScanLineY(exteriorRing: Position[], interiorRings: Position[][]): number {
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of exteriorRing) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }

  const centreY = (minY + maxY) / 2;

  // Initialize interval to full extent
  let loY = minY;
  let hiY = maxY;

  // Narrow interval by scanning all vertices
  updateInterval(exteriorRing, centreY);
  for (const ring of interiorRings) {
    updateInterval(ring, centreY);
  }

  return (hiY + loY) / 2;

  function updateInterval(ring: Position[], centre: number): void {
    for (const p of ring) {
      const y = p[1];
      if (y <= centre) {
        if (y > loY) loY = y;
      } else {
        if (y < hiY) hiY = y;
      }
    }
  }
}
