//! Coupling analysis module
//!
//! Analyzes module dependencies, detects cycles, and calculates
//! Robert C. Martin coupling metrics (Ca, Ce, Instability, Abstractness).

mod types;
mod analyzer;

pub use types::*;
pub use analyzer::CouplingAnalyzer;
