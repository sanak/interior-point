// The README is the crate's documentation: including it here puts one text on
// docs.rs and in the repository, and turns every Rust block it carries into a
// doctest, so an example that stops compiling fails `cargo test`.
#![doc = include_str!("../README.md")]

mod algorithm;
mod centroid_first_interior_point;
mod geom;
mod geometry_adapter;
mod math;
mod verify_interior_point;

#[cfg(feature = "cli")]
pub mod cli;

#[cfg(test)]
mod test;

pub use algorithm::interior_point::interior_point;
pub use centroid_first_interior_point::centroid_first_interior_point;
pub use verify_interior_point::{InteriorPointVerification, verify_interior_point};
