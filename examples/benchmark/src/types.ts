import type { Feature, Geometry, Position } from "geojson";

import type { Verification } from "interior-point";

/** One benchmark input: the geometries to measure plus what the map draws. */
export interface Dataset {
  /** Shown in the UI, e.g. "PLATEAU Hiroshima 2024" or a dropped file name. */
  readonly name: string;
  /** Every non-empty geometry, in file order. This is what every adapter is handed. */
  readonly geometries: readonly Geometry[];
  /** Features carrying those geometries, for the map's input layer. */
  readonly features: readonly Feature[];
  /** How many geometries were dropped for being empty or absent. */
  readonly skipped: number;
}

/** One measured library row. `id` is stable and used as a DOM id and layer id. */
export interface Adapter {
  readonly id: string;
  /** Library name shown in the first column. */
  readonly label: string;
  /** The call being measured, shown in the second column. */
  readonly call: string;
  /** Dynamic import plus any WASM instantiation. Timed once, on first run. */
  load(): Promise<void>;
  /** Must not allocate anything the caller has to release. Throwing is counted, not fatal. */
  interiorPoint(geometry: Geometry): Position | null;
}

/** How many geometries produced each verdict. Keys are the enum's string values. */
export type VerificationSummary = Readonly<Record<Verification, number>>;

/** The outcome of one pass of one adapter over one dataset. */
export interface RunResult {
  readonly adapterId: string;
  /** Milliseconds spent in `load()`, or null when the adapter was already loaded. */
  readonly loadMs: number | null;
  /** Milliseconds spent in the compute loop alone. */
  readonly totalMs: number;
  /** Geometries per second, derived from `totalMs`. */
  readonly pointsPerSecond: number;
  /** One entry per input geometry, in the same order. */
  readonly points: readonly (Position | null)[];
  /** How many geometries threw. Their entry in `points` is null. */
  readonly errors: number;
  readonly verification: VerificationSummary;
}
