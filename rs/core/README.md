# interior-point

Compute an interior point (representative point) of a geometry.

Ported from the [JTS Topology Suite](https://github.com/locationtech/jts) `InteriorPoint` algorithm. Geometries are
[`geo-types`](https://crates.io/crates/geo-types), which is the crate's only required dependency; the `cli` feature
adds the rest.

## Usage

Add to `Cargo.toml`:

```toml
[dependencies]
interior-point = "1.0"
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

An empty geometry returns `None`.

## API

| Item                            | Signature                                                                       | Returns                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `interior_point`                | `(geometry: &Geometry<f64>) -> Option<Coord<f64>>`                              | a point inside area geometries, or on linear and point ones                                 |
| `verify_interior_point`         | `(point: Option<Coord<f64>>, geometry: Option<&Geometry<f64>>) -> Verification` | `Interior`, `OnGeometry`, `OffGeometry` or `Unverifiable`                                   |
| `centroid_first_interior_point` | `(geometry: &Geometry<f64>) -> Option<Coord<f64>>`                              | the geometry's centroid when it lies strictly inside, and `interior_point` when it does not |

Those three functions and the `Verification` they answer with are the crate's whole public surface with the default features. Verification runs through a point-in-polygon locator that shares no code with the algorithm that produced the point, and checks this crate's own output rather than the input's OGC validity.

Full signatures, the four verification outcomes and the reasoning behind each entry point: [API reference](https://sanak.github.io/interior-point/api/rust).

## CLI

This crate also bundles an `interior-point` command-line binary, behind a `cli` feature that is
not in `default`; `cargo install interior-point` alone installs nothing, so build or install it
with `--features cli`:

```sh
cargo install interior-point --features cli
```

It reads WKT or GeoJSON — as a literal, a file, or on stdin — and writes GeoJSON by default or one
WKT geometry per line. See the [CLI page](https://sanak.github.io/interior-point/cli) for every
flag, the output shapes and the exit codes.

## Documentation

Full documentation: [sanak.github.io/interior-point](https://sanak.github.io/interior-point/)

## License

[MIT](./LICENSE)

This crate contains algorithms ported from JTS (EPL 2.0 / [EDL 1.0](./LICENSE_EDLv1.txt)).
