//! Wrapper detection module
//!
//! Detects custom abstractions over framework primitives by analyzing
//! the call graph and function patterns.

mod types;
mod detector;
mod clusterer;
mod analyzer;

pub use types::*;
pub use detector::WrapperDetector;
pub use clusterer::WrapperClusterer;
pub use analyzer::WrappersAnalyzer;
