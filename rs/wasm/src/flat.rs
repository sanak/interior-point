//! Decodes the flat geometry encoding that `js/flatten.js` produces: one `f64` buffer laid out as
//! `[structureLength, ...structure, ...coords]`.
//!
//! The two halves are deliberately split: this module never touches `js_sys`, so it compiles and
//! runs on the host and its tests need no wasm build. `lib.rs` keeps only the typed-array copy.

use geo_types::{
    Coord, Geometry, GeometryCollection, LineString, MultiLineString, MultiPoint, MultiPolygon,
    Point, Polygon,
};

/// Why a buffer could not be read as a geometry.
#[derive(Debug, PartialEq, Eq)]
pub enum DecodeError {
    /// A type tag outside the WKB range this encoding covers.
    UnknownTag(u32),
    /// The structure section ended while a count or tag was still expected, or the buffer is
    /// too short to hold the header and the structure that header declares.
    TruncatedStructure,
    /// The coordinate section ended while a vertex was still expected.
    TruncatedCoords,
    /// The geometry was read but one of the two sections still had values left.
    TrailingData,
    /// A `GeometryCollection` nested past `MAX_DEPTH`.
    NestingTooDeep,
}

impl core::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            DecodeError::UnknownTag(tag) => write!(f, "unknown geometry tag {tag}"),
            DecodeError::TruncatedStructure => write!(f, "structure array ended early"),
            DecodeError::TruncatedCoords => write!(f, "coordinate array ended early"),
            DecodeError::TrailingData => write!(f, "trailing data after the geometry"),
            DecodeError::NestingTooDeep => {
                write!(
                    f,
                    "geometry nesting exceeded the limit of {MAX_DEPTH} levels"
                )
            }
        }
    }
}

/// The deepest chain of nested `GeometryCollection`s `geometry()` will follow before returning
/// `NestingTooDeep` instead of recursing further.
///
/// Real GeoJSON nests one or two levels; `js/flatten.js` is itself recursive, so it cannot
/// produce anything deep either. 64 is generous by orders of magnitude while sitting far below
/// any stack limit on any target this crate compiles for — including wasm32's roughly 1MB
/// default stack, an order of magnitude smaller than a native release build's. The point is to
/// be nowhere near a measured crash threshold, not to sit just under one.
const MAX_DEPTH: usize = 64;

/// Reads `[structureLength, ...structure, ...coords]`. The counts arrive as `f64` because they
/// share the coordinates' buffer; each is an integer far below 2^53, where `f64` is exact.
pub fn decode(buffer: &[f64]) -> Result<Geometry<f64>, DecodeError> {
    let structure_length = *buffer.first().ok_or(DecodeError::TruncatedStructure)? as usize;
    let coords_start = structure_length
        .checked_add(1)
        .filter(|start| *start <= buffer.len())
        .ok_or(DecodeError::TruncatedStructure)?;
    let structure = &buffer[1..coords_start];
    let coords = &buffer[coords_start..];
    let mut reader = Reader {
        coords,
        structure,
        ci: 0,
        si: 0,
        depth: 0,
    };
    let geometry = reader.geometry()?;
    if reader.si != structure.len() || reader.ci != coords.len() {
        return Err(DecodeError::TrailingData);
    }
    Ok(geometry)
}

struct Reader<'a> {
    coords: &'a [f64],
    structure: &'a [f64],
    ci: usize,
    si: usize,
    /// Current `GeometryCollection` nesting depth. Incremented on entry to `geometry()` and
    /// decremented on exit, so it reflects the live call chain rather than a running total.
    depth: usize,
}

impl Reader<'_> {
    fn count(&mut self) -> Result<usize, DecodeError> {
        let value = *self
            .structure
            .get(self.si)
            .ok_or(DecodeError::TruncatedStructure)?;
        self.si += 1;
        Ok(value as usize)
    }

    fn coord(&mut self) -> Result<Coord<f64>, DecodeError> {
        if self.ci + 2 > self.coords.len() {
            return Err(DecodeError::TruncatedCoords);
        }
        let coord = Coord {
            x: self.coords[self.ci],
            y: self.coords[self.ci + 1],
        };
        self.ci += 2;
        Ok(coord)
    }

    fn run(&mut self, len: usize) -> Result<Vec<Coord<f64>>, DecodeError> {
        (0..len).map(|_| self.coord()).collect()
    }

    /// Reads `[ringCount, len0, len1, ...]` and the vertices those lengths cover. Polygon and
    /// MultiLineString share this body, which is why both tags land here.
    fn rings(&mut self) -> Result<Vec<LineString<f64>>, DecodeError> {
        let ring_count = self.count()?;
        let lengths = (0..ring_count)
            .map(|_| self.count())
            .collect::<Result<Vec<_>, _>>()?;
        lengths
            .into_iter()
            .map(|len| Ok(LineString(self.run(len)?)))
            .collect()
    }

    fn polygon(&mut self) -> Result<Polygon<f64>, DecodeError> {
        let mut rings = self.rings()?;
        if rings.is_empty() {
            return Ok(Polygon::new(LineString(Vec::new()), Vec::new()));
        }
        let exterior = rings.remove(0);
        Ok(Polygon::new(exterior, rings))
    }

    /// Depth-checked entry point: every recursive call goes through here rather than through
    /// `geometry_body` directly, so the bound applies uniformly instead of only at the top level.
    fn geometry(&mut self) -> Result<Geometry<f64>, DecodeError> {
        if self.depth >= MAX_DEPTH {
            return Err(DecodeError::NestingTooDeep);
        }
        self.depth += 1;
        let result = self.geometry_body();
        self.depth -= 1;
        result
    }

    fn geometry_body(&mut self) -> Result<Geometry<f64>, DecodeError> {
        Ok(match self.count()? as u32 {
            1 => Geometry::Point(Point::from(self.coord()?)),
            2 => {
                let len = self.count()?;
                Geometry::LineString(LineString(self.run(len)?))
            }
            3 => Geometry::Polygon(self.polygon()?),
            4 => {
                let len = self.count()?;
                Geometry::MultiPoint(MultiPoint(
                    self.run(len)?.into_iter().map(Point::from).collect(),
                ))
            }
            5 => Geometry::MultiLineString(MultiLineString(self.rings()?)),
            6 => {
                let count = self.count()?;
                let polygons = (0..count)
                    .map(|_| self.polygon())
                    .collect::<Result<Vec<_>, _>>()?;
                Geometry::MultiPolygon(MultiPolygon(polygons))
            }
            7 => {
                let count = self.count()?;
                let children = (0..count)
                    .map(|_| self.geometry())
                    .collect::<Result<Vec<_>, _>>()?;
                Geometry::GeometryCollection(GeometryCollection(children))
            }
            tag => return Err(DecodeError::UnknownTag(tag)),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Lays the two logical halves out the way `js/flatten.js` writes them, so every test below
    /// can go on naming a structure and a coordinate run. The header's position is pinned by
    /// `reads_the_structure_length_from_the_first_slot`, which spells a buffer out instead.
    fn packed(structure: &[f64], coords: &[f64]) -> Vec<f64> {
        let mut buffer = vec![structure.len() as f64];
        buffer.extend_from_slice(structure);
        buffer.extend_from_slice(coords);
        buffer
    }

    #[test]
    fn reads_the_structure_length_from_the_first_slot() {
        // [structureLength = 1, tag 1, x, y]
        assert_eq!(
            decode(&[1.0, 1.0, 1.0, 2.0]).unwrap(),
            Geometry::Point(Point::new(1.0, 2.0))
        );
    }

    #[test]
    fn rejects_a_buffer_with_no_header() {
        assert_eq!(decode(&[]), Err(DecodeError::TruncatedStructure));
    }

    #[test]
    fn rejects_a_structure_length_reaching_past_the_buffer() {
        assert_eq!(decode(&[4.0, 1.0]), Err(DecodeError::TruncatedStructure));
    }

    #[test]
    fn decodes_a_point() {
        assert_eq!(
            decode(&packed(&[1.0], &[1.0, 2.0])).unwrap(),
            Geometry::Point(Point::new(1.0, 2.0))
        );
    }

    #[test]
    fn decodes_a_line_string() {
        let decoded = decode(&packed(&[2.0, 2.0], &[0.0, 0.0, 3.0, 4.0])).unwrap();
        assert_eq!(
            decoded,
            Geometry::LineString(LineString::from(vec![(0.0, 0.0), (3.0, 4.0)]))
        );
    }

    #[test]
    fn decodes_a_polygon_with_a_hole() {
        let coords = [
            0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0, 0.0, 0.0, 1.0, 1.0, 2.0, 1.0, 2.0, 2.0, 1.0,
            1.0,
        ];
        let Geometry::Polygon(polygon) = decode(&packed(&[3.0, 2.0, 5.0, 4.0], &coords)).unwrap()
        else {
            panic!("expected a Polygon");
        };
        assert_eq!(polygon.exterior().0.len(), 5);
        assert_eq!(polygon.interiors().len(), 1);
        assert_eq!(polygon.interiors()[0].0.len(), 4);
        assert_eq!(polygon.interiors()[0].0[0], Coord { x: 1.0, y: 1.0 });
    }

    #[test]
    fn decodes_a_multi_point() {
        let decoded = decode(&packed(&[4.0, 2.0], &[0.0, 0.0, 10.0, 0.0])).unwrap();
        assert_eq!(
            decoded,
            Geometry::MultiPoint(MultiPoint::from(vec![(0.0, 0.0), (10.0, 0.0)]))
        );
    }

    #[test]
    fn decodes_a_multi_line_string() {
        let coords = [0.0, 0.0, 1.0, 1.0, 2.0, 2.0, 3.0, 3.0, 4.0, 4.0];
        let Geometry::MultiLineString(lines) =
            decode(&packed(&[5.0, 2.0, 2.0, 3.0], &coords)).unwrap()
        else {
            panic!("expected a MultiLineString");
        };
        assert_eq!(lines.0.len(), 2);
        assert_eq!(lines.0[0].0.len(), 2);
        assert_eq!(lines.0[1].0.len(), 3);
    }

    #[test]
    fn decodes_a_multi_polygon_with_a_per_polygon_ring_count() {
        let mut coords = vec![0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0];
        coords.extend([5.0, 5.0, 6.0, 5.0, 6.0, 6.0, 5.0, 5.0]);
        coords.extend([5.2, 5.2, 5.4, 5.2, 5.4, 5.4, 5.2, 5.2]);
        let Geometry::MultiPolygon(polygons) =
            decode(&packed(&[6.0, 2.0, 1.0, 4.0, 2.0, 4.0, 4.0], &coords)).unwrap()
        else {
            panic!("expected a MultiPolygon");
        };
        assert_eq!(polygons.0.len(), 2);
        assert_eq!(polygons.0[0].interiors().len(), 0);
        assert_eq!(polygons.0[1].interiors().len(), 1);
    }

    #[test]
    fn decodes_a_geometry_collection_in_order() {
        let Geometry::GeometryCollection(children) = decode(&packed(
            &[7.0, 2.0, 1.0, 2.0, 2.0],
            &[1.0, 2.0, 0.0, 0.0, 3.0, 4.0],
        ))
        .unwrap() else {
            panic!("expected a GeometryCollection");
        };
        assert_eq!(children.0.len(), 2);
        assert_eq!(children.0[0], Geometry::Point(Point::new(1.0, 2.0)));
    }

    #[test]
    fn decodes_an_empty_geometry_from_a_zero_count() {
        let Geometry::Polygon(polygon) = decode(&packed(&[3.0, 0.0], &[])).unwrap() else {
            panic!("expected a Polygon");
        };
        assert!(polygon.exterior().0.is_empty());
        assert_eq!(
            decode(&packed(&[4.0, 0.0], &[])).unwrap(),
            Geometry::MultiPoint(MultiPoint(Vec::new()))
        );
    }

    #[test]
    fn rejects_an_unknown_tag() {
        assert_eq!(
            decode(&packed(&[9.0], &[])),
            Err(DecodeError::UnknownTag(9))
        );
    }

    #[test]
    fn rejects_a_truncated_structure() {
        assert_eq!(
            decode(&packed(&[2.0], &[0.0, 0.0])),
            Err(DecodeError::TruncatedStructure)
        );
    }

    #[test]
    fn rejects_truncated_coordinates() {
        assert_eq!(
            decode(&packed(&[2.0, 2.0], &[0.0, 0.0])),
            Err(DecodeError::TruncatedCoords)
        );
    }

    #[test]
    fn rejects_trailing_data() {
        assert_eq!(
            decode(&packed(&[1.0], &[1.0, 2.0, 9.0, 9.0])),
            Err(DecodeError::TrailingData)
        );
        assert_eq!(
            decode(&packed(&[1.0, 7.0], &[1.0, 2.0])),
            Err(DecodeError::TrailingData)
        );
    }

    #[test]
    fn decodes_a_geometry_collection_nested_a_few_levels_deep() {
        // GeometryCollection(GeometryCollection(GeometryCollection(Point))) — well inside
        // MAX_DEPTH, proving the bound doesn't reject ordinary nesting.
        let point = Geometry::Point(Point::new(1.0, 2.0));
        let innermost = Geometry::GeometryCollection(GeometryCollection(vec![point]));
        let middle = Geometry::GeometryCollection(GeometryCollection(vec![innermost]));
        let outer = Geometry::GeometryCollection(GeometryCollection(vec![middle]));
        let decoded = decode(&packed(&[7.0, 1.0, 7.0, 1.0, 7.0, 1.0, 1.0], &[1.0, 2.0])).unwrap();
        assert_eq!(decoded, outer);
    }

    #[test]
    fn rejects_nesting_deeper_than_the_limit() {
        // MAX_DEPTH + 1 nested GeometryCollections, each holding exactly one child, built
        // programmatically rather than as a literal. The decoder must return NestingTooDeep
        // before it ever runs out of structure entries or coordinates to read.
        let mut structure = Vec::new();
        for _ in 0..=MAX_DEPTH {
            structure.push(7.0);
            structure.push(1.0);
        }
        assert_eq!(
            decode(&packed(&structure, &[])),
            Err(DecodeError::NestingTooDeep)
        );
    }
}
