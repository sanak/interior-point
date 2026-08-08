# Changelog

All notable changes to the `interior-point` crate are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-rc.1] - 2026-08-08

### Added

- The JTS members `InteriorPoint` leans on are ported rather than approximated.
  `Centroid`, `Orientation`, `CGAlgorithmsDD`, the `DD` subset those predicates
  need, `Location`, `PointLocation`, `RayCrossingCounter` and
  `SimplePointInAreaLocator` now sit where JTS puts them, under `algorithm/`,
  `geom/` and `math/`. Each strategy previously carried inline helpers of its
  own — a length-weighted centroid written by hand, a squared-distance compare
  — and the world test asserted containment through `geo`'s `Contains`; it now
  asks the ported locator, so the point and the check that it is interior both
  trace back to JTS, and `geo` is no longer a dependency of any kind. All of
  them are `pub(crate)`. Every ported member carries an anchor naming the JTS
  member it came from, pinned to one upstream commit.
- `interior-point` is a command as well as a library, behind a new `cli`
  feature that also makes the `cli` module public. It computes one interior
  point per input record: `--input` (`-i`) takes a WKT literal, a GeoJSON
  literal or a path and defaults to stdin, `--format` (`-f`) writes `geojson`
  (the default) or `wkt`, `--output` (`-o`) writes to a file instead of stdout,
  `--quiet` (`-q`) suppresses the result and leaves only the exit code, and
  `--help` (`-h`) prints the usage. The feature is off by default, so a library
  dependency pulls in none of `clap`, `wkt`, `geojson`, `ryu`, `serde`,
  `serde_json` or `serde_json_lenient`.
- `verify_interior_point` and `Verification` check a computed point against the
  geometry it came from, through a point-in-polygon locator that shares no code
  with the algorithm that produced the point. The four variants
  are `Interior`, `OnGeometry`, `OffGeometry` and `Unverifiable`, and their
  `Display` output is `interior`, `on-geometry`, `off-geometry` and
  `unverifiable`; the first two are passes and the last means there was no point
  to check or no geometry to check it against. This verifies the crate's output
  and is not an OGC geometry validity check.
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
  `Verification`.
- `interior-point --centroid-first` (`-c`), behind the `cli` feature, applies
  that entry point to every record. The output shape is unchanged — one point
  per record, in the same envelope and format — so the flag composes with
  `--format`, `--output`, `--quiet` and `--verify`.

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
- **Breaking.** The crate is built on edition 2024 and so needs Rust 1.85 or
  newer, now declared as `rust-version`. Its sources moved to `rs/core` as one
  member of a Cargo workspace; the published package name, `interior-point`, is
  unchanged.

### Removed

- **Breaking.** The `wasm` feature is gone, and with it the `cdylib` crate type
  and the `wasm-bindgen`, `serde-wasm-bindgen` and `js-sys` dependencies it
  enabled. The bindings moved to `interior-point-wasm`, a workspace member that
  is not published, so the published crate builds as an `rlib` alone. The three
  other optional dependencies that feature switched on — `geojson`, `serde` and
  `serde_json` — are still declared; the `cli` feature is what enables them now.

## [0.2.0] - 2026-03-24

### Changed

- `geo` moves from a dependency to a dev dependency. The public API was already
  expressed in `geo-types` alone, so no signature changes.

## [0.1.0] - 2026-03-23

### Added

- Initial release. `interior_point` returns an interior point (representative
  point) of any `geo_types::Geometry<f64>`, ported from JTS 1.19.0's
  `InteriorPoint`, with optional WASM bindings behind a `wasm` feature.
