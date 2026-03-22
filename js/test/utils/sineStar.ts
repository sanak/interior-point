/**
 * SineStar polygon generator and precision reducer.
 * Ported from JTS SineStarFactory.java and GeometryPrecisionReducer.
 */
import type { Polygon, Position } from "geojson";

/**
 * Generate a SineStar polygon (port of JTS SineStarFactory.createSineStar).
 *
 * Creates a polygon shaped like a star with sinusoidal arms.
 * The polygon has `nPts` vertices distributed around a circle,
 * with the radius modulated by a sine wave to create arm-like protrusions.
 */
export function createSineStar(
  centreX: number,
  centreY: number,
  size: number,
  nPts: number,
  nArms: number,
  armRatio: number,
): Polygon {
  const radius = size / 2.0;
  const clampedRatio = Math.max(0.0, Math.min(1.0, armRatio));
  const armMaxLen = clampedRatio * radius;
  const insideRadius = (1 - clampedRatio) * radius;

  const coords: Position[] = [];
  for (let i = 0; i < nPts; i++) {
    const ptArcFrac = (i / nPts) * nArms;
    const armAngFrac = ptArcFrac - Math.floor(ptArcFrac);
    const armAng = 2 * Math.PI * armAngFrac;
    const armLenFrac = (Math.cos(armAng) + 1.0) / 2.0;
    const curveRadius = insideRadius + armMaxLen * armLenFrac;

    const ang = i * ((2 * Math.PI) / nPts);
    const x = curveRadius * Math.cos(ang) + centreX;
    const y = curveRadius * Math.sin(ang) + centreY;
    coords.push([x, y]);
  }
  // Close the ring
  coords.push([coords[0][0], coords[0][1]]);

  return { type: "Polygon", coordinates: [coords] };
}

/**
 * Reduce coordinate precision (port of JTS GeometryPrecisionReducer).
 * Rounds each coordinate to: round(coord * scale) / scale
 */
export function reducePrecision(polygon: Polygon, scale: number): Polygon {
  const reduced = polygon.coordinates.map((ring) =>
    ring.map(([x, y]) => [Math.round(x * scale) / scale, Math.round(y * scale) / scale] as Position),
  );
  return { type: "Polygon", coordinates: reduced };
}
