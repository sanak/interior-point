/**
 * Resolving a click into the result points it hit, then folding those into the groups a popup
 * shows.
 *
 * Several libraries usually land on the same interior point for the same building, and a popup
 * repeating that coordinate once per library would say nothing new. Two hits belong together when
 * they agree on both the coordinate and the attributes of the feature they came from — which is
 * exactly what a reader would call "the same result".
 */
import type { Position } from "geojson";
import type { Adapter, Dataset } from "../types.ts";

const POINT_LAYER_PREFIX = "points-";

/** The map layer id a given adapter's result points are drawn on. */
export function pointLayerId(adapterId: string): string {
  return `${POINT_LAYER_PREFIX}${adapterId}`;
}

/** The two fields `resolveHits` reads off a queried map feature. Structural, so this module stays free of MapLibre. */
export interface QueriedFeature {
  readonly layer: { readonly id: string };
  readonly id?: string | number;
}

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

/** The two fields `resolveHits` needs from the map to turn a queried feature into a `PointHit`. */
export interface ResolveHitsContext {
  readonly adapters: readonly Adapter[];
  readonly colors: Readonly<Record<string, string>>;
  readonly points: ReadonlyMap<string, readonly (Position | null)[]>;
  readonly dataset: Dataset | null;
}

/**
 * Every visible result point under the pointer, resolved against the run that produced it.
 *
 * The outer loop walks the registry rather than the query result, so the popup's sections read
 * down the table instead of following whatever order the renderer happened to return. A hit
 * whose coordinate cannot be found is dropped rather than guessed at: `RunResult.points` holds
 * one entry per input geometry in order, and a dataset's `features` and `geometries` are built
 * in step, so the same index reaches the feature the point was computed from.
 */
export function resolveHits(
  features: readonly QueriedFeature[],
  { adapters, colors, points, dataset }: ResolveHitsContext,
): PointHit[] {
  const hits: PointHit[] = [];
  for (const adapter of adapters) {
    const layer = pointLayerId(adapter.id);
    for (const feature of features) {
      if (feature.layer.id !== layer) continue;
      // `id` is 0 for the first feature of every source, so this has to be a type test.
      if (typeof feature.id !== "number") continue;
      const position = points.get(adapter.id)?.[feature.id];
      if (!position) continue;
      hits.push({
        adapterId: adapter.id,
        label: adapter.label,
        color: colors[adapter.id] ?? "#888888",
        index: feature.id,
        position,
        properties: dataset?.features[feature.id]?.properties ?? null,
      });
    }
  }
  return hits;
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
    // the group holds this array by reference; later hits append to it
    labels.push({ label: hit.label, color: hit.color });
  }
  return groups;
}
