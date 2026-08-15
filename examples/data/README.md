# Benchmark datasets

The data both benchmarks measure, and the scripts that regenerate it.

| File                                           | Size   | Used by                                   |
| ---------------------------------------------- | ------ | ----------------------------------------- |
| `plateau-hiroshima-bldg.geojson`               | 5.0 MB | the browser benchmark's shipped dataset   |
| `plateau-hiroshima-bldg-no-attributes.geojson` | 2.6 MB | the CLI benchmark's input                 |
| `plateau-hiroshima-bldg.parquet`               | 743 KB | a sample to drop on the browser benchmark |

All three hold the same 6769 LOD0 building footprints from
[PLATEAU Hiroshima 2024](https://www.geospatial.jp/ckan/dataset/plateau-34100-hiroshima-shi-2024)
(MLIT), in EPSG:4326.

The CLI benchmark uses the attribute-free copy because `jtsop` discards properties on the way
through: handing all three commands the attributed file would charge the two that do preserve them
for work the third never does.

## Regenerating

Requires `curl`, `jq`, `unzip`, and a GDAL build with both the GML and Parquet drivers
(e.g. `brew install gdal`, or conda-forge's `libgdal-arrow-parquet`).

```bash
./download-and-extract-citygml.sh   # writes citygml/ (untracked)
./convert-citygml.sh                # writes all three files above
```

Both GeoJSON files are written from the GeoParquet rather than from the intermediate GeoPackage, so
regenerating them alone needs no CityGML download — only the committed `.parquet`.

`bldg_lod0_roof_edge.gfs` is the GML feature schema `ogr2ogr` reads the CityGML through; it is what
picks `lod0RoofEdge` out as the geometry.

## Data license

PLATEAU Hiroshima 2024 (MLIT) is licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The scripts in this directory are covered
by the repository's own [MIT license](../../LICENSE).
