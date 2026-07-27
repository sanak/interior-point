# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Port of JTS (Java Topology Suite) InteriorPoint algorithm to **TypeScript** and **Rust** as independent libraries. The algorithm computes a representative point guaranteed to lie inside a geometry (scanline approach for polygons, nearest-to-centroid for lines/points).

## Monorepo Structure (pnpm workspace)

- `js/` — TypeScript library (`interior-point`), GeoJSON-native, zero dependencies
- `rs/` — Rust workspace
  - `rs/core/` — Core Rust crate (`interior-point`), uses `geo-types` crates
  - `rs/wasm/` — WASM bindings crate (`interior-point-wasm`)
- `docs/` — All project documentation. **Only `docs/site/` is published.**
  - `docs/site/` — VitePress source directory (`srcDir`), deployed to GitHub Pages (base: `/interior-point/`)
  - `docs/site/public/` — Static assets copied to the site root
- `examples/` — Sample apps
- `upstream/jts/` — Verbatim copies of the tracked JTS sources and test resources, pinned by `upstream/jts/pin.json`. Never edit these files; see `upstream/jts/NOTICE.md`.
  `upstream/jts/main/`, `upstream/jts/test/`, and `upstream/jts/resources/` mirror JTS's Maven layout, and `js/src`/`rs/core/src` mirror `upstream/jts/main/` while `js/test`/`rs/core/tests`+`rs/core/src/test` mirror `upstream/jts/test/`, so each pair can be folder-diffed directly.
- `testdata/` — Locally generated test fixtures only (upstream fixtures live under `upstream/jts/resources/`)

Anything under `docs/` outside `docs/site/` is invisible to VitePress. To publish a document, move it into `docs/site/`. Do not reach for `srcExclude` — the boundary is the directory.

## Commands

### TypeScript (from repo root)

```bash
pnpm install              # install dependencies
pnpm test:js              # run TS tests (node --test)
pnpm build:js             # build TS library (tsc)
pnpm lint                 # eslint
pnpm lint:fix             # eslint --fix
pnpm format               # prettier --write
pnpm format:check         # prettier --check
```

Single file: `cd js && node --test test/algorithm/InteriorPointTest.ts`
Single case: `cd js && node --test --test-name-pattern "zero-area polygon" "test/**/*Test.ts"`
Watch mode: `cd js && pnpm test:watch`

### Rust (from repo root)

```bash
pnpm test:rs              # cargo test --workspace
cd rs && cargo test -p interior-point -- test_name   # single test
cd rs && cargo clippy --workspace --all-targets -- -D warnings
cd rs && cargo fmt --all --check
```

WASM build: `cd rs/wasm && wasm-pack build`

### Both

```bash
pnpm test                 # runs test:scripts && test:js && test:rs
pnpm bench                # runs bench:js && bench:rs
```

### Docs

```bash
pnpm docs:dev             # dev server
pnpm docs:build           # production build
```

### Upstream JTS sync

`scripts/jts-sync.mjs` keeps `upstream/jts/` honest. Node only, no dependencies.

```bash
node scripts/jts-sync.mjs check [--ref master] [--diff]  # verify hashes, compare against upstream
node scripts/jts-sync.mjs pull --ref <tag|sha>           # refresh upstream/jts/ and pin.json
node scripts/jts-sync.mjs anchors                        # check @jts anchor integrity
node scripts/jts-sync.mjs locate <file>:<line>           # Java line -> ported counterpart
node scripts/jts-sync.mjs scaffold --lang ts|rs          # anchored skeletons from the Java
pnpm test:scripts                                        # unit tests for the above
```

Exit codes: `0` clean, `1` findings, `2` operational failure.

`--ref` defaults to `master`: that is upstream's default branch name, not `main`.

Following an upstream change:

1. `node scripts/jts-sync.mjs pull --ref <tag|sha>`
2. `git diff upstream/` — this diff is the work order
3. apply each hunk to the anchored counterpart in `js/src` and `rs/core/src`
4. `pnpm test && pnpm bench`
5. `node scripts/jts-sync.mjs anchors`

`.github/workflows/jts-drift.yml` runs `check` weekly and opens or updates an issue
labelled `jts-drift`. `anchors` runs in `ci.yml` on every push: every one of the 97
in-scope members across the 20 pinned files carries a `@jts` anchor, so the check exits 0
and a future member added upstream without a counterpart fails the build.

A `pin.json` file entry may declare `portedMembers`, listing the only members required to
carry a `@jts` anchor — that is how a deliberately partial port (`DD`: 10 of 73 members)
avoids 63 spurious `@jts-omit` tags. A file entry without the field requires full coverage.
Twelve of the twenty entries declare one.

`Location.java` is the limiting case: its entry lists three **constants**. `scanJavaDir`
only ever yields method declarations, so a `portedMembers` entry naming a field matches
nothing and is never validated — the narrowing comes from the field being present at all,
which drops the unported `toLocationSymbol(int)` out of the coverage denominator. Anchors
in the _port_ that name a constant are validated separately, by a field-declaration probe.

Ported JTS _tests_ are pinned the same way: `CentroidTest.java` (2 ported members) and
`InteriorPointTest.java` (3) are vendored with a `portedMembers` list, because an `@jts`
anchor must name a vendored file and the ported test methods carry anchors like any other
port. `AbstractPointInRingTest.java` (6 ported members), `RayCrossingCounterTest.java` (1),
and `SimplePointInAreaLocatorTest.java` (1) are vendored the same way. A JTS test class with
no ported counterpart is not vendored and gets `@jts-adapter` instead: `GeometryTestCase`,
whose XML runner node:test and the XML parsers stand in for, and `InteriorPointAreaPerfTest`,
whose timing loop tinybench and criterion stand in for. `PointLocationTest`,
`IndexedPointInAreaLocatorTest`, `PointLocatorTest`, `PointLocationOn4DLineTest`, and
`SimpleRayCrossingStressTest` are deliberately not vendored: nothing in them is ported.

`check` currently reports `upstream/jts/main/math/DD.java` as DRIFTED: upstream `master` added a
`hashCode()` after the pinned commit. That is real upstream movement outside the ported
subset, not a local edit — all 20 pinned files still match their recorded `sha256`.

### Citation guard

`node scripts/jts-citations.mjs` scans tracked files for comments citing something outside this
repository — a design doc, a numbered task, a numbered rule — and exits non-zero if it finds one;
it runs in `ci.yml` beside `anchors` and is covered by `pnpm test:scripts`.

## Public API

### TypeScript

```ts
interiorPoint(geometry: Geometry | null): Coordinate | null
```

Single dispatcher function exported from `js/src/index.ts`, alongside the `Coordinate` type.
`Coordinate` is `js/src/GeometryAdapter.ts`'s alias of GeoJSON's `Position` and carries JTS's
name for it; an ESLint rule bans importing `Position` inside `js/src/**` so the adapter stays
the single place the GeoJSON name appears. The rule has no exemptions.

### Rust

```rust
pub fn interior_point(geometry: &Geometry<f64>) -> Option<Coord<f64>>
```

## Architecture

### Core Algorithm (4 modules per language)

Each language implements the same 4 files mirroring JTS:

| Module                                                                        | Purpose                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------- |
| `algorithm/InteriorPoint` / `core/src/algorithm/interior_point.rs`            | Dispatcher — routes by geometry dimension |
| `algorithm/InteriorPointArea` / `core/src/algorithm/interior_point_area.rs`   | Scanline algorithm for polygons           |
| `algorithm/InteriorPointLine` / `core/src/algorithm/interior_point_line.rs`   | Nearest vertex to centroid for lines      |
| `algorithm/InteriorPointPoint` / `core/src/algorithm/interior_point_point.rs` | Nearest point to centroid for points      |

### Supporting Ports

Reached from the dispatcher through `Centroid`, which `InteriorPointLine` and
`InteriorPointPoint` call. Both languages carry the same set:

| Module                                                                                                    | Purpose                                                      |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `algorithm/Centroid` / `core/src/algorithm/centroid.rs`                                                   | `Centroid` — weighted centroid for any dimension             |
| `algorithm/Orientation` / `core/src/algorithm/orientation.rs`                                             | `Orientation.isCCW` and `index`                              |
| `algorithm/CGAlgorithmsDD` / `core/src/algorithm/cg_algorithms_dd.rs`                                     | Robust orientation predicate via double-double               |
| `math/DD` / `core/src/math/dd.rs`                                                                         | The `DD` extended-precision subset those predicates need     |
| `GeometryAdapter` / `core/src/geometry_adapter.rs`                                                        | The geometry-model boundary — see below                      |
| `Assert` / — (Rust uses `assert!`)                                                                        | Shim for JTS's `Assert`                                      |
| `geom/Location` / `core/src/geom/location.rs`                                                             | `Location` — the INTERIOR/BOUNDARY/EXTERIOR constants        |
| `algorithm/PointLocation` / `core/src/algorithm/point_location.rs`                                        | `PointLocation.locateInRing` and `isInRing`                  |
| `algorithm/RayCrossingCounter` / `core/src/algorithm/ray_crossing_counter.rs`                             | `RayCrossingCounter` — the crossing count and `countSegment` |
| `algorithm/locate/SimplePointInAreaLocator` / `core/src/algorithm/locate/simple_point_in_area_locator.rs` | `SimplePointInAreaLocator` — point-in-area location          |

Those four are the point-in-polygon stack. Unlike every other supporting port they are
**not reachable from the dispatcher**: they exist so both languages' world tests assert
containment with JTS-derived code instead of a third-party predicate. They are not
exported from `js/src/index.ts`, and in Rust they are declared `#[cfg(test)] mod` — which
is what keeps `rs/core/src` free of file-level `#![allow(dead_code)]` while they have no
runtime caller. The gate is that `js/src`'s four locator modules are the only modules
unreachable from `index.ts`; TypeScript cannot enforce that, so it is recorded here.

This stack replaced two third-party point-in-polygon dependencies
(`point-in-polygon-hao` in TS, `geo`'s `Contains` in Rust). The evidence for that
removal — 263,944 probes over all 8,397 rings of `world.wkt` against real JTS 1.19.0,
0 mismatches for both ports and for `geo::Contains`, 2 mismatches for
`point-in-polygon-hao` traced to an inexact IEEE 754 subtraction in its translated
`orient2d` call — lives as a comment in both world tests
(`js/test/algorithm/InteriorPointWorldTest.ts`, `rs/core/src/test/algorithm/interior_point_world_test.rs`).

Because the Rust locator is `#[cfg(test)]`, an integration test cannot see it:
the world test therefore lives at `rs/core/src/test/algorithm/interior_point_world_test.rs`
as a `#[cfg(test)] mod`, recorded with `@jts-deviate`, the same arrangement
`rs/core/src/test/algorithm/centroid_test.rs` uses. `rs/core/tests/` holds only
`algorithm/interior_point_test.rs` plus `utils/`. The TypeScript world test stays
in `js/test/`, since TypeScript tests can import unexported `js/src` modules directly.

Every one is reachable from the crate root, so `rs/core/src` carries no file-level
`#![allow(dead_code)]`. The eight that remain are per-item. Five are orientation
constants — `CLOCKWISE`, `COLLINEAR`, `RIGHT`, `LEFT`, `STRAIGHT` — which complete
JTS's constant set; `COUNTERCLOCKWISE` is the only one a build without `--all-targets`
reaches, because `RayCrossingCounter` (which reads `LEFT` and `COLLINEAR`) is
`#[cfg(test)]`. The other three are ported members with no caller inside the ported
subset: `RayCrossingCounter::get_count` and `is_point_in_polygon` (`locate_point_in_ring_*`
reads `get_location`), and `PointLocation::is_in_ring` (`SimplePointInAreaLocator` reads
`locate_in_ring`). Each attribute names its member and its reason.

### Adapter Boundary

`js/src/GeometryAdapter.ts` and `rs/core/src/geometry_adapter.rs` are the only places a
geometry-model helper may be defined; nothing else in `js/src` or `rs/core/src` may add one.
`js/src/Assert.ts` shims JTS's `Assert`; Rust maps it onto `assert!` directly.

### Type Mapping (JTS → TS / Rust)

| JTS                                | TypeScript                                         | Rust                             |
| ---------------------------------- | -------------------------------------------------- | -------------------------------- |
| `Coordinate`                       | `Coordinate` (adapter alias of GeoJSON `Position`) | `geo_types::Coord<f64>`          |
| `Geometry`                         | `GeoJSON.Geometry`                                 | `geo_types::Geometry<f64>`       |
| `Polygon`                          | `GeoJSON.Polygon`                                  | `geo_types::Polygon<f64>`        |
| `LinearRing` / `Coordinate[]`      | `Coordinate[]`                                     | `&[Coord<f64>]`                  |
| `Envelope`                         | adapter's `Envelope` record                        | `geo_types::Rect<f64>`           |
| `Geometry.isEmpty()`               | `isGeometryEmpty`                                  | `is_geometry_empty`              |
| `Geometry.getDimension()`          | `dimension`                                        | `dimension`                      |
| `Coordinate.distance(Coordinate)`  | `distance`                                         | `distance`                       |
| `LinearRing.getEnvelopeInternal()` | `envelopeInternal`                                 | `envelope_internal`              |
| `Envelope.intersects(Coordinate)`  | `envelopeIntersectsCoordinate`                     | `envelope_intersects_coordinate` |
| `Geometry.getEnvelopeInternal()`   | `envelopeInternalGeometry`                         | `envelope_internal_geometry`     |
| `Assert.isTrue`                    | `assertTrue` (`js/src/Assert.ts`)                  | `assert!`                        |
| `Orientation`                      | `algorithm/Orientation.ts`                         | `algorithm/orientation.rs`       |
| `List<Double>`                     | `number[]`                                         | `Vec<f64>` / `&mut [f64]`        |

`getEnvelopeInternal()` is one method on `Geometry` that `LinearRing` inherits, not a Java
overload, so the overload-suffix rule does not apply; the split into two functions exists because
neither target model has a supertype spanning rings and geometries, and the two are told
apart by their tags.

Rust computes the ring envelope in the adapter rather than through `geo`'s `BoundingRect`:
`geo` is a dev-dependency and the port adds no runtime ones, while `Rect` itself lives in
`geo-types`. It returns `Option<Rect<f64>>`, since `Rect` cannot represent the empty
envelope JTS returns for an empty ring; both take the "intersects nothing" path.

### Scanline Algorithm (Area)

1. Pick Y-coordinate that bisects bbox without hitting vertices (`ScanLineYOrdinateFinder`)
2. Compute edge intersections at that Y for each ring
3. Sort intersections, find longest interior interval, return its midpoint

### Test Structure

Both languages share the same test structure:

- `algorithm/InteriorPointTest.ts` / `tests/algorithm/interior_point_test.rs` — unit tests for all geometry types
- `algorithm/InteriorPointWorldTest.ts` / `src/test/algorithm/interior_point_world_test.rs` — integration tests using the `world.wkt` fixture from `upstream/jts/resources/`
- `InteriorPointAreaPerfTest.bench.ts` / `benches/` — benchmarks (tinybench / cargo bench)

`node:test` has no benchmark counterpart, so the TypeScript bench is not a test at all: it is a
plain script that drives tinybench itself and `pnpm bench:js` runs it with `node` directly. That
is also why it does not match the `*Test.ts` collection pattern below — it must not be collected.

`Centroid` is the exception: it is crate-internal in Rust, so `rs/core/tests/` cannot reach
it and its `TestCentroid.xml` test lives in its own file under `src/test/algorithm/`,
`rs/core/src/test/algorithm/centroid_test.rs`, recorded with `@jts-deviate`. That file reaches
the shared XML parser with `include!("../../../tests/utils/xml_test_parser.rs")` — `#[path] mod`
cannot, because its base directory would be a directory that does not exist.

The Rust world test is the second exception, for the same underlying reason: the point-in-polygon
locator it now asserts containment through is `#[cfg(test)]` (see Supporting Ports above), so
`rs/core/tests/` cannot reach it either. It lives instead at
`rs/core/src/test/algorithm/interior_point_world_test.rs` as a `#[cfg(test)] mod`, recorded with
`@jts-deviate`, and `rs/core/tests/` now holds only `algorithm/interior_point_test.rs` plus
`utils/`. The TypeScript world test is unaffected and stays in `js/test/`.

`js/package.json`'s `test` script hands `node --test` the glob `test/**/*Test.ts`, so a test file
not matching that pattern is silently skipped. `rs/core/Cargo.toml` needs a hand-written `[[test]]`
entry per integration test, since cargo auto-discovers only `tests/*.rs` and nothing under
`tests/algorithm/` otherwise.

Node runs the `.ts` files directly by type stripping — there is no bundler in the test path, so
two Node ESM rules bind every file under `js/src` and `js/test`:

- every relative import specifier carries an explicit `.ts` extension; extension search and
  directory indexes do not exist in ESM
- `__dirname` does not exist; fixtures resolve from `import.meta.dirname`

Type stripping erases types without checking them. `pnpm build:js` runs `tsc` over
`tsconfig.build.json`, which covers `src` only, so nothing in CI typechecks `js/test` — as was
already the case under the previous runner, which transformed the tests without checking them.
`cd js && npx tsc -p tsconfig.json --noEmit` covers both when you want it.

## Development Approach

- **TDD**: Port JTS tests first, then implement until tests pass

## Language & Style Rules

- All deliverables in **English** (code, comments, docs, commits)
- Commit messages: English, Conventional Commits format, single line
- TS style: 2-space indent, double quotes, semicolons, trailing commas, 120 char width (JTS-aligned)
- Rust style: standard `rustfmt` (core: edition 2024, wasm: edition 2021)
- Pre-commit hooks: `simple-git-hooks` + `lint-staged` (auto-runs eslint/prettier on TS, rustfmt on Rust)

## CI

GitHub Actions (`.github/workflows/ci.yml`):

- **test-js**: pnpm install → lint → format:check → test:js
- **test-rs**: cargo test --workspace → clippy --workspace --all-targets -D warnings → fmt --all --check
- **docs**: VitePress build → GitHub Pages deploy (main branch only)

## Reference

- JTS source: `org.locationtech.jts.algorithm.InteriorPoint*` ([locationtech/jts](https://github.com/locationtech/jts))
- Porting rules: [`docs/jts-porting-rules.md`](docs/jts-porting-rules.md) — the naming table, the adapter boundary, and the measured evidence behind them. Most comments across `js/src`, `rs/core/src` and `scripts/` refer to these rules by name; two are recorded there without one.
