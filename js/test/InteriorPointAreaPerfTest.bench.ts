/**
 * Performance benchmark for interiorPoint (SineStar polygons).
 * Port of JTS InteriorPointAreaPerfTest.java.
 *
 * Run with: pnpm bench:js
 *
 * @jts-adapter InteriorPointAreaPerfTest — JTS's perf harness is not vendored,
 *   so this stands in for it; tinybench replaces its timing loop.
 *
 * `node:test` has no benchmark counterpart, so this file is a plain script
 * rather than a test: node runs it directly and it drives tinybench itself.
 */
import { Bench } from "tinybench";
import type { Geometry } from "geojson";
import { interiorPoint } from "../src/algorithm/InteriorPoint.ts";
import { createSineStar, reducePrecision } from "./utils/SineStar.ts";

// JTS InteriorPointAreaPerfTest parameters
const ORG_X = 100;
const ORG_Y = 100;
const SIZE = 100;
const N_ARMS = 20;
const ARM_RATIO = 0.3;

const SIZES = [10, 100, 1_000, 10_000, 100_000];

// Pre-generate test polygons (with precision reduction)
const polygons = new Map<number, Geometry>();
for (const nPts of SIZES) {
  const star = createSineStar(ORG_X, ORG_Y, SIZE, nPts, N_ARMS, ARM_RATIO);
  const scale = nPts / SIZE;
  polygons.set(nPts, reducePrecision(star, scale));
}

const bench = new Bench({ time: 500 });

for (const nPts of SIZES) {
  const poly = polygons.get(nPts)!;
  bench.add(`${nPts} pts`, () => {
    interiorPoint(poly);
  });
}

await bench.run();

console.log("InteriorPoint - SineStar polygons");
console.table(bench.table());
