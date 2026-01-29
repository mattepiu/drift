//! Scanner module - Parallel file walking with enterprise-grade ignore patterns
//!
//! This module provides high-performance file system scanning using:
//! - `ignore` crate for gitignore-style pattern matching
//! - `rayon` for parallel directory traversal
//! - `xxhash` for fast file hashing

mod ignores;
mod types;
mod walker;

pub use ignores::{IgnorePatterns, DEFAULT_IGNORES};
pub use types::{FileInfo, ScanConfig, ScanResult, ScanStats};
pub use walker::Scanner;
