# interior-point

Compute an interior point (representative point) of a geometry. Ported from the [JTS Topology Suite](https://github.com/locationtech/jts) `InteriorPoint` algorithm to TypeScript and Rust.

An interior point is guaranteed to lie inside the geometry (for polygons) or on the geometry (for lines/points). This is useful for label placement and point-in-polygon representative coordinates.

## Packages

| Package                 | Language   | Registry                                             |
| ----------------------- | ---------- | ---------------------------------------------------- |
| [interior-point](./js/) | TypeScript | [npm](https://www.npmjs.com/package/interior-point)  |
| [interior-point](./rs/) | Rust       | [crates.io](https://crates.io/crates/interior-point) |

## Algorithm

- **Polygons (2D)**: Scanline algorithm — picks a Y that bisects the bounding box, computes edge intersections, returns the midpoint of the longest interior interval
- **Lines (1D)**: Vertex nearest to centroid
- **Points (0D)**: Point nearest to centroid
- **GeometryCollections**: Uses the highest-dimension non-empty component

## Verification

Both libraries also export a verification function — `verifyInteriorPoint` in TypeScript, `verify_interior_point` in Rust — that checks a computed point against the geometry it came from, through a point-in-polygon locator that shares no code with the algorithm that produced the point.

- **Outcomes**: `interior` and `on-geometry` are passes, `off-geometry` is the only failure, `unverifiable` means there was no point to check or no geometry to check it against
- **CLI**: the bundled `interior-point` command exposes the same check as `--verify`, which writes a summary and one line per failing record to stderr, leaves stdout byte-for-byte unchanged, and exits 2 when any record fails

This verifies the libraries' own output. It is not an OGC geometry validity check: an invalid geometry can still yield a point that verifies.

## Documentation

Full documentation: https://sanak.github.io/interior-point/

## License

[MIT](./LICENSE)

This project contains algorithms ported from JTS, licensed under EPL 2.0 / [EDL 1.0](./LICENSE_EDLv1.txt).
