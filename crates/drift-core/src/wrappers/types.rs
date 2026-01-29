//! Types for wrapper detection
//!
//! Defines structures for detected wrappers, clusters, and analysis results.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Category of wrapper
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum WrapperCategory {
    /// State management (useState, useReducer wrappers)
    StateManagement,
    /// Data fetching (fetch, axios wrappers)
    DataFetching,
    /// Side effects (useEffect wrappers)
    SideEffects,
    /// Authentication (auth wrappers)
    Authentication,
    /// Authorization (permission wrappers)
    Authorization,
    /// Validation (zod, yup wrappers)
    Validation,
    /// Dependency injection
    DependencyInjection,
    /// Middleware patterns
    Middleware,
    /// Testing utilities
    Testing,
    /// Logging wrappers
    Logging,
    /// Caching wrappers
    Caching,
    /// Error handling wrappers
    ErrorHandling,
    /// Async utilities
    AsyncUtilities,
    /// Form handling
    FormHandling,
    /// Routing wrappers
    Routing,
    /// Factory patterns
    Factory,
    /// Decorator patterns
    Decorator,
    /// Generic utility
    Utility,
    /// Other/unknown
    Other,
}

impl Default for WrapperCategory {
    fn default() -> Self {
        Self::Other
    }
}

/// Information about a detected wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WrapperInfo {
    /// Wrapper function name
    pub name: String,
    /// File where defined
    pub file: String,
    /// Line number
    pub line: u32,
    /// The primitive(s) being wrapped
    pub wraps: Vec<String>,
    /// Category of wrapper
    pub category: WrapperCategory,
    /// Whether it's exported
    pub is_exported: bool,
    /// Number of times used
    pub usage_count: usize,
    /// Confidence score (0.0 - 1.0)
    pub confidence: f32,
}

/// A cluster of similar wrappers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WrapperCluster {
    /// Cluster ID
    pub id: String,
    /// Category of wrappers in this cluster
    pub category: WrapperCategory,
    /// The primitive being wrapped
    pub wrapped_primitive: String,
    /// Wrappers in this cluster
    pub wrappers: Vec<WrapperInfo>,
    /// Confidence score for the cluster
    pub confidence: f32,
    /// Total usage across all wrappers
    pub total_usage: usize,
}

/// Result of wrapper detection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WrappersResult {
    /// All detected wrappers
    pub wrappers: Vec<WrapperInfo>,
    /// Clustered wrappers
    pub clusters: Vec<WrapperCluster>,
    /// Statistics
    pub stats: WrappersStats,
}

/// Statistics about wrapper detection
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WrappersStats {
    /// Total wrappers found
    pub total_wrappers: usize,
    /// Number of clusters
    pub cluster_count: usize,
    /// Wrappers by category
    pub by_category: HashMap<String, usize>,
    /// Most wrapped primitives
    pub top_primitives: Vec<(String, usize)>,
    /// Files analyzed
    pub files_analyzed: usize,
    /// Duration in milliseconds
    pub duration_ms: u64,
}

/// Known framework primitives that are commonly wrapped
pub const REACT_PRIMITIVES: &[&str] = &[
    "useState", "useReducer", "useEffect", "useLayoutEffect",
    "useCallback", "useMemo", "useRef", "useContext",
    "useImperativeHandle", "useDebugValue", "useDeferredValue",
    "useTransition", "useId", "useSyncExternalStore",
];

pub const FETCH_PRIMITIVES: &[&str] = &[
    "fetch", "axios", "got", "request", "superagent",
    "ky", "node-fetch", "cross-fetch",
];

pub const VALIDATION_PRIMITIVES: &[&str] = &[
    "z.object", "z.string", "z.number", "z.array",
    "yup.object", "yup.string", "yup.number",
    "Joi.object", "Joi.string",
];

pub const LOGGING_PRIMITIVES: &[&str] = &[
    "console.log", "console.error", "console.warn", "console.info",
    "logger.info", "logger.error", "logger.warn", "logger.debug",
    "winston.info", "pino.info", "bunyan.info",
];

pub const AUTH_PRIMITIVES: &[&str] = &[
    "jwt.sign", "jwt.verify", "bcrypt.hash", "bcrypt.compare",
    "passport.authenticate", "auth0.getSession",
];
