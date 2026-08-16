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
# 1. the npm CLI
pnpm build:js                                                    # from the repository root

# 2. the crate CLI
cargo build --release -p interior-point --features cli           # from rs/

# 3. jtsop, from a JTS checkout (needs Maven)
mvn -pl modules/app -am package -DskipTests                      # writes modules/app/target/JTSTestBuilder.jar
```

The input is `../data/plateau-hiroshima-bldg-no-attributes.geojson`, committed alongside the browser
benchmark's own dataset — see [`../data/README.md`](../data/README.md). It carries no attributes because
`jtsop` discards properties on the way through, so keeping them would charge the two commands that do
preserve them for work the third never does.

## Running

```sh
node run.mjs --jts-jar=/path/to/JTSTestBuilder.jar
```

`JTS_JAR` works in place of `--jts-jar`. Without either, the run leaves `jtsop` out and compares the
two CLIs alone, so no JDK or JTS checkout is needed to use this. `--runs=N` and `--warmup=N` set the
sample counts, `--input=<file>` points at a different GeoJSON.

## Results

The measured figures, what the columns say about each other, the agreement check across all 6769 buildings and the
caveats that go with them are on the documentation site: <https://sanak.github.io/interior-point/benchmark>. They
live there rather than here so there is one copy of the numbers to keep current.

## Data license

PLATEAU Hiroshima 2024 (MLIT) is licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The code in this directory is covered by the repository's own [MIT license](../../LICENSE).
