//! Ports of JTS test classes that cannot live in `rs/core/tests/`.
//!
//! @jts-deviate test placement — an integration test links against the crate
//!   from outside, so it sees only what `lib.rs` re-exports publicly. These
//!   tests need crate-internal items: the point-in-polygon stack and `Centroid`
//!   are `pub(crate)`, and no integration test can name them. `rs/core/tests/`
//!   holds only the tests that reach the crate through its public API.

mod algorithm;
