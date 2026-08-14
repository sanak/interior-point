# Interior Point Benchmark

Nine interior-point / point-on-surface implementations, measured side by side against the same PLATEAU building
footprints, in your browser.

Live: <https://sanak.github.io/interior-point/examples/benchmark/>

## What it measures

| #   | Library                    | Call                             |
| --- | -------------------------- | -------------------------------- |
| 1   | interior-point (TS)        | `interiorPoint`                  |
| 2   | interior-point (TS)        | `centroidFirstInteriorPoint`     |
| 3   | interior-point (Rust/WASM) | `interiorPoint`                  |
| 4   | interior-point (Rust/WASM) | `centroidFirstInteriorPoint`     |
| 5   | jsts (JS port)             | `Geometry#getInteriorPoint`      |
| 6   | wasmts (Java/WASM)         | `InteriorPoint.getInteriorPoint` |
| 7   | geos-wasm (C++/WASM)       | `GEOSPointOnSurface`             |
| 8   | geo (Rust/WASM)            | `interior_point`                 |
| 9   | turf (JS)                  | `pointOnFeature`                 |

Rows 1–2 and 3–4 are this project's own TypeScript and Rust packages; the rest are independent implementations,
included to see how this port compares.

Each row is measured from a GeoJSON geometry in to an `[x, y]` pair out, so whatever conversion a library needs is
counted as that library's own cost — nothing is pre-converted outside the timed call. Verification of every
computed point uses this project's own TypeScript `verifyInteriorPoint`, checked against the geometry through an
independent point-in-polygon locator; rows 1–2 are therefore self-verification, not an outside check.

Every row runs the dataset twice and only the second pass is timed. Without that warm-up, whichever row ran first
paid for tiering up the code every row shares: on the shipped dataset it reported up to twice the figure it
settled on over later presses of **Run all**, and reversing the row order carried the penalty to whatever row had
become first. A full untimed pass removes it — a row's number no longer depends on where it sits in the table or
on how many times **Run all** has been pressed — at the cost of roughly a 65% longer sweep.

`Load (ms)` is measured once per library per page. The column keeps that first figure through later runs and
through a dropped dataset, because loading does not happen again.

## Dataset

Ships with `public/data/plateau-hiroshima-bldg.parquet`, 6769 LOD0 building footprints from
[PLATEAU Hiroshima 2024](https://www.geospatial.jp/ckan/dataset/plateau-34100-hiroshima-shi-2024) (MLIT), converted
to GeoParquet in EPSG:4326.

To regenerate it from the source CityGML — requires `curl`, `jq`, `unzip`, and a GDAL build with both the GML and
Parquet drivers:

```bash
./data/download-and-extract-citygml.sh
./data/convert-citygml-to-geoparquet.sh
```

Drop your own `.geojson` file onto the page to measure it instead — the dataset it replaces is not committed
anywhere, so nothing here needs to know about it in advance.

## Data license

PLATEAU Hiroshima 2024 (MLIT) is licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The code in
this directory is covered by the repository's own [MIT license](../../LICENSE).

## Development

```bash
pnpm install
pnpm build:js
pnpm examples:wasm
pnpm examples:dev
```

`pnpm build:js` builds the `interior-point` TypeScript package this app depends on as a workspace package, and
`pnpm examples:wasm` builds the two WASM crates rows 3–4 and row 8 call into — both have to run before `dev`,
`build`, `test` or `typecheck` see rows 3, 4 and 8 resolve.

## Testing

```bash
pnpm test:examples
```

## Production build

```bash
pnpm build:js
pnpm examples:wasm
pnpm examples:build
```

Writes `examples/benchmark/dist/`, built with `base: "/interior-point/examples/benchmark/"` — the path this app is
served from once deployed alongside the documentation site.
