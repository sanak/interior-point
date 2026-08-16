---
layout: doc
---

# CLI

Both packages ship an `interior-point` command that computes an interior point of each input
geometry. It reads WKT or GeoJSON — as a literal, a file, or on stdin — and writes GeoJSON by
default or one WKT geometry per line.

## Installation

### TypeScript

```bash
npm install -g interior-point
```

### Rust

```sh
cargo install interior-point --features cli
```

The Rust CLI sits behind a `cli` feature that is deliberately not in `default`, so adding the
crate as a library dependency pulls none of the command-line dependencies. The `--features cli`
flag is what turns the binary on: `cargo install interior-point` on its own installs nothing.

## Usage

| Short | Long               | Argument       | Meaning                                                    |
| ----- | ------------------ | -------------- | ---------------------------------------------------------- |
| `-i`  | `--input`          | `<geom\|file>` | WKT literal, GeoJSON literal, or a path. Defaults to stdin |
| `-f`  | `--format`         | `<fmt>`        | Output format: geojson (default) or wkt                    |
| `-o`  | `--output`         | `<file>`       | Write to a file instead of stdout                          |
| `-v`  | `--verify`         | —              | Check each result against its input geometry               |
| `-c`  | `--centroid-first` | —              | Return the centroid when it lies strictly inside           |
| `-t`  | `--time`           | —              | Report elapsed time per phase on stderr                    |
| `-q`  | `--quiet`          | —              | Suppress the result; exit code only                        |
| `-h`  | `--help`           | —              | Print this help                                            |

The exact `--help` layout differs between the two CLIs: each language renders it with its own
standard argument parser rather than a shared template.

```sh
interior-point -i "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))"
interior-point --input countries.geojson --output centres.geojson
interior-point --input countries.geojson --format wkt --output centres.txt
echo '{"type":"Polygon","coordinates":[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}' | interior-point
```

`--verify` checks each result against the geometry it was computed from, using a point-in-polygon
locator that shares no code with the algorithm that produced the point. It is a check on this
command's own output: it says nothing about whether the input is simple, whether its rings are
nested correctly, or whether a shell self-intersects, and a geometry that fails every one of those
can still yield a point that verifies.

stdout is byte-for-byte identical to the same run without the flag, because verification is a
message and messages go to stderr. Each record gets one of four outcomes:

| Outcome        | Meaning                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `interior`     | an area geometry, and the point lies inside it                                                 |
| `on-geometry`  | the point lies on the boundary of an area geometry, or is a vertex of a line or point geometry |
| `off-geometry` | the point lies outside an area geometry, or matches no vertex of a line or point geometry      |
| `unverifiable` | there was no point to check, or no geometry to check it against                                |

`interior` and `on-geometry` both count as verified, and `off-geometry` is the only failure.
`unverifiable` is neither: an empty result already exits 0 without the flag, and the flag does not
change that.

stderr carries one summary line, naming only the outcomes that occurred and in the order above,
followed by one line for each record that came back `off-geometry`. Record numbers are 1-based and
follow input order:

```
verify: 244 records, 244 interior
verify: 3 records, 1 interior, 1 on-geometry, 1 off-geometry
verify: record 2: off-geometry
```

The count noun is always `records`, so a single-record run reads `verify: 1 records` and an empty
one reads `verify: 0 records`. Both CLIs emit these lines byte for byte alike.

`--quiet` suppresses the summary line and keeps the failure lines, so a verifying run under both
flags is silent while a failing one still names the offending record:

| Flags                                   | stdout    | stderr                                      | Exit |
| --------------------------------------- | --------- | ------------------------------------------- | ---- |
| `--verify`, every record passes         | unchanged | the summary line                            | 0    |
| `--verify`, some record fails           | unchanged | the summary line, then one line per failure | 2    |
| `--verify --quiet`, every record passes | nothing   | nothing                                     | 0    |
| `--verify --quiet`, some record fails   | nothing   | one line per failure                        | 2    |

`--centroid-first` changes which point is computed. For an area geometry the command computes the
geometry's centroid and returns it when it lies strictly inside; when it does not, the interior-point
algorithm runs and the output is exactly what the command produces without the flag. A representative
point is more useful when it is the centroid, because the fallback returns a point that depends on how
the algorithm is implemented. Line and point inputs ignore the flag: at those dimensions the algorithm
already returns the vertex nearest the centroid.

Strictly inside means the interior and nothing else — a centroid that lands exactly on the boundary is
rejected. The T below has its centroid at `(3, 3)`, inside, so that is what comes back; the L's centroid
`(2, 3)` sits exactly on the edge from `(2, 2)` to `(2, 8)`, so the two runs agree:

```sh
interior-point -c -f wkt -i "POLYGON ((0 0, 6 0, 6 2, 4 2, 4 8, 2 8, 2 2, 0 2, 0 0))"
# POINT (3 3), where the same run without -c gives POINT (3 5)
interior-point -c -f wkt -i "POLYGON ((0 0, 6 0, 6 2, 2 2, 2 8, 0 8, 0 0))"
# POINT (1 5), the same as without -c
```

The output shape is unchanged — one point per record, in the same envelope and the same format — so the
flag composes with `--format`, `--output`, `--quiet` and `--verify`. `--verify` checks whichever point
was produced, and neither flag changes the other's exit code.

## Timing

`--time` reports where a run spent itself, as one line on stderr. stdout is byte for byte what the
same run produces without the flag, and the exit code is unchanged.

```sh
interior-point --input buildings.geojson --output centres.geojson --time
# time: 6769 records, read 24.3 ms, compute 11.0 ms, write 5.1 ms, total 40.3 ms
```

| Phase     | Covers                                                               |
| --------- | -------------------------------------------------------------------- |
| `read`    | reading the input, detecting its format, and parsing it into records |
| `compute` | computing one point per record                                       |
| `verify`  | checking those points — present only under `--verify`                |
| `write`   | serialising the result and writing it — absent under `--quiet`       |
| `total`   | the sum of the phases above                                          |

Only the phases that happened are named, so the line under `--quiet` is shorter than the line
without it. `--time` survives `--quiet`, unlike `--verify`'s summary: a run asked to report its
timing and to produce no output is the ordinary way to measure parsing and computation on their
own.

**`total` is not how long the command took.** It is the sum of the phases, and those begin after
the language runtime has started and end before the process exits, so process startup is outside
what either CLI can see. On the same 6769-record file the Node command's startup is around 40 ms
and the Rust command's around 4 ms, neither of which appears above. For the figure a user actually
waits for, time the whole process from the shell.

The two CLIs report the same phases in the same order with the same units, but the durations are
measurements and will not agree — this is the one part of the surface where byte-for-byte
agreement is not a goal. They are not comparable between languages except as an ordering of costs
within one run.

The prior art is jtsop's `-time`, which reports a single figure covering the operation alone; that
figure corresponds to `compute` here. Splitting the rest out is this CLI's own addition, and it
earns its place: on real input `read` has consistently been the largest of the phases and
`compute` the smallest.

## Input

The input format is detected automatically; `--format` governs the output only. A leading `{`
marks a GeoJSON literal, an existing path marks a file, and anything else is a WKT literal. A
file's contents are classified by the same rule.

GeoJSON input is accepted as a Geometry, a Feature, or a FeatureCollection. A WKT input holds one
geometry.

## Output

GeoJSON output preserves the envelope the input arrived in. WKT output ignores the envelope and
emits one line per record.

| Input                            | `--format geojson` (default)                                 | `--format wkt`                  |
| -------------------------------- | ------------------------------------------------------------ | ------------------------------- |
| WKT literal, or GeoJSON Geometry | a Point, or `null`                                           | `POINT (x y)`, or `POINT EMPTY` |
| GeoJSON Feature                  | a Feature, `properties` and `id` intact, `geometry` replaced | one line                        |
| GeoJSON FeatureCollection        | a FeatureCollection, order and each `properties`/`id` intact | N lines, input order            |

An empty result is not an error. A record whose interior point is empty becomes
`"geometry": null` inside its Feature, so the output keeps one entry per input entry and the
positions still line up; in WKT mode that record's line is `POINT EMPTY`. The exit code is 0
either way.

`bbox` is dropped at both Feature and FeatureCollection level: it described the input geometry,
and carrying it past a substitution would wrap a single point in a continent-sized box.
`properties`, `id` and a Feature's foreign members are preserved, in the order the input carried
them, with `type` leading and the replaced `geometry` trailing. A Feature that arrived without a
`properties` member goes out without one, and `"properties":null` and `"properties":{}` each go
out as they came.

The two implementations agree byte for byte on result output, with these divergences:

- `--help` output and error messages differ, because each language uses its own standard
  argument parser.
- Z coordinates: `{"type":"Point","coordinates":[1,2,3]}` gives `[1,2,3]` / `POINT Z (1 2 3)` in
  TypeScript and `[1,2]` / `POINT (1 2)` in Rust, because `geo_types::Coord` is
  two-dimensional.
- At extreme magnitudes the WKT number format differs: Rust never uses exponent notation, so
  `POINT (1e30 2e-8)` comes back as `POINT (1000000000000000000000000000000 0.00000002)` where
  TypeScript gives `POINT (1e+30 2e-8)`. Rust's form matches JTS's own `WKTWriter`. No real
  geographic coordinate reaches this range.

## Exit codes

| Code | Meaning                                                         |
| ---- | --------------------------------------------------------------- |
| 0    | success, including an empty result and an `unverifiable` record |
| 1    | a usage error, unreadable input, or an unparseable geometry     |
| 2    | `--verify` was given and at least one record is `off-geometry`  |

Code 1 wins over code 2: a run that cannot parse its input never reaches verification.

Messages go to stderr; only the result goes to stdout.
