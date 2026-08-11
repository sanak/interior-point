import type { Position } from "geojson";

import type { Adapter, Dataset, RunResult } from "../types.ts";
import { summarizeVerification } from "./verify.ts";

/**
 * Runs one adapter over one dataset once.
 *
 * The caller owns `loaded`, so the load cost is charged to a library's first run
 * and to no other. Nothing touches the DOM between the two `performance.now()`
 * readings, and the try/catch sits inside the loop so a throwing geometry costs
 * every library the same shape of work.
 */
export async function runAdapter(adapter: Adapter, dataset: Dataset, loaded: Set<string>): Promise<RunResult> {
  let loadMs: number | null = null;
  if (!loaded.has(adapter.id)) {
    const started = performance.now();
    await adapter.load();
    loadMs = performance.now() - started;
    loaded.add(adapter.id);
  }

  const geometries = dataset.geometries;
  const points: (Position | null)[] = new Array(geometries.length).fill(null);
  let errors = 0;

  const started = performance.now();
  for (let i = 0; i < geometries.length; i++) {
    try {
      points[i] = adapter.interiorPoint(geometries[i]);
    } catch {
      errors += 1;
    }
  }
  const totalMs = performance.now() - started;

  return {
    adapterId: adapter.id,
    loadMs,
    totalMs,
    pointsPerSecond: totalMs > 0 ? (geometries.length / totalMs) * 1000 : Infinity,
    points,
    errors,
    verification: summarizeVerification(points, geometries),
  };
}
