//! Ports of `org.locationtech.jts.algorithm`.
//!
//! Inner modules are `pub(crate)` because neither of the two trees that reach
//! them — `crate::verify_interior_point` and the `#[cfg(test)]` tree under
//! `crate::test` — is a descendant of this module.

pub(crate) mod centroid;
pub(crate) mod cg_algorithms_dd;
pub(crate) mod interior_point;
pub(crate) mod interior_point_area;
pub(crate) mod interior_point_line;
pub(crate) mod interior_point_point;
pub(crate) mod orientation;

// The point-in-polygon stack. Ported so that both languages evaluate containment
// with the same JTS-derived code, and read by `verify_interior_point`, which is
// what makes it reachable in every build. It stays out of the published API:
// `pub(crate)` means nothing outside the crate can name it, so the published
// surface is still only `interior_point`, `verify_interior_point` and
// `InteriorPointVerification`.
pub(crate) mod locate;
pub(crate) mod point_location;
pub(crate) mod ray_crossing_counter;
