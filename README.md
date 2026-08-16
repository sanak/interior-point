# interior-point

Compute an interior point (representative point) of a geometry. Ported from the [JTS Topology Suite](https://github.com/locationtech/jts) `InteriorPoint` algorithm to TypeScript and Rust.

An interior point is guaranteed to lie inside the geometry (for polygons) or on the geometry (for lines/points). This is useful for label placement and point-in-polygon representative coordinates.

```sh
interior-point -f wkt -i "POLYGON ((0 0, 6 0, 6 2, 2 2, 2 8, 0 8, 0 0))"
# POINT (1 5)
```

That L-shaped polygon is the reason the algorithm exists: its centroid is `(2, 3)`, which lies on the boundary rather than inside it.

## Packages

Each package is published on its own, carries its own README with a quick start for that language, and installs the same `interior-point` command.

| Package                      | Language   | Registry                                             |
| ---------------------------- | ---------- | ---------------------------------------------------- |
| [interior-point](./js/)      | TypeScript | [npm](https://www.npmjs.com/package/interior-point)  |
| [interior-point](./rs/core/) | Rust       | [crates.io](https://crates.io/crates/interior-point) |

## Algorithm

- **Polygons (2D)**: Scanline algorithm — picks a Y that bisects the bounding box, computes edge intersections, returns the midpoint of the longest interior interval
- **Lines (1D)**: Vertex nearest to centroid
- **Points (0D)**: Point nearest to centroid
- **GeometryCollections**: Uses the highest-dimension non-empty component

## Entry points

Both libraries publish the same three functions, spelled for their language, and the bundled command exposes the last two as flags.

| TypeScript                   | Rust                            | CLI                | What it returns                                                                                              |
| ---------------------------- | ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `interiorPoint`              | `interior_point`                | —                  | the interior point of a geometry, by the algorithm above                                                     |
| `verifyInteriorPoint`        | `verify_interior_point`         | `--verify`         | whether a computed point lies on or in its geometry, checked through an independent point-in-polygon locator |
| `centroidFirstInteriorPoint` | `centroid_first_interior_point` | `--centroid-first` | the geometry's centroid when it lies strictly inside, and the interior point when it does not                |

Verification is a check on this port's own output, not an OGC geometry validity check.

## Documentation

Full documentation: https://sanak.github.io/interior-point/

- [CLI](https://sanak.github.io/interior-point/cli) — installing the bundled `interior-point` command, its flags and its exit codes
- API reference — every entry point, with the reasoning behind each: [TypeScript](https://sanak.github.io/interior-point/api/typescript), [Rust](https://sanak.github.io/interior-point/api/rust)

## License

[MIT](./LICENSE)

This project contains algorithms ported from JTS, licensed under EPL 2.0 / [EDL 1.0](./LICENSE_EDLv1.txt).
