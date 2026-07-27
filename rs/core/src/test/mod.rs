//! Ports of JTS test classes that cannot live in `rs/core/tests/`.
//!
//! @jts-deviate test placement — an integration test links against the library
//!   built without `cfg(test)`, so it cannot see the `#[cfg(test)]` locator
//!   modules or the crate-internal `Centroid` these tests need. `rs/core/tests/`
//!   holds only the tests that reach the crate through its public API.

mod algorithm;
