---
layout: doc
---

# Benchmarks

Two benchmarks live in this repository, and they deliberately measure opposite ends of the same work.

| Benchmark           | Measures                                            | Answers                                                          |
| ------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| In the browser      | one library call, a geometry in and an `[x, y]` out | how this port compares to eight other implementations            |
| On the command line | the whole process, from shell to written file       | what a person waits for when they run `interior-point` on a file |

The first has no published numbers on purpose: it runs in your browser, on your machine, and reports what it finds
there. The second does, because a command's cost is dominated by things a browser never pays for — process startup,
file reading, serialisation — and those need a fixed machine to be comparable at all.

Both run over the same dataset: 6769 LOD0 building footprints from
[PLATEAU Hiroshima 2024](https://www.geospatial.jp/ckan/dataset/plateau-34100-hiroshima-shi-2024) (MLIT), in
EPSG:4326, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## In the browser

Nine interior-point / point-on-surface implementations, measured side by side against those building footprints.

**[Run it &rarr;](https://sanak.github.io/interior-point/examples/benchmark/)**

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

Rows 1–4 are this project's own packages; the rest are independent implementations, included to see how this port
compares.

Every row is measured from a GeoJSON geometry in to an `[x, y]` pair out, so whatever conversion a library needs is
counted as that library's own cost — nothing is pre-converted outside the timed call. Each row runs the dataset
twice and only the second pass is timed, because without that warm-up whichever row ran first paid for tiering up
the code every row shares, and reversing the row order carried the penalty to whatever row had become first.

Verification of every computed point uses this project's own TypeScript `verifyInteriorPoint`, so rows 1–2 are
self-verification rather than an outside check.

Drop a `.geojson`, `.json` or `.parquet` file onto the page to measure your own data instead.

## On the command line

Three command-line implementations — this port's npm package, this port's crate, and JTS's own `jtsop` — timed over
one GeoJSON file of the same footprints.

| Tool                     | Command                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| `interior-point` (npm)   | `interior-point -i <in> -o <out>`                                     |
| `interior-point` (crate) | `interior-point -i <in> -o <out>`                                     |
| JTS `jtsop`              | `jtsop -a <in> -eacha -f geojson -o <out> Construction.interiorPoint` |

Each tool is timed three ways, and the columns are the differences between them:

| Column           | Run                                       | Meaning                                      |
| ---------------- | ----------------------------------------- | -------------------------------------------- |
| `Full`           | whole dataset, writing output             | what the shell waits for                     |
| `Startup`        | a one-feature copy, writing output        | process start and runtime init               |
| `Read + compute` | whole dataset under `-q`, minus `Startup` | parsing the input and computing the points   |
| `Write`          | `Full` minus the `-q` run                 | serialising and writing the result           |
| `Self-timed`     | each tool's own timing flag               | the operation alone, by the tool's own clock |

`Self-timed` is the one figure the three measure identically, each with its own stopwatch around the operation and
nothing else: `jtsop -time` reports it directly, and both CLIs report it as the `compute` phase of
[`--time`](/cli#timing). Subtracting it from `Read + compute` leaves parsing.

### Results

2.6 MB of GeoJSON, all MultiPolygon. Median of 25 runs after 3 warm-up runs, on an Apple M1 Pro / macOS 26.6.1, with
Node v22.22.0, rustc 1.97.1 and OpenJDK 17.0.20. All figures in milliseconds.

| Tool                     |  Full | min–max     | Startup | Read + compute | Write | Self-timed |
| ------------------------ | ----: | ----------- | ------: | -------------: | ----: | ---------: |
| `interior-point` (npm)   |  85.2 | 83.0–91.2   |    43.0 |           40.6 |   1.5 |       10.8 |
| `interior-point` (crate) |  53.9 | 52.9–58.9   |     4.0 |           39.5 |  10.4 |        1.0 |
| JTS `jtsop`              | 430.4 | 413.2–459.0 |   136.4 |          234.1 |  59.9 |       20.0 |

Numbers from one machine on one dataset. What the columns say about each other travels; the absolute values do not.

### Reading them

**Almost none of this is the algorithm.** `Self-timed` against `Full`: 13% for the npm CLI, 2% for the crate, 5% for
`jtsop`. Everything else is process startup, GeoJSON parsing and GeoJSON writing. Every difference in this table is
therefore in the I/O path rather than in the ported code — which is what makes the next line surprising.

**The two ports look equally fast on the dataset for two opposite reasons.** `Read + compute` is 40.6 ms for the npm
CLI against 39.5 ms for the crate, a 3% gap that reads like parity. It is not: the crate computes in 1.0 ms where the
npm CLI takes 10.8, and parses in the 38.5 ms left over where the npm CLI takes 29.8. An 11× win on the algorithm and
a 29% loss on the parser nearly cancel. The single number hid both; the phase split is what recovered them.

**The crate pays for byte-for-byte agreement twice.** Its parser carries `float_roundtrip` and `preserve_order`, and
its writer assembles GeoJSON numbers by hand from `ryu`'s digits — both so that the two CLIs agree exactly, which
they do. That shows up as the slower parse above and as 10.4 ms of `Write` against 1.5 ms, where the npm CLI hands
the whole structure to V8's `JSON.stringify` in one native pass. Together it is roughly 18 ms, and the crate still
finishes 31 ms ahead on startup alone.

**`jtsop` is not trying to be a batch tool.** It is JTS's debugging CLI, meant for one geometry at a time, and 430 ms
for 6769 of them is the price of a JVM plus a `GeoJsonReader` that builds a `LinkedHashMap` per geometry: 214 ms of
the run is parsing. Its 20 ms of operation is measured inside a process that lives under half a second, so it
includes whatever JIT warm-up happens in that window and should be read as an upper bound rather than JTS's
steady-state speed.

### Agreement

The three commands do not just run at different speeds; they were checked against each other on all 6769 buildings:

- the npm and crate outputs are **byte-for-byte identical**
- every point agrees with `jtsop` to 8 decimal places, the precision JTS's `GeoJsonWriter` emits; the largest
  difference is 5.0e-9, which is that rounding and nothing else

`jtsop` writes one geometry per line rather than a FeatureCollection, so the comparison is over parsed coordinates,
not over bytes.

### Caveats

- The input carries no attributes. `ogr2ogr -select ""` drops them, because `jtsop` discards properties on the way
  through and keeping them would charge the two CLIs that do preserve them for work the third never does.
- The npm CLI is measured from `js/dist`, the local build of what gets published, not from an installed
  `interior-point` package.
- `jtsop` is built from a JTS checkout, so it reports whatever that checkout is. At the pinned upstream commit that
  is `1.21.0-SNAPSHOT`, one commit range past the 1.20.0 tag.
- Every tool writes to a real file in a temporary directory, so file I/O is counted for all three alike.

## Running them yourself

Both benchmarks live under `examples/` in the repository, and each README covers the build steps, the flags and how
the dataset is regenerated:

- [`examples/benchmark`](https://github.com/sanak/interior-point/tree/main/examples/benchmark) — the browser
  benchmark
- [`examples/cli-benchmark`](https://github.com/sanak/interior-point/tree/main/examples/cli-benchmark) — the
  command-line benchmark

The command-line runner leaves `jtsop` out unless it is given a path to a JTS jar, so comparing the two CLIs alone
needs no JDK and no JTS checkout.
