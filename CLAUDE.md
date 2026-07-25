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
- `testdata/` — Locally generated test fixtures only (upstream fixtures live under `upstream/jts/resources/`)

Anything under `docs/` outside `docs/site/` is invisible to VitePress. To publish a document, move it into `docs/site/`. Do not reach for `srcExclude` — the boundary is the directory.

## Commands

### TypeScript (from repo root)

```bash
pnpm install              # install dependencies
pnpm test:js              # run TS tests (vitest)
pnpm build:js             # build TS library (tsc)
pnpm lint                 # eslint
pnpm lint:fix             # eslint --fix
pnpm format               # prettier --write
pnpm format:check         # prettier --check
```

Single test: `cd js && npx vitest run test/interiorPoint.test.ts`
Watch mode: `cd js && npx vitest`

### Rust (from repo root)

```bash
pnpm test:rs              # cargo test --workspace
cd rs && cargo test -p interior-point -- test_name   # single test
cd rs && cargo clippy --workspace -- -D warnings
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
labelled `jts-drift`. `anchors` is not yet wired into `ci.yml`: the robust predicate stack
(`Orientation`, `CGAlgorithmsDD`, `DD`) and `Centroid` are anchored, but the four
`InteriorPoint*` files are not, so `anchors` still reports 39 of 71 in-scope members as
unported and exits 1. It joins CI with the retrofit of those four.

A `pin.json` file entry may declare `portedMembers`, listing the only members required to
carry a `@jts` anchor — that is how a deliberately partial port (`DD`: 10 of 73 members)
avoids 63 spurious `@jts-omit` tags. A file entry without the field requires full coverage.

Ported JTS _tests_ are pinned the same way: `CentroidTest.java` is vendored with a
two-member `portedMembers`, because an `@jts` anchor must name a vendored file and the
ported test methods carry anchors like any other port.

`check` currently reports `upstream/jts/math/DD.java` as DRIFTED: upstream `master` added a
`hashCode()` after the pinned commit. That is real upstream movement outside the ported
subset, not a local edit — all 12 pinned files still match their recorded `sha256`.

## Public API

### TypeScript

```ts
interiorPoint(geometry: Geometry | null): Coordinate | null
```

Single dispatcher function exported from `js/src/index.ts`, alongside the `Coordinate` type.
`Coordinate` is `js/src/geometryAdapter.ts`'s alias of GeoJSON's `Position` and carries JTS's
name for it; an ESLint rule bans importing `Position` inside `js/src/**` so the adapter stays
the single place the GeoJSON name appears. The three `interiorPoint*` modules are exempt
until they are retrofitted onto the adapter.

### Rust

```rust
pub fn interior_point(geometry: &Geometry<f64>) -> Option<Coord<f64>>
```

## Architecture

### Core Algorithm (4 modules per language)

Each language implements the same 4 files mirroring JTS:

| Module                                                    | Purpose                                   |
| --------------------------------------------------------- | ----------------------------------------- |
| `interiorPoint` / `core/src/lib.rs`                       | Dispatcher — routes by geometry dimension |
| `interiorPointArea` / `core/src/interior_point_area.rs`   | Scanline algorithm for polygons           |
| `interiorPointLine` / `core/src/interior_point_line.rs`   | Nearest vertex to centroid for lines      |
| `interiorPointPoint` / `core/src/interior_point_point.rs` | Nearest point to centroid for points      |

### Supporting Ports

Ported from JTS but not yet reachable from the dispatcher — the `interiorPoint*` retrofit
wires them up. Both languages carry the same set:

| Module                                            | Purpose                                                  |
| ------------------------------------------------- | -------------------------------------------------------- |
| `centroid` / `core/src/centroid.rs`               | `Centroid` — weighted centroid for any dimension         |
| `orientation` / `core/src/orientation.rs`         | `Orientation.isCCW` and `index`                          |
| `cgAlgorithmsDD` / `core/src/cg_algorithms_dd.rs` | Robust orientation predicate via double-double           |
| `dd` / `core/src/dd.rs`                           | The `DD` extended-precision subset those predicates need |

Because Rust decides `dead_code` by reachability from the crate root, all four carry a
file-level `#![allow(dead_code)]` until the retrofit lands. Each attribute's comment names
what removes it.

### Adapter Boundary

`js/src/geometryAdapter.ts` and `rs/core/src/geometry_adapter.rs` are the only places a
geometry-model helper may be defined; nothing else in `js/src` or `rs/core/src` may add one.
`js/src/assert.ts` shims JTS's `Assert`; Rust maps it onto `assert!` directly.

### Type Mapping (JTS → TS / Rust)

- `Coordinate` → `Coordinate` (`geometryAdapter`'s alias of GeoJSON `Position`, i.e. `number[]`) / `Coord<f64>`
- `Geometry` → `GeoJSON.Geometry` / `geo::Geometry<f64>`
- `Polygon` → `GeoJSON.Polygon` / `geo::Polygon<f64>`
- `Envelope` → `geometryAdapter`'s `Envelope` record / `geo::Rect<f64>`

### Scanline Algorithm (Area)

1. Pick Y-coordinate that bisects bbox without hitting vertices (`ScanLineYOrdinateFinder`)
2. Compute edge intersections at that Y for each ring
3. Sort intersections, find longest interior interval, return its midpoint

### Test Structure

Both languages share the same test structure:

- `interiorPoint.test.ts` / `interior_point_test.rs` — unit tests for all geometry types
- `interiorPointWorld.test.ts` / `interior_point_world_test.rs` — integration tests using the `world.wkt` fixture from `upstream/jts/resources/`
- `interiorPoint.bench.ts` / `benches/` — benchmarks (vitest bench / cargo bench)

`Centroid` is the exception: it is crate-internal in Rust, so `rs/core/tests/` cannot reach
it and its `TestCentroid.xml` test lives in a `#[cfg(test)] mod tests` inside `centroid.rs`,
recorded with `@jts-deviate`. That module reaches the shared XML parser with
`include!("../tests/utils/xml_test_parser.rs")` — `#[path] mod` cannot, because its base
directory would be the non-existent `core/src/centroid/`.

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
- **test-rs**: cargo test --workspace → clippy --workspace -D warnings → fmt --all --check
- **docs**: VitePress build → GitHub Pages deploy (main branch only)

## Reference

- JTS source: `org.locationtech.jts.algorithm.InteriorPoint*` ([locationtech/jts](https://github.com/locationtech/jts))
