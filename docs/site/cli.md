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
flag is what turns the binary on.

## Usage

```
Usage: interior-point [options]
  -i, --input <geom|file>   WKT literal, GeoJSON literal, or a path.
                            Defaults to stdin.
  -f, --format <fmt>        Output format: geojson (default) or wkt.
  -o, --output <file>       Write to a file instead of stdout.
  -q, --quiet               Suppress the result; exit code only.
  -h, --help                Print this help.
```

```sh
interior-point -i "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))"
interior-point --input countries.geojson --output centres.geojson
interior-point --input countries.geojson --format wkt --output centres.txt
echo '{"type":"Polygon","coordinates":[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}' | interior-point
```

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
`properties`, `id` and a Feature's foreign members are preserved.

The two implementations agree byte for byte except that the Rust CLI prints an integral
coordinate as `5.0` where the TypeScript CLI prints `5`, and orders a Feature's JSON members
differently. Both forms are valid GeoJSON.

## Exit codes

| Code | Meaning                                                     |
| ---- | ----------------------------------------------------------- |
| 0    | success, including an empty result                          |
| 1    | a usage error, unreadable input, or an unparseable geometry |

Messages go to stderr; only the result goes to stdout.
