#!/usr/bin/env bash
# Converts the extracted CityGML building meshes into a single GeoParquet file.
# Requires a GDAL build with both the GML and the Parquet drivers.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$HERE/citygml"
GPKG="$WORK/buildings.gpkg"
OUT="$HERE/../public/data/plateau-hiroshima-bldg.parquet"

if ! ogrinfo --formats | grep -qi parquet; then
  echo "This GDAL has no Parquet driver. Install gdal with arrow/parquet support" >&2
  echo "(e.g. 'brew install gdal' or conda-forge's libgdal-arrow-parquet) and retry." >&2
  exit 1
fi

shopt -s nullglob
gmls=("$WORK"/bldg/*.gml)
if [ ${#gmls[@]} -eq 0 ]; then
  echo "No GML found under $WORK/bldg. Run download-and-extract-citygml.sh first." >&2
  exit 1
fi

rm -f "$GPKG" "$OUT"
mkdir -p "$(dirname "$OUT")"

for gml in "${gmls[@]}"; do
  echo "Converting $(basename "$gml")"
  ogr2ogr -f GPKG "$GPKG" "$gml" \
    --config GML_GFS_TEMPLATE "$HERE/bldg_lod0_roof_edge.gfs" \
    -nln buildings -update -append \
    -dim 2 -s_srs EPSG:6697 -t_srs EPSG:4326
done

ogr2ogr -f Parquet "$OUT" "$GPKG" buildings \
  -lco COMPRESSION=ZSTD \
  -lco GEOMETRY_ENCODING=WKB

# The Parquet driver names its single layer after the output file, not -nln,
# so pass no layer name here — ogrinfo picks the (only) layer automatically.
ogrinfo -so "$OUT"
ls -lh "$OUT"
