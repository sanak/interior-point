#!/usr/bin/env bash
# Converts the browser benchmark's GeoParquet dataset into the GeoJSON the CLI benchmark feeds to
# all three commands. Requires GDAL with the Parquet driver — the same one
# examples/benchmark/data/convert-citygml-to-geoparquet.sh needs.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/../../benchmark/public/data/plateau-hiroshima-bldg.parquet"
OUT="$HERE/plateau-hiroshima-bldg.geojson"

if ! ogrinfo --formats | grep -qi parquet; then
  echo "This GDAL has no Parquet driver. Install gdal with arrow/parquet support" >&2
  echo "(e.g. 'brew install gdal' or conda-forge's libgdal-arrow-parquet) and retry." >&2
  exit 1
fi

if [ ! -f "$SRC" ]; then
  echo "No dataset at $SRC." >&2
  exit 1
fi

rm -f "$OUT"

# --config OGR2OGR_USE_ARROW_API NO: the Arrow fast path cannot map the file's fid column onto an
#   OGR field and aborts the translation. The row-by-row path has no such trouble.
# -select "": drops every attribute. jtsop discards properties on the way through, so keeping them
#   would charge the two CLIs that do preserve them for work the third never does.
# -lco COORDINATE_PRECISION=15: full double precision in, so no command is handed a shorter number
#   than another.
ogr2ogr -f GeoJSON "$OUT" "$SRC" \
  --config OGR2OGR_USE_ARROW_API NO \
  -select "" \
  -lco COORDINATE_PRECISION=15 \
  -lco RFC7946=NO

ls -lh "$OUT"
