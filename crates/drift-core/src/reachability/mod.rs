//! Reachability Analysis Module
//!
//! Answers: "What data can this line of code ultimately access?"
//! Uses BFS traversal through the call graph with memory-efficient path tracking.
//!
//! Two implementations:
//! - `ReachabilityEngine` - In-memory HashMap-based (legacy, for small codebases)
//! - `SqliteReachabilityEngine` - SQLite-backed (recommended for large codebases)

mod types;
mod engine;
mod sqlite_engine;

pub use types::*;
pub use engine::ReachabilityEngine;
pub use sqlite_engine::SqliteReachabilityEngine;
