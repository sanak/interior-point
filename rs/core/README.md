# interior-point

Compute an interior point (representative point) of a geometry.

Ported from the [JTS Topology Suite](https://github.com/locationtech/jts) `InteriorPoint` algorithm. Uses [`geo`](https://crates.io/crates/geo) / [`geo-types`](https://crates.io/crates/geo-types) crates.

## Usage

Add to `Cargo.toml`:

```toml
[dependencies]
interior-point = "0.3"
geo-types = "0.7"
```

or using `cargo add`:

```sh
cargo add interior-point
cargo add geo-types
```

```rust
use geo_types::{polygon, Geometry};
use interior_point::interior_point;

let poly = polygon![
    (x: 0.0, y: 0.0),
    (x: 6.0, y: 0.0),
    (x: 6.0, y: 2.0),
    (x: 2.0, y: 2.0),
    (x: 2.0, y: 8.0),
    (x: 0.0, y: 8.0),
    (x: 0.0, y: 0.0),
];

let pt = interior_point(&Geometry::Polygon(poly));
assert!(pt.is_some());
```

## API

### `interior_point(geometry: &Geometry<f64>) -> Option<Coord<f64>>`

Returns a coordinate guaranteed to lie inside area geometries, or on linear/point geometries. Returns `None` for empty geometries.

### `centroid_first_interior_point(geometry: &Geometry<f64>) -> Option<Coord<f64>>`

Computes the geometry's centroid and returns it when it lies strictly inside the geometry, falling back to `interior_point` when it does not. A representative point is more useful when it is the centroid, because the fallback returns a point that depends on how the algorithm is implemented.

Strictly inside means the interior and nothing else: a centroid exactly on the boundary is rejected. Linear and point geometries delegate to `interior_point` unchanged, and an empty geometry returns `None`.

The return value is the point alone — which of the two produced it is not reported.

### `verify_interior_point(point: Option<Coord<f64>>, geometry: Option<&Geometry<f64>>) -> InteriorPointVerification`

Checks a point against the geometry it was computed from, through a point-in-polygon locator that shares no code with the algorithm that produced the point. Returns one of `Interior`, `OnGeometry`, `OffGeometry` or `Unverifiable`, whose `Display` output is `interior`, `on-geometry`, `off-geometry` and `unverifiable`.

`Interior` and `OnGeometry` are passes, `OffGeometry` is the only failure, and `Unverifiable` means there was no point to check or no geometry to check it against. `InteriorPointVerification::is_verified` collapses the four to a `bool`.

This verifies the crate's own output. It is not an OGC geometry validity check: an invalid geometry can still yield a point that verifies.

With the default features, `interior_point`, `centroid_first_interior_point`, `verify_interior_point` and `InteriorPointVerification` are the crate's whole public surface.

## CLI

This crate also bundles an `interior-point` command-line binary, behind a `cli` feature that is
not in `default`; `cargo install interior-point` alone installs nothing, so build or install it
with `--features cli`:

```sh
cargo install interior-point --features cli
```

See the [CLI page](https://sanak.github.io/interior-point/cli) for the flags and examples.

Pass `--verify` to check each result against its input geometry: the command writes a summary and
one line per failing record to stderr, leaves stdout byte-for-byte unchanged, and exits 2 when any
record fails.

Pass `--centroid-first` to return each geometry's centroid when it lies strictly inside it, falling
back to the interior-point algorithm when it does not. The output shape is unchanged, so the flag
composes with every other one.

## License

[MIT](./LICENSE)

This crate contains algorithms ported from JTS (EPL 2.0 / [EDL 1.0](./LICENSE_EDLv1.txt)).
