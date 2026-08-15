/**
 * Folding the result points under one click into the groups a popup shows.
 *
 * Several libraries usually land on the same interior point for the same building, and a popup
 * repeating that coordinate once per library would say nothing new. Two hits belong together when
 * they agree on both the coordinate and the attributes of the feature they came from — which is
 * exactly what a reader would call "the same result".
 */
import type { Position } from "geojson";

/** One result point under the pointer, resolved against the run it came from. */
export interface PointHit {
  readonly adapterId: string;
  /** The row's library name, already carrying its method marker. */
  readonly label: string;
  /** The row's legend colour, as a `#rrggbb` string. */
  readonly color: string;
  /** Index into `RunResult.points` and `Dataset.features`; the feature id to select. */
  readonly index: number;
  /** The exact coordinate the library returned, not the quantised one the map drew. */
  readonly position: Position;
  readonly properties: Readonly<Record<string, unknown>> | null;
}

/** One library named in a group's heading. */
export interface PointHitLabel {
  readonly label: string;
  readonly color: string;
}

/** One coordinate, and every library that produced it. */
export interface PointHitGroup {
  readonly labels: readonly PointHitLabel[];
  readonly position: Position;
  readonly properties: Readonly<Record<string, unknown>> | null;
}

/**
 * The key two hits have to share to be folded together. JSON is what makes the comparison
 * structural: a position is an array and the attributes are an object, so neither compares by
 * value on its own. A NUL separates them because no JSON encoding can contain one, which keeps a
 * coordinate from ever running into the attributes beside it.
 */
function keyOf(hit: PointHit): string {
  return `${JSON.stringify(hit.position)}\u0000${JSON.stringify(hit.properties ?? null)}`;
}

/**
 * Groups hits by that key, in order of first appearance. The caller decides the order it hands
 * them over in — the map passes them in table order — and both the groups and the labels inside
 * each group keep it.
 */
export function groupPointHits(hits: readonly PointHit[]): PointHitGroup[] {
  const groups: PointHitGroup[] = [];
  const labelsByKey = new Map<string, PointHitLabel[]>();
  for (const hit of hits) {
    const key = keyOf(hit);
    let labels = labelsByKey.get(key);
    if (!labels) {
      labels = [];
      labelsByKey.set(key, labels);
      groups.push({ labels, position: hit.position, properties: hit.properties });
    }
    labels.push({ label: hit.label, color: hit.color });
  }
  return groups;
}
