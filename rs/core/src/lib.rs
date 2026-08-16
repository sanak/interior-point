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

// The published names are listed in the order the documentation introduces
// them: the ported algorithm, then the two utilities built on top of it.
// rustfmt sorts a contiguous run of `use` statements alphabetically, so the
// blank line below is what keeps `centroid_first_interior_point` last.
pub use algorithm::interior_point::interior_point;
pub use verify_interior_point::{Verification, verify_interior_point};

pub use centroid_first_interior_point::centroid_first_interior_point;
