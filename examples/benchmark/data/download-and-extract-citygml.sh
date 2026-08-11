#!/usr/bin/env bash
# Downloads the PLATEAU Hiroshima 2024 CityGML archive and extracts the four
# building meshes this benchmark ships with. Requires curl, jq and unzip.
set -euo pipefail

DATASET="plateau-34100-hiroshima-shi-2024"
MESHES=(51324366 51324367 51324376 51324377)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$HERE/citygml"
mkdir -p "$WORK/bldg"

# The dataset carries several resources; the CityGML archive is the .zip whose
# URL says citygml.
url="$(curl -fsSL "https://www.geospatial.jp/ckan/api/3/action/package_show?id=$DATASET" |
  jq -r '.result.resources[].url | select(test("citygml.*\\.zip$"; "i"))' |
  head -n 1)"

if [ -z "$url" ]; then
  echo "No CityGML zip resource found on $DATASET" >&2
  exit 1
fi

echo "Downloading $url"
curl -fL --retry 3 -o "$WORK/citygml.zip" "$url"

for mesh in "${MESHES[@]}"; do
  echo "Extracting mesh $mesh"
  unzip -o -j "$WORK/citygml.zip" "udx/bldg/${mesh}_bldg_*.gml" -d "$WORK/bldg"
done

ls -l "$WORK/bldg"
