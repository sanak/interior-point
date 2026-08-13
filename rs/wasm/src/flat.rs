//! Decodes the flat geometry encoding that `js/flatten.js` produces.
//!
//! The two halves are deliberately split: this module never touches `js_sys`, so it compiles and
//! runs on the host and its tests need no wasm build. `lib.rs` keeps only the typed-array copy.

use geo_types::{
    Coord, Geometry, GeometryCollection, LineString, MultiLineString, MultiPoint, MultiPolygon,
    Point, Polygon,
};

/// Why a `(coords, structure)` pair could not be read as a geometry.
#[derive(Debug, PartialEq, Eq)]
pub enum DecodeError {
    /// A type tag outside the WKB range this encoding covers.
    UnknownTag(u32),
    /// The structure array ended while a count or tag was still expected.
    TruncatedStructure,
    /// The coordinate array ended while a vertex was still expected.
    TruncatedCoords,
    /// The geometry was read but one of the arrays still had values left.
    TrailingData,
}

impl core::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            DecodeError::UnknownTag(tag) => write!(f, "unknown geometry tag {tag}"),
            DecodeError::TruncatedStructure => write!(f, "structure array ended early"),
            DecodeError::TruncatedCoords => write!(f, "coordinate array ended early"),
            DecodeError::TrailingData => write!(f, "trailing data after the geometry"),
        }
    }
}

pub fn decode(coords: &[f64], structure: &[u32]) -> Result<Geometry<f64>, DecodeError> {
    let mut reader = Reader {
        coords,
        structure,
        ci: 0,
        si: 0,
    };
    let geometry = reader.geometry()?;
    if reader.si != structure.len() || reader.ci != coords.len() {
        return Err(DecodeError::TrailingData);
    }
    Ok(geometry)
}

struct Reader<'a> {
    coords: &'a [f64],
    structure: &'a [u32],
    ci: usize,
    si: usize,
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

    fn geometry(&mut self) -> Result<Geometry<f64>, DecodeError> {
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

    #[test]
    fn decodes_a_point() {
        assert_eq!(
            decode(&[1.0, 2.0], &[1]).unwrap(),
            Geometry::Point(Point::new(1.0, 2.0))
        );
    }

    #[test]
    fn decodes_a_line_string() {
        let decoded = decode(&[0.0, 0.0, 3.0, 4.0], &[2, 2]).unwrap();
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
        let Geometry::Polygon(polygon) = decode(&coords, &[3, 2, 5, 4]).unwrap() else {
            panic!("expected a Polygon");
        };
        assert_eq!(polygon.exterior().0.len(), 5);
        assert_eq!(polygon.interiors().len(), 1);
        assert_eq!(polygon.interiors()[0].0.len(), 4);
        assert_eq!(polygon.interiors()[0].0[0], Coord { x: 1.0, y: 1.0 });
    }

    #[test]
    fn decodes_a_multi_point() {
        let decoded = decode(&[0.0, 0.0, 10.0, 0.0], &[4, 2]).unwrap();
        assert_eq!(
            decoded,
            Geometry::MultiPoint(MultiPoint::from(vec![(0.0, 0.0), (10.0, 0.0)]))
        );
    }

    #[test]
    fn decodes_a_multi_line_string() {
        let coords = [0.0, 0.0, 1.0, 1.0, 2.0, 2.0, 3.0, 3.0, 4.0, 4.0];
        let Geometry::MultiLineString(lines) = decode(&coords, &[5, 2, 2, 3]).unwrap() else {
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
        let Geometry::MultiPolygon(polygons) = decode(&coords, &[6, 2, 1, 4, 2, 4, 4]).unwrap()
        else {
            panic!("expected a MultiPolygon");
        };
        assert_eq!(polygons.0.len(), 2);
        assert_eq!(polygons.0[0].interiors().len(), 0);
        assert_eq!(polygons.0[1].interiors().len(), 1);
    }

    #[test]
    fn decodes_a_geometry_collection_in_order() {
        let Geometry::GeometryCollection(children) =
            decode(&[1.0, 2.0, 0.0, 0.0, 3.0, 4.0], &[7, 2, 1, 2, 2]).unwrap()
        else {
            panic!("expected a GeometryCollection");
        };
        assert_eq!(children.0.len(), 2);
        assert_eq!(children.0[0], Geometry::Point(Point::new(1.0, 2.0)));
    }

    #[test]
    fn decodes_an_empty_geometry_from_a_zero_count() {
        let Geometry::Polygon(polygon) = decode(&[], &[3, 0]).unwrap() else {
            panic!("expected a Polygon");
        };
        assert!(polygon.exterior().0.is_empty());
        assert_eq!(
            decode(&[], &[4, 0]).unwrap(),
            Geometry::MultiPoint(MultiPoint(Vec::new()))
        );
    }

    #[test]
    fn rejects_an_unknown_tag() {
        assert_eq!(decode(&[], &[9]), Err(DecodeError::UnknownTag(9)));
    }

    #[test]
    fn rejects_a_truncated_structure() {
        assert_eq!(
            decode(&[0.0, 0.0], &[2]),
            Err(DecodeError::TruncatedStructure)
        );
    }

    #[test]
    fn rejects_truncated_coordinates() {
        assert_eq!(
            decode(&[0.0, 0.0], &[2, 2]),
            Err(DecodeError::TruncatedCoords)
        );
    }

    #[test]
    fn rejects_trailing_data() {
        assert_eq!(
            decode(&[1.0, 2.0, 9.0, 9.0], &[1]),
            Err(DecodeError::TrailingData)
        );
        assert_eq!(decode(&[1.0, 2.0], &[1, 7]), Err(DecodeError::TrailingData));
    }
}
