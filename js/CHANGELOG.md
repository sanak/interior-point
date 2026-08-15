# Changelog

All notable changes to the `interior-point` package are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `interior-point --time` reports where a run spent itself, as one line on
  stderr naming each phase that happened: `read`, `compute`, `verify` under
  `--verify`, `write` unless `--quiet`, and their sum. stdout and the exit code
  are exactly what the same run produces without the flag, and the line survives
  `--quiet`, so `--time --quiet` measures parsing and computation with nothing
  written. `total` is the sum of the phases, not the command's wall clock:
  process startup begins before the CLI is handed control, so it is outside
  anything the flag can see. jtsop's `-time` is the prior art and reports one
  figure covering the operation alone, which is `compute` here.

### Changed

- `--help` lists the flags after `--output` in a new order: `--verify`,
  `--centroid-first`, `--time`, `--quiet`, `--help`. Parsing is unaffected —
  every flag is still accepted anywhere on the command line — so this changes
  only what the help text and the documentation show.

## [1.0.0-rc.1] - 2026-08-08

### Added

- The JTS members `InteriorPoint` leans on are ported rather than approximated.
  `Centroid`, `Orientation`, `CGAlgorithmsDD`, the `DD` subset those predicates
  need, `Location`, `PointLocation`, `RayCrossingCounter` and
  `SimplePointInAreaLocator` now sit where JTS puts them, under `algorithm/`,
  `geom/` and `math/`. Each strategy previously carried inline helpers of its
  own — a length-weighted centroid written by hand, a squared-distance compare
  — and the world test asserted containment through `point-in-polygon-hao`; it
  now asks the ported locator, so the point and the check that it is interior
  both trace back to JTS. None of them are exported: `interiorPoint`,
  `centroidFirstInteriorPoint`, `verifyInteriorPoint`, `Verification` and
  `Coordinate` are the package's entire public surface. Every ported member
  carries an anchor naming the JTS member it came from, pinned to one upstream
  commit.
- `Coordinate` is re-exported as the name of the coordinate type. It is an
  alias of GeoJSON's `Position`, so existing code naming `Position` is
  unaffected.
- `interior-point` is a command as well as a library. The package installs a bin
  of that name that computes one interior point per input record. `--input`
  (`-i`) takes a WKT literal, a GeoJSON literal or a path and defaults to stdin,
  `--format` (`-f`) writes `geojson` (the default) or `wkt`, `--output` (`-o`)
  writes to a file instead of stdout, `--quiet` (`-q`) suppresses the result and
  leaves only the exit code, and `--help` (`-h`) prints the usage.
- `verifyInteriorPoint` and `Verification` check a computed point against the
  geometry it came from, through a point-in-polygon locator that shares no code
  with the algorithm that produced the point. The four outcomes are `Interior`,
  `OnGeometry`, `OffGeometry` and `Unverifiable`, whose values are the strings
  `"interior"`, `"on-geometry"`, `"off-geometry"` and `"unverifiable"`; the
  first two are passes and the last means there was no point to check or no
  geometry to check it against. This verifies the library's output and is not
  an OGC geometry validity check.
- `interior-point --verify` (`-v`) runs that check over every record. stdout is
  byte-for-byte identical to the same run without the flag; a summary line and
  one line per failing record go to stderr, and the command exits 2 if any
  record is `off-geometry`. `--quiet` drops the summary and keeps the failure
  lines.
- `centroidFirstInteriorPoint` computes the geometry's centroid and returns it
  when it lies strictly inside the geometry, falling back to `interiorPoint`
  when it does not. A centroid exactly on the boundary is not strictly inside
  and is rejected. Line and point geometries delegate to `interiorPoint`
  unchanged, and an empty or `null` geometry returns `null`. The return value
  is the point alone; which of the two produced it is not reported. Every path
  that does not accept the centroid ends in `interiorPoint`, so degenerate
  input behaves as it did before.
- `interior-point --centroid-first` (`-c`) applies that entry point to every
  record. The output shape is unchanged — one point per record, in the same
  envelope and format — so the flag composes with `--format`, `--output`,
  `--quiet` and `--verify`.

### Changed

- **Breaking.** Geometries whose linear components all have zero length now
  return the interior point JTS returns. Previously the port took the first
  coordinate of the first line; it now computes the centroid the way
  `Centroid.java` does, treating a zero-length line as a point. For
  `MULTILINESTRING((0 0, 0 0), (10 10, 10 10), (10 10, 10 10))` the result
  changes from `[0, 0]` to `[10, 10]`, matching JTS 1.19.0.
- **Breaking.** Invalid areal geometry that produces an odd number of scanline
  crossings now throws `AssertionFailedError` instead of returning a silently
  degraded point, matching JTS's
  `Assert.isTrue(0 == crossings.size() % 2, …)`. Only a ring that is not closed
  can produce an odd count, and RFC 7946 §3.1.6 requires polygon rings to be
  closed, so valid input is unaffected. A self-intersecting but closed ring
  still returns a point.
- `betterknown` moves from a dev dependency to a dependency. The CLI reads and
  writes WKT through it; importing the library does not reach it.

## [0.1.0] - 2026-03-23

### Added

- Initial release. `interiorPoint` returns an interior point (representative
  point) of any GeoJSON geometry, ported from JTS 1.19.0's `InteriorPoint`.
