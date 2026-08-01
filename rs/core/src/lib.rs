//! JTS InteriorPoint algorithm ported to Rust.
//!
//! Computes an interior point (representative point) of a geometry.
//! The point is guaranteed to lie inside the geometry for area geometries.

mod algorithm;
mod geom;
mod geometry_adapter;
mod math;

#[cfg(feature = "cli")]
pub mod cli;

#[cfg(test)]
mod test;

pub use algorithm::interior_point::interior_point;
