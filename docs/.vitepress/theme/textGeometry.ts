import type { MultiPolygon, Position } from "geojson";
import { interiorPoint } from "interior-point";

/**
 * Turns typed text into one MultiPolygon per character, placed on the map.
 *
 * A character wants a MultiPolygon rather than a Polygon because glyphs genuinely
 * need one: `i` is a dot and a stem, two disjoint shells. Holes are just as real —
 * `o` has one, `8` has two — and they are what makes an interior point worth
 * showing, since a centroid falls straight through the counter of an `o`.
 *
 * Where the outlines come from is left to a {@link GlyphSource}. Nothing here
 * knows what a font is, which is what keeps this module about geometry alone.
 */

/** Glyph outlines are normalised to this em size before anything else runs. */
export const EM = 1000;

/**
 * How far a flattened chord may sit from the curve it replaces, in em units.
 *
 * The alternative — a fixed number of segments per curve — spends vertices
 * without regard to how long each curve is, so the long outer curve of an `o`
 * visibly facets while a short one is oversampled. A distance budget spends them
 * where the curve actually bends, and reaches a smoother outline with fewer
 * points. The em box renders about 214px tall in the hero, so 0.002em is roughly
 * 0.43px there.
 *
 * It is a constant rather than a function of zoom on purpose. Re-flattening as
 * the map zooms would change the polygon, and a different polygon has a different
 * widest scan line, so the interior point would drift while the letter stood
 * still — the one thing this demo must not show.
 */
export const TOLERANCE = 0.002 * EM;

/** A glyph outline segment, in the em-normalised space above, y pointing down. */
export type GlyphCommand =
  | { type: "M" | "L"; x: number; y: number }
  | { type: "Q"; x1: number; y1: number; x: number; y: number }
  | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: "Z" };

export interface Glyph {
  /** Pen advance for this character, in em units. */
  advance: number;
  commands: GlyphCommand[];
}

export interface GlyphSource {
  /** The outline of one character, or null when the source cannot draw it. */
  glyph(char: string): Glyph | null;

  /**
   * Loads whatever `text` needs and this source does not have yet.
   *
   * It exists so that `glyph` can stay synchronous: a source that reaches for a
   * second font when a character is out of the first one's range has somewhere
   * to await, and everything downstream of it stays a plain function. A source
   * that is complete the moment it is built simply omits this.
   */
  prepare?(text: string): Promise<void>;
}

export interface CharGeometry {
  char: string;
  geometry: MultiPolygon;
  /** What `interiorPoint` returned for that geometry, which is the point the demo plots. */
  point: Position | null;
}

const mid = (a: Position, b: Position): Position => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Squared distance from `p` to the segment `a`-`b`, the flatness test's measure. */
function chordDistanceSq(p: Position, a: Position, b: Position): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  return (p[0] - (a[0] + t * dx)) ** 2 + (p[1] - (a[1] + t * dy)) ** 2;
}

// Both curve flatteners bisect with de Casteljau until the control points sit
// within tolerance of the chord. The depth cap is a guard against a degenerate
// curve, not a quality setting; tolerance is reached long before it in practice.
const MAX_DEPTH = 16;

function flattenQuadratic(p0: Position, c: Position, p1: Position, tolSq: number, out: Position[], depth: number) {
  if (depth >= MAX_DEPTH || chordDistanceSq(c, p0, p1) <= tolSq) {
    out.push(p1);
    return;
  }
  const a = mid(p0, c);
  const b = mid(c, p1);
  const m = mid(a, b);
  flattenQuadratic(p0, a, m, tolSq, out, depth + 1);
  flattenQuadratic(m, b, p1, tolSq, out, depth + 1);
}

function flattenCubic(
  p0: Position,
  c1: Position,
  c2: Position,
  p1: Position,
  tolSq: number,
  out: Position[],
  depth: number,
) {
  if (depth >= MAX_DEPTH || (chordDistanceSq(c1, p0, p1) <= tolSq && chordDistanceSq(c2, p0, p1) <= tolSq)) {
    out.push(p1);
    return;
  }
  const a = mid(p0, c1);
  const b = mid(c1, c2);
  const c = mid(c2, p1);
  const d = mid(a, b);
  const e = mid(b, c);
  const m = mid(d, e);
  flattenCubic(p0, a, d, m, tolSq, out, depth + 1);
  flattenCubic(m, e, c, p1, tolSq, out, depth + 1);
}

/** Glyph commands to closed rings, still in em-normalised glyph space. */
function commandsToRings(commands: GlyphCommand[], tolerance: number): Position[][] {
  const tolSq = tolerance * tolerance;
  const rings: Position[][] = [];
  let ring: Position[] = [];
  let cursor: Position = [0, 0];

  const closeRing = () => {
    if (ring.length > 2) {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
      rings.push(ring);
    }
    ring = [];
  };

  for (const command of commands) {
    switch (command.type) {
      case "M":
        closeRing();
        cursor = [command.x, command.y];
        ring = [cursor];
        break;
      case "L":
        cursor = [command.x, command.y];
        ring.push(cursor);
        break;
      case "Q":
        flattenQuadratic(cursor, [command.x1, command.y1], [command.x, command.y], tolSq, ring, 0);
        cursor = [command.x, command.y];
        break;
      case "C":
        flattenCubic(
          cursor,
          [command.x1, command.y1],
          [command.x2, command.y2],
          [command.x, command.y],
          tolSq,
          ring,
          0,
        );
        cursor = [command.x, command.y];
        break;
      case "Z":
        closeRing();
        break;
    }
  }
  closeRing();
  return rings;
}

function isPointInRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringArea(ring: Position[]): number {
  let twice = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    twice += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(twice / 2);
}

/**
 * Sorts a glyph's rings into shells and their holes.
 *
 * Ring direction would answer this in one pass, but the convention is inverted
 * between the two outline formats a font may carry, so nesting is used instead:
 * a ring contained in an even number of the others is a shell. Each hole then
 * goes to the smallest shell containing it, which is what puts the two counters
 * of an `8` on the one shell that holds them.
 */
function ringsToPolygons(rings: Position[][]): Position[][][] {
  const shells = rings.filter(
    (ring) => rings.filter((other) => other !== ring && isPointInRing(ring[0], other)).length % 2 === 0,
  );
  const polygons: Position[][][] = shells.map((shell) => [shell]);
  for (const hole of rings) {
    if (shells.includes(hole)) continue;
    const owner = shells
      .map((shell, index) => ({ index, area: ringArea(shell) }))
      .filter(({ index }) => isPointInRing(hole[0], shells[index]))
      .sort((a, b) => a.area - b.area)[0];
    if (owner) polygons[owner.index].push(hole);
  }
  return polygons;
}

export interface Placement {
  /** Where the string is centred. */
  center: Position;
  /** Latitude degrees one em box spans. */
  emHeight: number;
}

/**
 * Builds one MultiPolygon per character and computes its interior point.
 *
 * Glyph space has y pointing down, so latitude runs the other way. Longitude is
 * additionally stretched by 1/cos(latitude): a degree of latitude covers that
 * many times the screen distance of a degree of longitude on a Mercator map, and
 * without the correction every letter would come out squashed.
 */
export function textToCharGeometries(text: string, source: GlyphSource, placement: Placement): CharGeometry[] {
  const characters = Array.from(text);
  const advances = characters.map((char) => (source.glyph(char)?.advance ?? 0.5 * EM) / EM);
  const totalAdvance = advances.reduce((sum, advance) => sum + advance, 0);

  const latitudeScale = placement.emHeight;
  const longitudeScale = placement.emHeight / Math.cos((placement.center[1] * Math.PI) / 180);

  const results: CharGeometry[] = [];
  let pen = -totalAdvance / 2;

  characters.forEach((char, index) => {
    const glyph = source.glyph(char);
    if (glyph) {
      const rings = commandsToRings(glyph.commands, TOLERANCE).map((ring) =>
        ring.map(
          ([x, y]) =>
            [
              placement.center[0] + (pen + x / EM) * longitudeScale,
              placement.center[1] - (y / EM) * latitudeScale,
            ] as Position,
        ),
      );
      if (rings.length > 0) {
        const geometry: MultiPolygon = { type: "MultiPolygon", coordinates: ringsToPolygons(rings) };
        results.push({ char, geometry, point: interiorPoint(geometry) });
      }
    }
    pen += advances[index];
  });

  return results;
}

/** The bounding box of everything drawn, for the map to fit to. */
export function boundsOf(charGeometries: CharGeometry[]): [Position, Position] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const { geometry } of charGeometries) {
    for (const polygon of geometry.coordinates) {
      for (const [longitude, latitude] of polygon[0]) {
        if (longitude < west) west = longitude;
        if (longitude > east) east = longitude;
        if (latitude < south) south = latitude;
        if (latitude > north) north = latitude;
      }
    }
  }
  return west === Infinity
    ? null
    : [
        [west, south],
        [east, north],
      ];
}
