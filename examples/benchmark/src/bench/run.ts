import type { Position } from "geojson";

import type { Adapter, Dataset, RunResult } from "../types.ts";
import { summarizeVerification } from "./verify.ts";

/**
 * Runs one adapter over one dataset once.
 *
 * The caller owns `loaded`, so the load cost is charged to a library's first run
 * and to no other.
 *
 * The dataset is run through twice and only the second pass is timed. A partial
 * warm-up is not enough: measured on the dataset this app ships, an untimed tenth
 * still left the row measured first reporting well above the figure it settled on
 * over later presses, and reversing the row order carried that penalty to whatever
 * row had become first. A full pass removes it, so a row's number no longer depends
 * on where it sits in the table or on how many times Run all has been pressed. The
 * warm-up runs on every run, not only the first, because otherwise a second press
 * would inherit the state the first one left.
 *
 * Nothing touches the DOM between the two `performance.now()` readings, and the
 * try/catch sits inside each loop, so a throwing geometry costs every library the
 * same shape of work.
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

  let warmed: Position | null = null;
  for (let i = 0; i < geometries.length; i++) {
    try {
      warmed = adapter.interiorPoint(geometries[i]);
    } catch {
      // Warming the throw path is the point; only the timed pass counts errors.
    }
  }
  // Reads the last warm-up result so the calls cannot be dropped as dead code.
  void warmed;

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
