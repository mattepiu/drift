//! drift-core: High-performance code analysis engine
//!
//! This crate provides the performance-critical components for Drift:
//! - Scanner: Parallel file walking with enterprise-grade ignore patterns
//! - Parsers: Native tree-sitter parsing for 9 languages
//! - Call Graph: Function extraction and call resolution
//! - Boundaries: Data access detection
//! - Coupling: Module dependency analysis
//! - Test Topology: Test-to-code mapping
//! - Error Handling: Error boundary and gap detection
//! - Reachability: Data flow analysis
//! - Unified: Combined pattern detection and resolution
//! - Constants: Hardcoded values, magic numbers, secrets detection
//! - Environment: Environment variable analysis
//! - Wrappers: Framework wrapper detection

pub mod scanner;
pub mod parsers;
pub mod call_graph;
pub mod boundaries;
pub mod coupling;
pub mod test_topology;
pub mod error_handling;
pub mod reachability;
pub mod unified;
pub mod constants;
pub mod environment;
pub mod wrappers;

// Re-exports for convenience
pub use scanner::{Scanner, ScanResult, ScanConfig, FileInfo};
pub use parsers::{
    ParserManager, Language, ParseResult, FunctionInfo, ClassInfo,
    ImportInfo, ExportInfo, CallSite,
};
pub use call_graph::{
    StreamingBuilder, BuilderConfig, BuildResult,
    CallGraphShard, FunctionEntry, CallEntry, DataAccessRef,
};
pub use boundaries::{
    BoundaryScanner, BoundaryScanResult, DataAccessPoint, DataOperation,
    SensitiveField, SensitivityType, ORMModel,
};
pub use coupling::{
    CouplingAnalyzer, CouplingAnalysisResult, ModuleMetrics,
    DependencyCycle, CycleSeverity, CouplingHotspot, UnusedExport,
};
pub use test_topology::{
    TestTopologyAnalyzer, TestTopologyResult, TestFile, TestCase,
    TestFramework, TestType, MockUsage, MockType, TestCoverage, RiskLevel,
};
pub use error_handling::{
    ErrorHandlingAnalyzer, ErrorHandlingResult, ErrorBoundary, BoundaryType,
    ErrorGap, GapType, GapSeverity, ErrorType,
};
pub use reachability::{
    ReachabilityEngine, ReachabilityResult, ReachabilityOptions,
    InverseReachabilityOptions, InverseReachabilityResult,
    CodeLocation, CallPathNode, ReachableDataAccess, SensitiveFieldAccess,
    InverseAccessPath, InverseTarget, FunctionNode, CallSite as ReachCallSite,
    CallGraph as ReachCallGraph, DataAccessPoint as ReachDataAccessPoint,
    DataOperation as ReachDataOperation, SensitivityType as ReachSensitivityType,
    SensitiveField as ReachSensitiveField,
};
pub use unified::{
    UnifiedAnalyzer, UnifiedOptions, UnifiedResult, FilePatterns,
    DetectedPattern, DetectionMethod, PatternCategory, Language as UnifiedLanguage,
    Violation, ViolationSeverity, ResolutionStats, CallGraphSummary, AnalysisMetrics,
};
pub use constants::{
    ConstantsAnalyzer, ConstantsResult, ConstantInfo, ConstantCategory,
    SecretCandidate, SecretSeverity, MagicNumber, InconsistentValue, ConstantsStats,
};
pub use environment::{
    EnvironmentAnalyzer, EnvironmentResult, EnvAccess, EnvVariable,
    EnvAccessLocation, EnvSensitivity, EnvironmentStats,
};
pub use wrappers::{
    WrappersAnalyzer, WrappersResult, WrapperInfo, WrapperCluster,
    WrapperCategory, WrappersStats,
};
