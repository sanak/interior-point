# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Port of JTS (Java Topology Suite) InteriorPoint algorithm to **TypeScript** and **Rust** as independent libraries. The algorithm computes a representative point guaranteed to lie inside a geometry (scanline approach for polygons, nearest-to-centroid for lines/points).

## Monorepo Structure (pnpm workspace)

- `js/` — TypeScript library (`interior-point`), GeoJSON-native, zero dependencies
- `rs/` — Rust workspace
  - `rs/core/` — Core Rust crate (`interior-point`), uses `geo-types` crates
  - `rs/wasm/` — WASM bindings crate (`interior-point-wasm`)
- `docs/` — VitePress documentation (base: `/interior-point/`)
- `examples/` — Sample apps
- `testdata/` — Shared test data (XML test fixtures from JTS, WKT files)

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
pnpm test                 # runs test:js && test:rs
pnpm bench                # runs bench:js && bench:rs
```

### Docs

```bash
pnpm docs:dev             # dev server
pnpm docs:build           # production build
```

## Public API

### TypeScript

```ts
interiorPoint(geometry: Geometry | null): Position | null
```

Single dispatcher function exported from `js/src/index.ts`.

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

### Type Mapping (JTS → TS / Rust)

- `Coordinate` → `Position` ([number, number]) / `Coord<f64>`
- `Geometry` → `GeoJSON.Geometry` / `geo::Geometry<f64>`
- `Polygon` → `GeoJSON.Polygon` / `geo::Polygon<f64>`
- `Envelope` → inline bbox computation (no named type) / `geo::Rect<f64>`

### Scanline Algorithm (Area)

1. Pick Y-coordinate that bisects bbox without hitting vertices (`ScanLineYOrdinateFinder`)
2. Compute edge intersections at that Y for each ring
3. Sort intersections, find longest interior interval, return its midpoint

### Test Structure

Both languages share the same test structure:

- `interiorPoint.test.ts` / `interior_point_test.rs` — unit tests for all geometry types
- `interiorPointWorld.test.ts` / `interior_point_world_test.rs` — integration tests using XML fixtures from `testdata/`
- `interiorPoint.bench.ts` / `benches/` — benchmarks (vitest bench / cargo bench)

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
