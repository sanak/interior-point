# Changelog

All notable changes to the `interior-point` package are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Added

- `Coordinate` is re-exported as the name of the coordinate type. It is an
  alias of GeoJSON's `Position`, so existing code naming `Position` is
  unaffected.
- `verifyInteriorPoint`, `isVerified` and `InteriorPointVerification` check a
  computed point against the geometry it came from, through a point-in-polygon
  locator that shares no code with the algorithm that produced the point. The
  four outcomes are `Interior`, `OnGeometry`, `OffGeometry` and `Unverifiable`,
  whose values are the strings `"interior"`, `"on-geometry"`, `"off-geometry"`
  and `"unverifiable"`; the first two are passes and the last means there was
  no point to check or no geometry to check it against. This verifies the
  library's output and is not an OGC geometry validity check.
- `interior-point --verify` (`-v`) runs that check over every record. stdout is
  byte-for-byte identical to the same run without the flag; a summary line and
  one line per failing record go to stderr, and the command exits 2 if any
  record is `off-geometry`. `--quiet` drops the summary and keeps the failure
  lines.
