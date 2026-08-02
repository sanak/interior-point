# Changelog

All notable changes to the `interior-point` crate are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Breaking.** Geometries whose linear components all have zero length now
  return the interior point JTS returns. Previously the port took the first
  coordinate of the first line; it now computes the centroid the way
  `Centroid.java` does, treating a zero-length line as a point. For a
  `MultiLineString` of `(0 0, 0 0)`, `(10 10, 10 10)` and `(10 10, 10 10)` the
  result changes from `Some(Coord { x: 0.0, y: 0.0 })` to
  `Some(Coord { x: 10.0, y: 10.0 })`, matching JTS 1.19.0.
- **Breaking.** Areal geometry that produces an odd number of scanline
  crossings now panics via `assert!` instead of returning a silently degraded
  point, matching JTS's `Assert.isTrue(0 == crossings.size() % 2, …)`. Only a
  ring that is not closed can produce an odd count, and
  `geo_types::Polygon::new` closes every ring it is given, so no input reaching
  `interior_point` can trigger it. The assertion is carried for parity with JTS
  and with the TypeScript port, where GeoJSON's raw ring arrays make it
  reachable.

### Added

- `verify_interior_point` and `InteriorPointVerification` check a computed point
  against the geometry it came from, through a point-in-polygon locator that
  shares no code with the algorithm that produced the point. The four variants
  are `Interior`, `OnGeometry`, `OffGeometry` and `Unverifiable`, and their
  `Display` output is `interior`, `on-geometry`, `off-geometry` and
  `unverifiable`; the first two are passes and the last means there was no point
  to check or no geometry to check it against.
  `InteriorPointVerification::is_verified` collapses them to a `bool`. This
  verifies the crate's output and is not an OGC geometry validity check.
- `interior-point --verify` (`-v`), behind the `cli` feature, runs that check
  over every record. stdout is byte-for-byte identical to the same run without
  the flag; a summary line and one line per failing record go to stderr, and the
  command exits 2 if any record is `off-geometry`. `--quiet` drops the summary
  and keeps the failure lines.
- `centroid_first_interior_point` computes the geometry's centroid and returns
  it when it lies strictly inside the geometry, falling back to
  `interior_point` when it does not. A centroid exactly on the boundary is not
  strictly inside and is rejected. Linear and point geometries delegate to
  `interior_point` unchanged, and an empty geometry returns `None`. The return
  value is the point alone; which of the two produced it is not reported. Every
  path that does not accept the centroid ends in `interior_point`, so
  degenerate input behaves as it did before. With the default features, the
  crate's public surface is now `interior_point`,
  `centroid_first_interior_point`, `verify_interior_point` and
  `InteriorPointVerification`.
- `interior-point --centroid-first` (`-c`), behind the `cli` feature, applies
  that entry point to every record. The output shape is unchanged — one point
  per record, in the same envelope and format — so the flag composes with
  `--format`, `--output`, `--quiet` and `--verify`.
