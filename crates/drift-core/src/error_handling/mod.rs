//! Error handling analysis module
//!
//! AST-first approach: Uses tree-sitter parsed data to detect:
//! - Error boundaries (try/catch, error handlers)
//! - Error handling gaps (unhandled promises, missing catches)
//! - Custom error types

mod types;
mod analyzer;

pub use types::*;
pub use analyzer::ErrorHandlingAnalyzer;
