/**
 * Performance benchmark for interiorPoint (SineStar polygons).
 * Port of JTS InteriorPointAreaPerfTest.java.
 *
 * Run with: pnpm bench:js
 */
import { bench, describe } from "vitest";
import type { Geometry } from "geojson";
import { interiorPoint } from "../src/interiorPoint";
import { createSineStar, reducePrecision } from "./utils/sineStar";

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

describe("InteriorPoint - SineStar polygons", () => {
  for (const nPts of SIZES) {
    const poly = polygons.get(nPts)!;
    bench(`${nPts} pts`, () => {
      interiorPoint(poly);
    });
  }
});
