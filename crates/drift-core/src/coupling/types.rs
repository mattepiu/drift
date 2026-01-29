//! Coupling analysis types

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Module coupling metrics (Robert C. Martin metrics)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleMetrics {
    /// Module path
    pub path: String,
    /// Afferent coupling (incoming dependencies)
    pub ca: usize,
    /// Efferent coupling (outgoing dependencies)
    pub ce: usize,
    /// Instability: Ce / (Ca + Ce)
    pub instability: f32,
    /// Abstractness: abstract types / total types
    pub abstractness: f32,
    /// Distance from main sequence: |A + I - 1|
    pub distance: f32,
    /// Files in this module
    pub files: Vec<String>,
}

/// A dependency cycle
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyCycle {
    /// Modules in the cycle
    pub modules: Vec<String>,
    /// Severity based on cycle length
    pub severity: CycleSeverity,
    /// Total files affected
    pub files_affected: usize,
}

/// Cycle severity
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CycleSeverity {
    Info,
    Warning,
    Critical,
}

/// A coupling hotspot (highly coupled module)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CouplingHotspot {
    /// Module path
    pub module: String,
    /// Total coupling (Ca + Ce)
    pub total_coupling: usize,
    /// Incoming dependencies
    pub incoming: Vec<String>,
    /// Outgoing dependencies
    pub outgoing: Vec<String>,
}

/// Unused export
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnusedExport {
    /// Export name
    pub name: String,
    /// File containing the export
    pub file: String,
    /// Line number
    pub line: u32,
    /// Export type (function, class, const, etc.)
    pub export_type: String,
}

/// Result of coupling analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CouplingAnalysisResult {
    /// Module metrics
    pub modules: Vec<ModuleMetrics>,
    /// Dependency cycles found
    pub cycles: Vec<DependencyCycle>,
    /// Coupling hotspots
    pub hotspots: Vec<CouplingHotspot>,
    /// Unused exports
    pub unused_exports: Vec<UnusedExport>,
    /// Overall health score (0-100)
    pub health_score: f32,
    /// Files analyzed
    pub files_analyzed: usize,
    /// Duration in milliseconds
    pub duration_ms: u64,
}

/// Import/export graph for a file
#[derive(Debug, Clone, Default)]
pub struct FileGraph {
    /// File path
    pub path: String,
    /// Imports from other files
    pub imports: Vec<ImportEdge>,
    /// Exports from this file
    pub exports: Vec<ExportNode>,
}

/// An import edge
#[derive(Debug, Clone)]
pub struct ImportEdge {
    /// Source file (where import is from)
    pub source: String,
    /// Imported symbols
    pub symbols: Vec<String>,
    /// Line number
    pub line: u32,
}

/// An export node
#[derive(Debug, Clone)]
pub struct ExportNode {
    /// Export name
    pub name: String,
    /// Line number
    pub line: u32,
    /// Is default export
    pub is_default: bool,
}
