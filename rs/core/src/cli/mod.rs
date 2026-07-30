//! Command-line interface for the interior-point crate. Gated behind the `cli`
//! feature so a library consumer pulls none of its dependencies.
//!
//! @jts-adapter JTSOpCmd — jtsop (org.locationtech.jtstest.cmd.JTSOpCmd) is the
//!   prior art for this CLI's surface; the code is original, nothing is ported.

pub mod args;
