import { describe, expect, it } from "vitest";

import { orientationIndexCoordinate, orientationIndexDouble } from "../src/cgAlgorithmsDD";

/**
 * The triples JTS's own OrientationIndexFailureTest documents as defeating
 * non-robust predicates. A plain f64 cross-product gets 20 of these 54
 * permutations wrong; the DD chain gets all 54 right.
 */
const HARD: [number, number][][] = [
  [
    [1.4540766091864998, -7.989685402102996],
    [23.131039116367354, -7.004368924503866],
    [1.4540766091865, -7.989685402102996],
  ],
  [
    [0, 100],
    [1, 102.1082],
    [3, 106.3246],
  ],
  [
    [219.3649559090992, 140.84159161824724],
    [168.9018919682399, -5.713787599646864],
    [186.80814046338352, 46.28973405831556],
  ],
  [
    [279.56857838488514, -186.3790522565901],
    [-20.43142161511487, 13.620947743409914],
    [0, 0],
  ],
  [
    [-26.2, 188.7],
    [37.0, 290.7],
    [21.2, 265.2],
  ],
  [
    [-5.9, 163.1],
    [76.1, 250.7],
    [14.6, 185],
  ],
  [
    [-0.9575, 0.4511],
    [-0.9295, 0.3291],
    [-0.8945, 0.1766],
  ],
  [
    [-9575, 4511],
    [-9295, 3291],
    [-8945, 1766],
  ],
  [
    [0, 0],
    [0, 1],
    [1, 1],
  ],
];

const PERMS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

/**
 * Produced by CGAlgorithmsDD.orientationIndex from jts-core-1.19.0.jar under
 * Java 17 on 2026-07-26, one value per (triple, permutation) pair in iteration
 * order. Regenerate with the reference jar if the pinned commit changes
 * CGAlgorithmsDD or DD — never by running the TypeScript implementation, which
 * would make the test tautological.
 *
 * Rows 7 and 8 are all zeros: those are JTS's testBadCCW7 and testBadCCW7_2,
 * where the DD chain reports the three points as exactly collinear in every
 * permutation, and JTS's own test file records that Shewchuk's predicate
 * disagrees there.
 */
const JTS_EXPECTED: number[] = [
  -1, 1, 1, -1, -1, 1, 1, -1, -1, 1, 1, -1, -1, 1, 1, -1, -1, 1, 1, -1, -1, 1, 1, -1, 1, -1, -1, 1, 1, -1, 1, -1, -1, 1,
  1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 1, 1, -1, -1, 1,
];

describe("CGAlgorithmsDD", () => {
  it("agrees with real JTS on every permutation of its own hard cases", () => {
    // One entry per (triple, permutation) pair, in the order produced below.
    const actual: number[] = [];
    for (const t of HARD) {
      for (const p of PERMS) {
        actual.push(orientationIndexCoordinate(t[p[0]], t[p[1]], t[p[2]]));
      }
    }
    expect(actual).toEqual(JTS_EXPECTED);
  });

  it("is antisymmetric under swapping the first two arguments", () => {
    for (const t of HARD) {
      const forward = orientationIndexCoordinate(t[0], t[1], t[2]);
      const reversed = orientationIndexCoordinate(t[1], t[0], t[2]);
      // Stated as a cancelling sum rather than `toBe(-forward)`: the collinear
      // rows return 0, and `-0` is not `Object.is`-equal to the `0` that comes back.
      expect(reversed + forward).toBe(0);
      expect(Math.abs(reversed)).toBe(Math.abs(forward));
    }
  });

  it("takes the same answer through both entry points", () => {
    for (const t of HARD) {
      expect(orientationIndexDouble(t[0][0], t[0][1], t[1][0], t[1][1], t[2][0], t[2][1])).toBe(
        orientationIndexCoordinate(t[0], t[1], t[2]),
      );
    }
  });

  it("returns the plain orientation for well-conditioned input", () => {
    // The Shewchuk filter answers these without reaching the DD path.
    expect(orientationIndexCoordinate([0, 0], [1, 0], [0, 1])).toBe(1);
    expect(orientationIndexCoordinate([0, 0], [1, 0], [0, -1])).toBe(-1);
    expect(orientationIndexCoordinate([0, 0], [1, 0], [2, 0])).toBe(0);
  });
});
