//! Constants analysis module
//!
//! Provides extraction and analysis of constants, detection of potential secrets,
//! magic numbers, and value inconsistencies across a codebase.

mod types;
mod extractor;
mod secrets;
mod analyzer;

pub use types::*;
pub use extractor::ConstantExtractor;
pub use secrets::SecretDetector;
pub use analyzer::ConstantsAnalyzer;
