//! Environment variable analysis module
//!
//! Provides extraction and analysis of environment variable access patterns,
//! sensitivity classification, and required variable detection.

mod types;
mod extractor;
mod analyzer;

pub use types::*;
pub use extractor::EnvExtractor;
pub use analyzer::EnvironmentAnalyzer;
