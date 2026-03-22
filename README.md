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

## Documentation

Full documentation: https://sanak.github.io/interior-point/

## License

[MIT](./LICENSE)

This project contains algorithms ported from JTS, licensed under EPL 2.0 / [EDL 1.0](./LICENSE_EDLv1.txt).
