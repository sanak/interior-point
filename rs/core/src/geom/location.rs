//! Constants representing the different topological locations which can occur
//! in a geometry. JTS also uses them as DE-9IM row and column indices; the
//! ported subset needs only the three below.
//!
//! `NONE` and `toLocationSymbol` are not ported — nothing in the point-in-polygon
//! stack reaches either.
//!
//! @jts Location

/// The location value for the interior of a geometry.
///
/// @jts Location#INTERIOR
pub(crate) const INTERIOR: i32 = 0;

/// The location value for the boundary of a geometry.
///
/// @jts Location#BOUNDARY
pub(crate) const BOUNDARY: i32 = 1;

/// The location value for the exterior of a geometry.
///
/// @jts Location#EXTERIOR
pub(crate) const EXTERIOR: i32 = 2;
