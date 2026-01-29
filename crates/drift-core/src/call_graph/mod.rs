//! Call Graph Module
//!
//! Streaming call graph builder with disk-backed storage.
//! Handles codebases of any size without OOM.
//!
//! Key components:
//! - `StreamingBuilder` - Builds call graph incrementally
//! - `UniversalExtractor` - Extracts functions/calls from any language
//! - `CallGraphDb` - SQLite storage for O(1) queries
//! - `ParallelWriter` - MPSC channel pattern for parallel builds
//! - Types for shards, entries, and indexes

mod types;
mod extractor;
mod universal_extractor;
mod builder;
mod storage;

pub use types::*;
pub use extractor::{CallGraphExtractor, ExtractionResult, ExtractedFunction, ExtractedCall, to_function_entries};
pub use universal_extractor::UniversalExtractor;
pub use builder::{StreamingBuilder, BuilderConfig};
pub use storage::{CallGraphDb, ParallelWriter, FunctionBatch, DbStats};
