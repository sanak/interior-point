# interior-point

Compute an interior point (representative point) of a geometry.

Ported from the [JTS Topology Suite](https://github.com/locationtech/jts) `InteriorPoint` algorithm. Uses [`geo`](https://crates.io/crates/geo) / [`geo-types`](https://crates.io/crates/geo-types) crates.

## Usage

Add to `Cargo.toml`:

```toml
[dependencies]
interior-point = "0.1"
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

## CLI

This crate also bundles an `interior-point` command-line binary, behind a `cli` feature that is
not in `default`; `cargo install interior-point` alone installs nothing, so build or install it
with `--features cli`:

```sh
cargo install interior-point --features cli
```

See the [CLI page](https://sanak.github.io/interior-point/cli) for the flags and examples.

## License

[MIT](./LICENSE)

This crate contains algorithms ported from JTS (EPL 2.0 / [EDL 1.0](./LICENSE_EDLv1.txt)).
