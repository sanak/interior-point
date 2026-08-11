import type { Geometry, Position } from "geojson";
import { Verification, verifyInteriorPoint } from "interior-point";

import type { VerificationSummary } from "../types.ts";

/** A summary with every verdict at zero. */
export function emptySummary(): VerificationSummary {
  return {
    [Verification.Interior]: 0,
    [Verification.OnGeometry]: 0,
    [Verification.OffGeometry]: 0,
    [Verification.Unverifiable]: 0,
  };
}

/**
 * Checks each stored point against the geometry it was computed from and counts
 * the verdicts. This runs after the timing window closes, so its cost is not
 * attributed to any library.
 */
export function summarizeVerification(
  points: readonly (Position | null)[],
  geometries: readonly Geometry[],
): VerificationSummary {
  const counts: Record<Verification, number> = { ...emptySummary() };

  for (let i = 0; i < geometries.length; i++) {
    const verdict = verifyInteriorPoint(points[i] ?? null, geometries[i]);
    counts[verdict] += 1;
  }

  return counts;
}
