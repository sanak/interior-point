#!/usr/bin/env bash
# Converts the extracted CityGML building meshes into the three datasets the examples use: a
# GeoParquet file, a GeoJSON file carrying every attribute, and a geometry-only GeoJSON file.
# Requires a GDAL build with both the GML and the Parquet drivers.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$HERE/citygml"
GPKG="$WORK/buildings.gpkg"
PARQUET="$HERE/plateau-hiroshima-bldg.parquet"
GEOJSON="$HERE/plateau-hiroshima-bldg.geojson"
GEOJSON_NO_ATTRS="$HERE/plateau-hiroshima-bldg-no-attributes.geojson"

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

rm -f "$GPKG" "$PARQUET" "$GEOJSON" "$GEOJSON_NO_ATTRS"

for gml in "${gmls[@]}"; do
  echo "Converting $(basename "$gml")"
  # -lco GEOMETRY_NAME=geometry: the .gfs template names the geometry field
  # lod0RoofEdge, but src/data/parquet.ts expects "geometry".
  # -nlt MULTIPOLYGON: LOD0 roof edges come out of GML as MultiSurface, a
  # curve-capable WKB type hyparquet's decoder does not support; forcing the
  # linear-only MultiPolygon type here keeps the output plain WKB.
  ogr2ogr -f GPKG "$GPKG" "$gml" \
    --config GML_GFS_TEMPLATE "$HERE/bldg_lod0_roof_edge.gfs" \
    -nln buildings -update -append \
    -lco GEOMETRY_NAME=geometry -nlt MULTIPOLYGON \
    -dim 2 -s_srs EPSG:6697 -t_srs EPSG:4326
done

echo "Writing $(basename "$PARQUET")"
ogr2ogr -f Parquet "$PARQUET" "$GPKG" buildings \
  -lco COMPRESSION=ZSTD \
  -lco GEOMETRY_ENCODING=WKB

# Both GeoJSON files are written from the Parquet rather than the GPKG, so the committed files stay
# byte-for-byte reproducible from the committed Parquet alone — regenerating them needs no CityGML
# download.
#
# --config OGR2OGR_USE_ARROW_API NO: the Arrow fast path cannot map the file's fid column onto an
#   OGR field and aborts the translation. The row-by-row path has no such trouble.
# -lco COORDINATE_PRECISION=15: full double precision in, so no command is handed a shorter number
#   than another.
echo "Writing $(basename "$GEOJSON")"
ogr2ogr -f GeoJSON "$GEOJSON" "$PARQUET" \
  --config OGR2OGR_USE_ARROW_API NO \
  -lco COORDINATE_PRECISION=15 \
  -lco RFC7946=NO

# -select "": drops every attribute. jtsop discards properties on the way through, so keeping them
#   would charge the two CLIs that do preserve them for work the third never does.
echo "Writing $(basename "$GEOJSON_NO_ATTRS")"
ogr2ogr -f GeoJSON "$GEOJSON_NO_ATTRS" "$PARQUET" \
  --config OGR2OGR_USE_ARROW_API NO \
  -select "" \
  -lco COORDINATE_PRECISION=15 \
  -lco RFC7946=NO

# The Parquet driver names its single layer after the output file, not -nln,
# so pass no layer name here — ogrinfo picks the (only) layer automatically.
ogrinfo -so "$PARQUET"
ls -lh "$PARQUET" "$GEOJSON" "$GEOJSON_NO_ATTRS"
