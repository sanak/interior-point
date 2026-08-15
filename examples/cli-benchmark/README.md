# Interior Point CLI Benchmark

Three command-line interior-point implementations — this port's npm package, this port's crate, and
JTS's own `jtsop` — timed over one GeoJSON file of PLATEAU building footprints.

The [browser benchmark](../benchmark/) next door measures nine libraries from a GeoJSON geometry in
to an `[x, y]` pair out, with no process and no file in the way. This one measures the opposite: the
whole command, from shell to written output, which is what a person actually waits for.

## What it measures

| Tool                     | Command                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| `interior-point` (npm)   | `interior-point -i <in> -o <out>`                                     |
| `interior-point` (crate) | `interior-point -i <in> -o <out>`                                     |
| JTS `jtsop`              | `jtsop -a <in> -eacha -f geojson -o <out> Construction.interiorPoint` |

All three read the same GeoJSON FeatureCollection and write one point per feature. `-eacha` is what
makes `jtsop` do that: JTS's `GeoJsonReader` turns a FeatureCollection into a GeometryCollection, and
`-eacha` runs the operation once per element.

Each tool is timed three ways, and the columns are the differences between them:

| Column           | Run                                       | Meaning                                      |
| ---------------- | ----------------------------------------- | -------------------------------------------- |
| `Full`           | whole dataset, writing output             | what the shell waits for                     |
| `Startup`        | a one-feature copy, writing output        | process start and runtime init               |
| `Read + compute` | whole dataset under `-q`, minus `Startup` | parsing the input and computing the points   |
| `Write`          | `Full` minus the `-q` run                 | serialising and writing the result           |
| `Self-timed`     | each tool's own timing flag               | the operation alone, by the tool's own clock |

The `-q` subtraction only holds because all three skip serialisation entirely under the flag rather
than serialising and discarding, which was checked in each one's source.

`Self-timed` is the one figure the three measure identically, each with its own stopwatch around the
operation and nothing else: `jtsop -time` reports it directly, and both CLIs report it as the
`compute` phase of `--time`. Subtracting it from `Read + compute` leaves parsing.

Before timing anything the runner runs each tool once and counts the points it produced, so a tool
that quietly did less work cannot be reported as a fast one.

## Setup

```sh
# 1. the input, converted from the browser benchmark's GeoParquet (needs GDAL with the Parquet driver)
./data/convert-parquet-to-geojson.sh

# 2. the npm CLI
pnpm build:js                                                    # from the repository root

# 3. the crate CLI
cargo build --release -p interior-point --features cli           # from rs/

# 4. jtsop, from a JTS checkout (needs Maven)
mvn -pl modules/app -am package -DskipTests                      # writes modules/app/target/JTSTestBuilder.jar
```

The converted GeoJSON is not committed — it is derived from
`../benchmark/public/data/plateau-hiroshima-bldg.parquet`, which is.

## Running

```sh
node run.mjs --jts-jar=/path/to/JTSTestBuilder.jar
```

`JTS_JAR` works in place of `--jts-jar`. Without either, the run leaves `jtsop` out and compares the
two CLIs alone, so no JDK or JTS checkout is needed to use this. `--runs=N` and `--warmup=N` set the
sample counts, `--input=<file>` points at a different GeoJSON.

## Results

6769 LOD0 building footprints from [PLATEAU Hiroshima 2024](https://www.geospatial.jp/ckan/dataset/plateau-34100-hiroshima-shi-2024)
(MLIT), 2.6 MB of GeoJSON, all MultiPolygon. Median of 25 runs after 3 warm-up runs, on an Apple M1
Pro / macOS 26.6.1, with Node v22.22.0, rustc 1.97.1 and OpenJDK 17.0.20. All figures in
milliseconds.

| Tool                     |  Full | min–max     | Startup | Read + compute | Write | Self-timed |
| ------------------------ | ----: | ----------- | ------: | -------------: | ----: | ---------: |
| `interior-point` (npm)   |  85.2 | 83.0–91.2   |    43.0 |           40.6 |   1.5 |       10.8 |
| `interior-point` (crate) |  53.9 | 52.9–58.9   |     4.0 |           39.5 |  10.4 |        1.0 |
| JTS `jtsop`              | 430.4 | 413.2–459.0 |   136.4 |          234.1 |  59.9 |       20.0 |

Numbers from one machine on one dataset. What the columns say about each other travels; the absolute
values do not.

### Reading them

**Almost none of this is the algorithm.** `Self-timed` against `Full`: 13% for the npm CLI, 2% for
the crate, 5% for `jtsop`. Everything else is process startup, GeoJSON parsing and GeoJSON writing.
Every difference in this table is therefore in the I/O path rather than in the ported code — which is
what makes the next line surprising.

**The two ports look equally fast on the dataset for two opposite reasons.** `Read + compute` is
40.6 ms for the npm CLI against 39.5 ms for the crate, a 3% gap that reads like parity. It is not:
the crate computes in 1.0 ms where the npm CLI takes 10.8, and parses in the 38.5 ms left over where
the npm CLI takes 29.8. An 11× win on the algorithm and a 29% loss on the parser nearly cancel. The
single number hid both; the phase split is what recovered them.

**The crate pays for byte-for-byte agreement twice.** Its parser carries `float_roundtrip` and
`preserve_order`, and its writer assembles GeoJSON numbers by hand from `ryu`'s digits — both so that
the two CLIs agree exactly, which they do. That shows up as the slower parse above and as 10.4 ms of
`Write` against 1.5 ms, where the npm CLI hands the whole structure to V8's `JSON.stringify` in one
native pass. Together it is roughly 18 ms, and the crate still finishes 31 ms ahead on startup alone.

**`jtsop` is not trying to be a batch tool.** It is JTS's debugging CLI, meant for one geometry at a
time, and 430 ms for 6769 of them is the price of a JVM plus a `GeoJsonReader` that builds a
`LinkedHashMap` per geometry: 214 ms of the run is parsing. Its 20 ms of operation is measured inside
a process that lives under half a second, so it includes whatever JIT warm-up happens in that window
and should be read as an upper bound rather than JTS's steady-state speed.

### Agreement

The three commands do not just run at different speeds; they were checked against each other on all
6769 buildings:

- the npm and crate outputs are **byte-for-byte identical**
- every point agrees with `jtsop` to 8 decimal places, the precision JTS's `GeoJsonWriter` emits;
  the largest difference is 5.0e-9, which is that rounding and nothing else

`jtsop` writes one geometry per line rather than a FeatureCollection, so the comparison is over parsed
coordinates, not over bytes.

## Caveats

- The input carries no attributes. `ogr2ogr -select ""` drops them, because `jtsop` discards
  properties on the way through and keeping them would charge the two CLIs that do preserve them for
  work the third never does.
- The npm CLI is measured from `js/dist`, the local build of what gets published, not from an
  installed `interior-point` package.
- `jtsop` is built from a JTS checkout, so it reports whatever that checkout is. At
  `upstream/jts/pin.json`'s commit that is `1.21.0-SNAPSHOT`, one commit range past the 1.20.0 tag.
- Every tool writes to a real file in a temporary directory, so file I/O is counted for all three
  alike.

## Data license

PLATEAU Hiroshima 2024 (MLIT) is licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The code in this directory is covered by the repository's own [MIT license](../../LICENSE).
