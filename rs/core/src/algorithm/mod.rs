//! Ports of `org.locationtech.jts.algorithm`.
//!
//! Inner modules are `pub(crate)` because the `#[cfg(test)]` tree under
//! `crate::test` is not a descendant of this module and could not otherwise
//! reach them.

pub(crate) mod centroid;
pub(crate) mod cg_algorithms_dd;
pub(crate) mod interior_point;
pub(crate) mod interior_point_area;
pub(crate) mod interior_point_line;
pub(crate) mod interior_point_point;
pub(crate) mod orientation;

// The point-in-polygon stack. Ported so that both languages evaluate containment
// with the same JTS-derived code in their world tests, and deliberately not part
// of the published API (`interior_point` stays the only public item).
// `#[cfg(test)]` is what keeps that true without a file-level
// `#![allow(dead_code)]`, which `CLAUDE.md` bans.
#[cfg(test)]
pub(crate) mod locate;
#[cfg(test)]
pub(crate) mod point_location;
#[cfg(test)]
pub(crate) mod ray_crossing_counter;
