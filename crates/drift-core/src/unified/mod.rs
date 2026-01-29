//! Unified Analyzer Module
//!
//! Combines pattern detection and call resolution into a single optimized pass.
//! 
//! ## Architecture: AST-First with Regex Fallback
//! 
//! This module follows Drift's core principle: AST-first detection with regex
//! only as a fallback for string literal content.
//!
//! ### Detection Flow:
//! 1. Parse source with tree-sitter (all 9 languages)
//! 2. Run AST queries for semantic patterns (decorators, signatures, imports)
//! 3. Extract string literals from AST
//! 4. Run regex ONLY on extracted strings (SQL, routes, config values)
//!
//! ### Key Innovations:
//! - Pre-compiled tree-sitter queries per language per category
//! - Memory-mapped resolution index (no intermediate files)
//! - Parallel file processing with work stealing
//! - String interning for memory efficiency
//! - Streaming pattern output

mod types;
mod interner;
mod index;
mod analyzer;
mod ast_patterns;
mod string_analyzer;

pub use types::*;
pub use interner::StringInterner;
pub use index::ResolutionIndex;
pub use analyzer::UnifiedAnalyzer;
pub use ast_patterns::AstPatternDetector;
pub use string_analyzer::StringLiteralAnalyzer;
