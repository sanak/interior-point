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
