# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Port of JTS (Java Topology Suite) InteriorPoint algorithm to **TypeScript** and **Rust** as independent libraries. The algorithm computes a representative point guaranteed to lie inside a geometry (scanline approach for polygons, nearest-to-centroid for lines/points).

## Monorepo Structure (pnpm workspace)

- `js/` — TypeScript library (`interior-point`), GeoJSON-native; the library has no runtime
  dependencies, and the bundled CLI uses `betterknown`
- `docs/` — All project documentation. **Only `docs/site/` is published.**
  - `docs/site/` — VitePress source directory (`srcDir`), deployed to GitHub Pages (base: `/interior-point/`)
  - `docs/site/public/` — Static assets copied to the site root
- `upstream/jts/` — Verbatim copies of the tracked JTS sources and test resources, pinned by `upstream/jts/pin.json`. Never edit these files; see `upstream/jts/NOTICE.md`.
  `upstream/jts/main/`, `upstream/jts/test/`, and `upstream/jts/resources/` mirror JTS's Maven layout, and `js/src`/`rs/core/src` mirror `upstream/jts/main/` while `js/test`/`rs/core/tests`+`rs/core/src/test` mirror `upstream/jts/test/`, so each pair can be folder-diffed directly.
- `testdata/` — Locally generated test fixtures only (upstream fixtures live under `upstream/jts/resources/`)

Anything under `docs/` outside `docs/site/` is invisible to VitePress. To publish a document, move it into `docs/site/`. Do not reach for `srcExclude` — the boundary is the directory.

## Commands

### Upstream JTS sync

Every ported member carries a `@jts` anchor; `node scripts/jts-sync.mjs anchors` enforces this in
CI on every push, and `.github/workflows/jts-drift.yml` checks upstream drift weekly. For the full
sync workflow, `pin.json`/`portedMembers` semantics, and the vendored-test rules, invoke the
`jts-upstream-sync` skill.

### Citation guard

`node scripts/jts-citations.mjs` scans tracked files for comments citing something outside this
repository — a design doc, a numbered task, a numbered rule — and exits non-zero if it finds one;
it runs in `ci.yml` beside `anchors` and is covered by `pnpm test:scripts`.

### CLI

`cargo test --workspace` alone does **not** exercise the Rust CLI: the `cli` feature is off by
default, so the binary is not built and `tests/cli/` is not run. Pass `--all-features` to
`cargo test`, `cargo clippy --all-targets` and `cargo build` — `--all-targets` does not imply it —
which is what `ci.yml` and the root `test:rs` script do. `cargo fmt` walks the module tree rather
than the feature graph and needs no flag.

Run the binary from a checkout with `cargo run -p interior-point --features cli -- -i "POINT (1 2)"`,
and install it with `cargo install interior-point --features cli`.

## Public API

`Coordinate` is `js/src/GeometryAdapter.ts`'s alias of GeoJSON's `Position` and carries JTS's
name for it; an ESLint rule bans importing `Position` inside `js/src/**` so the adapter stays
the single place the GeoJSON name appears. The rule has no exemptions.

## Architecture

### Supporting Ports

Reached from the `interiorPoint`/`interior_point` dispatcher through `Centroid`, which `InteriorPointLine` and
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
**not reachable from the `interiorPoint`/`interior_point` dispatcher**: they are reached from
`verifyInteriorPoint`/`verify_interior_point`, which checks a computed point against the geometry
it came from using JTS-derived code instead of a third-party predicate. Both languages' world tests
assert containment through the same stack. Reachable is not the same as published: they are still
not exported from `js/src/index.ts`, and in Rust they are still `pub(crate)` — `interior_point`,
`verify_interior_point` and `InteriorPointVerification` are the crate's entire public surface. What
changed in Rust is the gate alone: these modules were declared `#[cfg(test)] mod` and are now
compiled into every build, because a published library item calls them. So `js/src` now has no
module unreachable from its two roots, `index.ts` and `bin/interior-point.ts`; TypeScript cannot
enforce that, so it is recorded here. Rust has the same two roots — the library's `lib.rs` and the
`interior-point` binary — and its CLI modules hang off a `#[cfg(feature = "cli")] pub mod cli`, so
they are reachable whenever the feature is on and compiled out entirely when it is not.

This stack replaced two third-party point-in-polygon dependencies
(`point-in-polygon-hao` in TS, `geo`'s `Contains` in Rust). The evidence for that
removal — 263,944 probes over all 8,397 rings of `world.wkt` against real JTS 1.19.0,
0 mismatches for both ports and for `geo::Contains`, 2 mismatches for
`point-in-polygon-hao` traced to an inexact IEEE 754 subtraction in its translated
`orient2d` call — lives as a comment in both world tests
(`js/test/algorithm/InteriorPointWorldTest.ts`, `rs/core/src/test/algorithm/interior_point_world_test.rs`).

Because the Rust locator is `pub(crate)`, an integration test still cannot see it: such a test links
against the crate from outside and reaches only the three published items. The world test therefore
stays at `rs/core/src/test/algorithm/interior_point_world_test.rs` as a `#[cfg(test)] mod`, recorded
with `@jts-deviate`, the same arrangement `rs/core/src/test/algorithm/centroid_test.rs` uses. The
TypeScript world test stays in `js/test/`, since TypeScript tests can import unexported `js/src`
modules directly.

Every one is reachable from the crate root, so `rs/core/src` carries no file-level
`#![allow(dead_code)]`. The eight that remain are per-item, and un-gating the locator
stack changed which items they are rather than how many. Three are orientation
constants — `CLOCKWISE`, `RIGHT` and `STRAIGHT` — which complete JTS's constant set and
have no reader anywhere in the crate. `COLLINEAR` and `LEFT` no longer carry one: their
reader `RayCrossingCounter::count_segment` is compiled into every build now that the
stack is un-gated, so `COUNTERCLOCKWISE` is no longer the only constant a build without
`--all-targets` reaches. Three are ported members with no caller inside the ported
subset: `RayCrossingCounter::get_count` and `is_point_in_polygon`
(`locate_point_in_ring_*` reads `get_location`), and `PointLocation::is_in_ring`
(`SimplePointInAreaLocator` reads `locate_in_ring`). The last two are
`SimplePointInAreaLocator`'s struct and its `impl` block, which nothing constructs —
`verify_interior_point` reaches the free `locate` directly — and which are ported
because `pin.json` names the constructor and the instance method in `portedMembers`.
Each attribute names its member and its reason.

### Adapter Boundary

`js/src/GeometryAdapter.ts` and `rs/core/src/geometry_adapter.rs` are the only places a
geometry-model helper may be defined; nothing else in `js/src` or `rs/core/src` may add one.
`js/src/Assert.ts` shims JTS's `Assert`; Rust maps it onto `assert!` directly.

### CLI

Both languages ship a CLI inside the existing package/crate. It is an original surface tagged
`@jts-adapter`, taking JTS's `jtsop` (`org.locationtech.jtstest.cmd.JTSOpCmd`) as prior art;
nothing is ported from it, so `upstream/jts/pin.json` and the drift check are unaffected.

| Module                                            | Responsibility                                             |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `cli/args.ts` / `cli/args.rs`                     | flag declarations and parsing → an options record          |
| `cli/io.ts` / `cli/io.rs`                         | read input, detect its format, parse to records, serialise |
| `cli/run.ts` / `cli/run.rs`                       | `run(argv, out, err, readStdin) -> exit code`              |
| `bin/interior-point.ts` / `bin/interior_point.rs` | process wiring only: argv, stdin, stdout/stderr, exit code |
| — / `cli/mod.rs`                                  | submodule declarations; ES modules need no counterpart     |

`run` writes to caller-supplied sinks and returns the exit code, so both languages test the CLI
in-process — no subprocess, no stdout scraping. `bin/` holds the only process access and is not
unit-tested. Both halves of format knowledge sit in `io`; `run` never names a format.

In TypeScript the CLI is emitted by a dedicated `tsc` pass (`js/tsconfig.cli.json`) and
`betterknown` is a runtime dependency of the package. In Rust the whole `cli` module is
`#[cfg(feature = "cli")]` and the `[[bin]]` target carries `required-features = ["cli"]`; `cli`
is **not** in `default`, so a library consumer pulls none of `wkt`, `geojson`, `clap`, `ryu`,
`serde`, `serde_json` or `serde_json_lenient`. The
`[[bin]]` entry is written out rather than left to cargo's `src/bin/` auto-discovery, because
the inferred target would be named `interior_point` while the published command is
`interior-point`.

`wkt` is declared twice in `rs/core/Cargo.toml` on purpose — optional under `[dependencies]` for
the CLI, and plain under `[dev-dependencies]` so the WKT test helpers still build with the
feature off.

The Rust CLI reads the GeoJSON Feature envelope through `serde_json_lenient`'s `preserve_order`
rather than `geojson`, so member order survives parsing; `geojson` still owns every geometry
shape. `cli/io.rs` records why no `serde_json` configuration reaches the same place. Its GeoJSON
numbers are written by hand from `ryu`'s digits, because JavaScript has no integer type and the
two CLIs are held to byte-for-byte agreement; `float_roundtrip` on both JSON crates is what keeps
the read side exact.

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

### Test Structure

Both languages mirror the same test structure. `Centroid` is the exception: it is crate-internal in Rust, so `rs/core/tests/` cannot reach
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

`js/package.json`'s `test` script hands `node --import tsx --test` the glob `test/**/*Test.ts`, so a
test file not matching that pattern is silently skipped. The glob is mandatory: without it the runner
also collects `test/InteriorPointAreaPerfTest.bench.ts` and executes the benchmark as a test.
`rs/core/Cargo.toml` needs a hand-written `[[test]]` entry per integration test, since cargo
auto-discovers only `tests/*.rs` and nothing under `tests/algorithm/` otherwise.

Every `js/` script that hands a `.ts` file to Node — `test`, `test:watch`, `bench` — runs it through
`node --import tsx`, and fixtures resolve from `import.meta.dirname`, not `__dirname`. Every relative
import under `js/src` and `js/test` carries an explicit `.ts` extension, permitted by
`js/tsconfig.json`'s `allowImportingTsExtensions` and turned into `.js` in the emitted CLI by
`js/tsconfig.cli.json`'s `rewriteRelativeImportExtensions`. tsx does not typecheck, and no type-aware
ESLint rule is enabled, so `pnpm typecheck:js` is the only command covering `js/test`;
`pnpm build:js` typechecks `src` alone.

## Development Approach

- **TDD**: Port JTS tests first, then implement until tests pass

## Language & Style Rules

- All deliverables in **English** (code, comments, docs, commits)
- Commit messages: English, Conventional Commits format, single line
- The `printWidth` of 120 in `.prettierrc` is JTS-aligned, not a default — keep it

## Reference

- JTS source: `org.locationtech.jts.algorithm.InteriorPoint*` ([locationtech/jts](https://github.com/locationtech/jts))
- Porting rules: [`docs/jts-porting-rules.md`](docs/jts-porting-rules.md) — the naming table, the adapter boundary, and the measured evidence behind them. Most comments across `js/src`, `rs/core/src` and `scripts/` refer to these rules by name; two are recorded there without one.
