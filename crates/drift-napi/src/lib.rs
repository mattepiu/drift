//! NAPI bindings for drift-core
//!
//! This crate exposes drift-core functionality to Node.js via napi-rs.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::path::PathBuf;

use drift_core::scanner::{ScanConfig, Scanner};
use drift_core::parsers::ParserManager;
use drift_core::call_graph::{StreamingBuilder, BuilderConfig};
use drift_core::boundaries::{BoundaryScanner, DataOperation, SensitivityType};
use drift_core::reachability::{
    ReachabilityEngine, ReachabilityOptions, InverseReachabilityOptions,
    CallGraph as ReachCallGraph, FunctionNode, CallSite as ReachCallSite,
    DataAccessPoint as ReachDataAccessPoint, DataOperation as ReachDataOperation,
    SqliteReachabilityEngine,
};

// ============================================================================
// Scanner Types
// ============================================================================

/// Scan result exposed to JavaScript
#[napi(object)]
pub struct JsScanResult {
    pub root: String,
    pub files: Vec<JsFileInfo>,
    pub stats: JsScanStats,
    pub errors: Vec<String>,
}

/// File info exposed to JavaScript
#[napi(object)]
pub struct JsFileInfo {
    pub path: String,
    pub size: i64,
    pub hash: Option<String>,
    pub language: Option<String>,
}

/// Scan stats exposed to JavaScript
#[napi(object)]
pub struct JsScanStats {
    pub total_files: i64,
    pub total_bytes: i64,
    pub dirs_skipped: i64,
    pub files_skipped: i64,
    pub duration_ms: i64,
}

/// Scan configuration from JavaScript
#[napi(object)]
pub struct JsScanConfig {
    pub root: String,
    pub patterns: Vec<String>,
    pub extra_ignores: Option<Vec<String>>,
    pub compute_hashes: Option<bool>,
    pub max_file_size: Option<i64>,
    pub threads: Option<i64>,
}

// ============================================================================
// Parser Types
// ============================================================================

/// Parse result exposed to JavaScript
#[napi(object)]
pub struct JsParseResult {
    pub language: String,
    pub functions: Vec<JsFunctionInfo>,
    pub classes: Vec<JsClassInfo>,
    pub imports: Vec<JsImportInfo>,
    pub exports: Vec<JsExportInfo>,
    pub calls: Vec<JsCallSite>,
    pub errors: Vec<JsParseError>,
    pub parse_time_us: i64,
}

/// Parameter info exposed to JavaScript
#[napi(object)]
pub struct JsParameterInfo {
    pub name: String,
    pub type_annotation: Option<String>,
    pub default_value: Option<String>,
    pub is_rest: bool,
}

/// Function info exposed to JavaScript
#[napi(object)]
pub struct JsFunctionInfo {
    pub name: String,
    pub qualified_name: Option<String>,
    pub parameters: Vec<JsParameterInfo>,
    pub return_type: Option<String>,
    pub is_exported: bool,
    pub is_async: bool,
    pub start_line: i64,
    pub end_line: i64,
    pub decorators: Vec<String>,
    pub doc_comment: Option<String>,
}

/// Class info exposed to JavaScript
#[napi(object)]
pub struct JsClassInfo {
    pub name: String,
    pub extends: Option<String>,
    pub implements: Vec<String>,
    pub is_exported: bool,
    pub start_line: i64,
    pub end_line: i64,
    pub decorators: Vec<String>,
    pub properties: Vec<JsPropertyInfo>,
}

/// Property info exposed to JavaScript (for struct fields, class properties)
#[napi(object)]
pub struct JsPropertyInfo {
    pub name: String,
    pub type_annotation: Option<String>,
    pub is_static: bool,
    pub is_readonly: bool,
    pub visibility: String,
    pub tags: Option<Vec<JsStructTag>>,
}

/// Struct tag exposed to JavaScript (for Go struct field tags)
#[napi(object)]
pub struct JsStructTag {
    pub key: String,
    pub value: String,
}

/// Import info exposed to JavaScript
#[napi(object)]
pub struct JsImportInfo {
    pub source: String,
    pub named: Vec<String>,
    pub default: Option<String>,
    pub namespace: Option<String>,
    pub is_type_only: bool,
    pub line: i64,
}

/// Export info exposed to JavaScript
#[napi(object)]
pub struct JsExportInfo {
    pub name: String,
    pub from_source: Option<String>,
    pub is_default: bool,
    pub line: i64,
}

/// Call site exposed to JavaScript
#[napi(object)]
pub struct JsCallSite {
    pub callee: String,
    pub receiver: Option<String>,
    pub arg_count: i64,
    pub line: i64,
}

/// Parse error exposed to JavaScript
#[napi(object)]
pub struct JsParseError {
    pub message: String,
    pub line: i64,
}

// ============================================================================
// Scanner Functions
// ============================================================================

/// Scan a directory for source files
#[napi]
pub fn scan(config: JsScanConfig) -> Result<JsScanResult> {
    let rust_config = ScanConfig {
        root: PathBuf::from(&config.root),
        patterns: config.patterns,
        extra_ignores: config.extra_ignores.unwrap_or_default(),
        compute_hashes: config.compute_hashes.unwrap_or(true),
        max_file_size: config.max_file_size.unwrap_or(10 * 1024 * 1024) as u64,
        threads: config.threads.unwrap_or(0) as usize,
    };
    
    let scanner = Scanner::new(rust_config);
    let result = scanner.scan();
    
    Ok(JsScanResult {
        root: result.root,
        files: result.files.into_iter().map(|f| JsFileInfo {
            path: f.path,
            size: f.size as i64,
            hash: f.hash,
            language: f.language,
        }).collect(),
        stats: JsScanStats {
            total_files: result.stats.total_files as i64,
            total_bytes: result.stats.total_bytes as i64,
            dirs_skipped: result.stats.dirs_skipped as i64,
            files_skipped: result.stats.files_skipped as i64,
            duration_ms: result.stats.duration.as_millis() as i64,
        },
        errors: result.errors,
    })
}

// ============================================================================
// Parser Functions
// ============================================================================

/// Parse source code and extract functions, classes, imports, exports, and calls
#[napi]
pub fn parse(source: String, file_path: String) -> Result<Option<JsParseResult>> {
    // Use thread-local parser manager for better performance
    thread_local! {
        static PARSER_MANAGER: std::cell::RefCell<ParserManager> = 
            std::cell::RefCell::new(ParserManager::new());
    }
    
    PARSER_MANAGER.with(|manager| {
        let mut manager = manager.borrow_mut();
        let result = match manager.parse_file(&file_path, &source) {
            Some(r) => r,
            None => return Ok(None),
        };
        
        Ok(Some(JsParseResult {
            language: format!("{:?}", result.language).to_lowercase(),
            functions: result.functions.into_iter().map(|f| JsFunctionInfo {
                name: f.name,
                qualified_name: f.qualified_name,
                parameters: f.parameters.into_iter().map(|p| JsParameterInfo {
                    name: p.name,
                    type_annotation: p.type_annotation,
                    default_value: p.default_value,
                    is_rest: p.is_rest,
                }).collect(),
                return_type: f.return_type,
                is_exported: f.is_exported,
                is_async: f.is_async,
                start_line: f.range.start.line as i64,
                end_line: f.range.end.line as i64,
                decorators: f.decorators,
                doc_comment: f.doc_comment,
            }).collect(),
            classes: result.classes.into_iter().map(|c| JsClassInfo {
                name: c.name,
                extends: c.extends,
                implements: c.implements,
                is_exported: c.is_exported,
                start_line: c.range.start.line as i64,
                end_line: c.range.end.line as i64,
                decorators: c.decorators,
                properties: c.properties.into_iter().map(|p| JsPropertyInfo {
                    name: p.name,
                    type_annotation: p.type_annotation,
                    is_static: p.is_static,
                    is_readonly: p.is_readonly,
                    visibility: match p.visibility {
                        drift_core::parsers::Visibility::Public => "public".to_string(),
                        drift_core::parsers::Visibility::Private => "private".to_string(),
                        drift_core::parsers::Visibility::Protected => "protected".to_string(),
                    },
                    tags: p.tags.map(|tags| tags.into_iter().map(|t| JsStructTag {
                        key: t.key,
                        value: t.value,
                    }).collect()),
                }).collect(),
            }).collect(),
            imports: result.imports.into_iter().map(|i| JsImportInfo {
                source: i.source,
                named: i.named,
                default: i.default,
                namespace: i.namespace,
                is_type_only: i.is_type_only,
                line: i.range.start.line as i64,
            }).collect(),
            exports: result.exports.into_iter().map(|e| JsExportInfo {
                name: e.name,
                from_source: e.from_source,
                is_default: e.is_default,
                line: e.range.start.line as i64,
            }).collect(),
            calls: result.calls.into_iter().map(|c| JsCallSite {
                callee: c.callee,
                receiver: c.receiver,
                arg_count: c.arg_count as i64,
                line: c.range.start.line as i64,
            }).collect(),
            errors: result.errors.into_iter().map(|e| JsParseError {
                message: e.message,
                line: e.range.start.line as i64,
            }).collect(),
            parse_time_us: result.parse_time_us as i64,
        }))
    })
}

/// Get list of supported languages
#[napi]
pub fn supported_languages() -> Vec<String> {
    let manager = ParserManager::new();
    manager.supported_languages()
        .into_iter()
        .map(|l| format!("{:?}", l).to_lowercase())
        .collect()
}

/// Get the version of drift-core
#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ============================================================================
// Call Graph Types
// ============================================================================

/// Call graph build result exposed to JavaScript
#[napi(object)]
pub struct JsBuildResult {
    pub files_processed: i64,
    pub total_functions: i64,
    pub total_calls: i64,
    pub resolved_calls: i64,
    pub resolution_rate: f64,
    pub entry_points: i64,
    pub data_accessors: i64,
    pub errors: Vec<String>,
    pub duration_ms: i64,
}

/// Call graph build configuration from JavaScript
#[napi(object)]
pub struct JsBuildConfig {
    pub root: String,
    pub patterns: Vec<String>,
    pub resolution_batch_size: Option<i64>,
}

// ============================================================================
// Call Graph Functions
// ============================================================================

/// Build call graph for a project using SQLite storage (recommended)
/// 
/// This uses parallel parsing with rayon and batched SQLite writes
/// for optimal performance on large codebases.
#[napi]
pub fn build_call_graph(config: JsBuildConfig) -> Result<JsBuildResult> {
    let rust_config = BuilderConfig {
        root_dir: PathBuf::from(&config.root),
        resolution_batch_size: config.resolution_batch_size.unwrap_or(50) as usize,
        on_progress: None,
    };
    
    let builder = StreamingBuilder::new(rust_config);
    let patterns: Vec<&str> = config.patterns.iter().map(|s| s.as_str()).collect();
    
    // Use SQLite mode for better performance
    let result = builder.build_sqlite(&patterns);
    
    Ok(JsBuildResult {
        files_processed: result.files_processed as i64,
        total_functions: result.total_functions as i64,
        total_calls: result.total_calls as i64,
        resolved_calls: result.resolved_calls as i64,
        resolution_rate: result.resolution_rate as f64,
        entry_points: result.entry_points as i64,
        data_accessors: result.data_accessors as i64,
        errors: result.errors,
        duration_ms: result.duration_ms as i64,
    })
}

/// Build call graph using legacy JSON shard storage
/// 
/// This is the original implementation, kept for backward compatibility.
/// Use build_call_graph() for better performance.
#[napi]
pub fn build_call_graph_legacy(config: JsBuildConfig) -> Result<JsBuildResult> {
    let rust_config = BuilderConfig {
        root_dir: PathBuf::from(&config.root),
        resolution_batch_size: config.resolution_batch_size.unwrap_or(50) as usize,
        on_progress: None,
    };
    
    let mut builder = StreamingBuilder::new(rust_config);
    let patterns: Vec<&str> = config.patterns.iter().map(|s| s.as_str()).collect();
    let result = builder.build(&patterns);
    
    Ok(JsBuildResult {
        files_processed: result.files_processed as i64,
        total_functions: result.total_functions as i64,
        total_calls: result.total_calls as i64,
        resolved_calls: result.resolved_calls as i64,
        resolution_rate: result.resolution_rate as f64,
        entry_points: result.entry_points as i64,
        data_accessors: result.data_accessors as i64,
        errors: result.errors,
        duration_ms: result.duration_ms as i64,
    })
}

// ============================================================================
// Boundary Types
// ============================================================================

/// Data access point exposed to JavaScript
#[napi(object)]
pub struct JsDataAccessPoint {
    pub table: String,
    pub operation: String,
    pub fields: Vec<String>,
    pub file: String,
    pub line: i64,
    pub confidence: f64,
    pub framework: Option<String>,
}

/// Sensitive field exposed to JavaScript
#[napi(object)]
pub struct JsSensitiveField {
    pub field: String,
    pub table: Option<String>,
    pub sensitivity_type: String,
    pub file: String,
    pub line: i64,
    pub confidence: f64,
}

/// ORM model exposed to JavaScript
#[napi(object)]
pub struct JsORMModel {
    pub name: String,
    pub table_name: String,
    pub fields: Vec<String>,
    pub file: String,
    pub line: i64,
    pub framework: String,
    pub confidence: f64,
}

/// Boundary scan result exposed to JavaScript
#[napi(object)]
pub struct JsBoundaryScanResult {
    pub access_points: Vec<JsDataAccessPoint>,
    pub sensitive_fields: Vec<JsSensitiveField>,
    pub models: Vec<JsORMModel>,
    pub files_scanned: i64,
    pub duration_ms: i64,
}

// ============================================================================
// Boundary Functions
// ============================================================================

/// Scan files for data boundaries (data access points and sensitive fields)
/// Uses AST-first approach with regex fallbacks for SQL strings
#[napi]
pub fn scan_boundaries(files: Vec<String>) -> Result<JsBoundaryScanResult> {
    let mut scanner = BoundaryScanner::new();
    let result = scanner.scan_files(&files);
    
    Ok(JsBoundaryScanResult {
        access_points: result.access_points.into_iter().map(|a| JsDataAccessPoint {
            table: a.table,
            operation: match a.operation {
                DataOperation::Read => "read".to_string(),
                DataOperation::Write => "write".to_string(),
                DataOperation::Delete => "delete".to_string(),
            },
            fields: a.fields,
            file: a.file,
            line: a.line as i64,
            confidence: a.confidence as f64,
            framework: a.framework,
        }).collect(),
        sensitive_fields: result.sensitive_fields.into_iter().map(|s| JsSensitiveField {
            field: s.field,
            table: s.table,
            sensitivity_type: match s.sensitivity_type {
                SensitivityType::Pii => "pii".to_string(),
                SensitivityType::Credentials => "credentials".to_string(),
                SensitivityType::Financial => "financial".to_string(),
                SensitivityType::Health => "health".to_string(),
            },
            file: s.file,
            line: s.line as i64,
            confidence: s.confidence as f64,
        }).collect(),
        models: result.models.into_iter().map(|m| JsORMModel {
            name: m.name,
            table_name: m.table_name,
            fields: m.fields,
            file: m.file,
            line: m.line as i64,
            framework: m.framework,
            confidence: m.confidence as f64,
        }).collect(),
        files_scanned: result.files_scanned as i64,
        duration_ms: result.duration_ms as i64,
    })
}

/// Scan a single source string for boundaries using AST-first approach
#[napi]
pub fn scan_boundaries_source(source: String, file_path: String) -> Result<JsBoundaryScanResult> {
    use drift_core::boundaries::{DataAccessDetector, SensitiveFieldDetector};
    use drift_core::parsers::ParserManager;
    use std::time::Instant;
    
    let start = Instant::now();
    
    // AST-first: parse the source
    let mut parser = ParserManager::new();
    let access_detector = DataAccessDetector::new();
    let sensitive_detector = SensitiveFieldDetector::new();
    
    // Try AST parsing first
    let mut access_points = if let Some(result) = parser.parse_file(&file_path, &source) {
        access_detector.detect_from_ast(&result, &file_path)
    } else {
        Vec::new()
    };
    
    // Fallback: detect SQL in raw source
    let sql_access = access_detector.detect_sql_in_source(&source, &file_path);
    access_points.extend(sql_access);
    
    // Sensitive fields (regex-based for field names)
    let sensitive_fields = sensitive_detector.detect(&source, &file_path);
    
    Ok(JsBoundaryScanResult {
        access_points: access_points.into_iter().map(|a| JsDataAccessPoint {
            table: a.table,
            operation: match a.operation {
                DataOperation::Read => "read".to_string(),
                DataOperation::Write => "write".to_string(),
                DataOperation::Delete => "delete".to_string(),
            },
            fields: a.fields,
            file: a.file,
            line: a.line as i64,
            confidence: a.confidence as f64,
            framework: a.framework,
        }).collect(),
        sensitive_fields: sensitive_fields.into_iter().map(|s| JsSensitiveField {
            field: s.field,
            table: s.table,
            sensitivity_type: match s.sensitivity_type {
                SensitivityType::Pii => "pii".to_string(),
                SensitivityType::Credentials => "credentials".to_string(),
                SensitivityType::Financial => "financial".to_string(),
                SensitivityType::Health => "health".to_string(),
            },
            file: s.file,
            line: s.line as i64,
            confidence: s.confidence as f64,
        }).collect(),
        models: Vec::new(),
        files_scanned: 1,
        duration_ms: start.elapsed().as_millis() as i64,
    })
}


// ============================================================================
// Coupling Analysis Types
// ============================================================================

/// Module metrics exposed to JavaScript
#[napi(object)]
pub struct JsModuleMetrics {
    pub path: String,
    pub ca: i64,
    pub ce: i64,
    pub instability: f64,
    pub abstractness: f64,
    pub distance: f64,
    pub files: Vec<String>,
}

/// Dependency cycle exposed to JavaScript
#[napi(object)]
pub struct JsDependencyCycle {
    pub modules: Vec<String>,
    pub severity: String,
    pub files_affected: i64,
}

/// Coupling hotspot exposed to JavaScript
#[napi(object)]
pub struct JsCouplingHotspot {
    pub module: String,
    pub total_coupling: i64,
    pub incoming: Vec<String>,
    pub outgoing: Vec<String>,
}

/// Unused export exposed to JavaScript
#[napi(object)]
pub struct JsUnusedExport {
    pub name: String,
    pub file: String,
    pub line: i64,
    pub export_type: String,
}

/// Coupling analysis result exposed to JavaScript
#[napi(object)]
pub struct JsCouplingResult {
    pub modules: Vec<JsModuleMetrics>,
    pub cycles: Vec<JsDependencyCycle>,
    pub hotspots: Vec<JsCouplingHotspot>,
    pub unused_exports: Vec<JsUnusedExport>,
    pub health_score: f64,
    pub files_analyzed: i64,
    pub duration_ms: i64,
}

// ============================================================================
// Coupling Analysis Functions
// ============================================================================

/// Analyze module coupling using AST-first approach
#[napi]
pub fn analyze_coupling(files: Vec<String>) -> Result<JsCouplingResult> {
    use drift_core::coupling::{CouplingAnalyzer, CycleSeverity};
    
    let mut analyzer = CouplingAnalyzer::new();
    let result = analyzer.analyze(&files);
    
    Ok(JsCouplingResult {
        modules: result.modules.into_iter().map(|m| JsModuleMetrics {
            path: m.path,
            ca: m.ca as i64,
            ce: m.ce as i64,
            instability: m.instability as f64,
            abstractness: m.abstractness as f64,
            distance: m.distance as f64,
            files: m.files,
        }).collect(),
        cycles: result.cycles.into_iter().map(|c| JsDependencyCycle {
            modules: c.modules,
            severity: match c.severity {
                CycleSeverity::Info => "info".to_string(),
                CycleSeverity::Warning => "warning".to_string(),
                CycleSeverity::Critical => "critical".to_string(),
            },
            files_affected: c.files_affected as i64,
        }).collect(),
        hotspots: result.hotspots.into_iter().map(|h| JsCouplingHotspot {
            module: h.module,
            total_coupling: h.total_coupling as i64,
            incoming: h.incoming,
            outgoing: h.outgoing,
        }).collect(),
        unused_exports: result.unused_exports.into_iter().map(|u| JsUnusedExport {
            name: u.name,
            file: u.file,
            line: u.line as i64,
            export_type: u.export_type,
        }).collect(),
        health_score: result.health_score as f64,
        files_analyzed: result.files_analyzed as i64,
        duration_ms: result.duration_ms as i64,
    })
}

// ============================================================================
// Test Topology Types
// ============================================================================

/// Test file exposed to JavaScript
#[napi(object)]
pub struct JsTestFile {
    pub path: String,
    pub tests_file: Option<String>,
    pub framework: String,
    pub test_count: i64,
    pub mock_count: i64,
}

/// Test coverage exposed to JavaScript
#[napi(object)]
pub struct JsTestCoverage {
    pub source_file: String,
    pub test_files: Vec<String>,
    pub coverage_percent: Option<f64>,
    pub risk_level: String,
}

/// Test topology result exposed to JavaScript
#[napi(object)]
pub struct JsTestTopologyResult {
    pub test_files: Vec<JsTestFile>,
    pub coverage: Vec<JsTestCoverage>,
    pub uncovered_files: Vec<String>,
    pub total_tests: i64,
    pub skipped_tests: i64,
    pub files_analyzed: i64,
    pub duration_ms: i64,
}

// ============================================================================
// Test Topology Functions
// ============================================================================

/// Analyze test topology using AST-first approach
#[napi]
pub fn analyze_test_topology(files: Vec<String>) -> Result<JsTestTopologyResult> {
    use drift_core::test_topology::{TestTopologyAnalyzer, TestFramework, RiskLevel};
    
    let mut analyzer = TestTopologyAnalyzer::new();
    let result = analyzer.analyze(&files);
    
    Ok(JsTestTopologyResult {
        test_files: result.test_files.into_iter().map(|t| JsTestFile {
            path: t.path,
            tests_file: t.tests_file,
            framework: match t.framework {
                TestFramework::Jest => "jest".to_string(),
                TestFramework::Vitest => "vitest".to_string(),
                TestFramework::Mocha => "mocha".to_string(),
                TestFramework::Pytest => "pytest".to_string(),
                TestFramework::JUnit => "junit".to_string(),
                TestFramework::NUnit => "nunit".to_string(),
                TestFramework::XUnit => "xunit".to_string(),
                TestFramework::PHPUnit => "phpunit".to_string(),
                TestFramework::GoTest => "gotest".to_string(),
                TestFramework::RustTest => "rusttest".to_string(),
                TestFramework::Catch2 => "catch2".to_string(),
                TestFramework::GoogleTest => "googletest".to_string(),
                TestFramework::Unknown => "unknown".to_string(),
            },
            test_count: t.test_cases.len() as i64,
            mock_count: t.mocks.len() as i64,
        }).collect(),
        coverage: result.coverage.into_iter().map(|c| JsTestCoverage {
            source_file: c.source_file,
            test_files: c.test_files,
            coverage_percent: c.coverage_percent.map(|p| p as f64),
            risk_level: match c.risk_level {
                RiskLevel::Low => "low".to_string(),
                RiskLevel::Medium => "medium".to_string(),
                RiskLevel::High => "high".to_string(),
                RiskLevel::Critical => "critical".to_string(),
            },
        }).collect(),
        uncovered_files: result.uncovered_files,
        total_tests: result.total_tests as i64,
        skipped_tests: result.skipped_tests as i64,
        files_analyzed: result.files_analyzed as i64,
        duration_ms: result.duration_ms as i64,
    })
}

// ============================================================================
// Error Handling Types
// ============================================================================

/// Error boundary exposed to JavaScript
#[napi(object)]
pub struct JsErrorBoundary {
    pub file: String,
    pub start_line: i64,
    pub end_line: i64,
    pub boundary_type: String,
    pub caught_types: Vec<String>,
    pub rethrows: bool,
    pub logs_error: bool,
    pub is_swallowed: bool,
}

/// Error gap exposed to JavaScript
#[napi(object)]
pub struct JsErrorGap {
    pub file: String,
    pub line: i64,
    pub function: String,
    pub gap_type: String,
    pub severity: String,
    pub description: String,
}

/// Error type exposed to JavaScript
#[napi(object)]
pub struct JsErrorType {
    pub name: String,
    pub file: String,
    pub line: i64,
    pub extends: Option<String>,
    pub is_exported: bool,
}

/// Error handling result exposed to JavaScript
#[napi(object)]
pub struct JsErrorHandlingResult {
    pub boundaries: Vec<JsErrorBoundary>,
    pub gaps: Vec<JsErrorGap>,
    pub error_types: Vec<JsErrorType>,
    pub files_analyzed: i64,
    pub duration_ms: i64,
}

// ============================================================================
// Error Handling Functions
// ============================================================================

/// Analyze error handling using AST-first approach
#[napi]
pub fn analyze_error_handling(files: Vec<String>) -> Result<JsErrorHandlingResult> {
    use drift_core::error_handling::{
        ErrorHandlingAnalyzer, BoundaryType, GapType, GapSeverity
    };
    
    let mut analyzer = ErrorHandlingAnalyzer::new();
    let result = analyzer.analyze(&files);
    
    Ok(JsErrorHandlingResult {
        boundaries: result.boundaries.into_iter().map(|b| JsErrorBoundary {
            file: b.file,
            start_line: b.start_line as i64,
            end_line: b.end_line as i64,
            boundary_type: match b.boundary_type {
                BoundaryType::TryCatch => "try_catch".to_string(),
                BoundaryType::TryExcept => "try_except".to_string(),
                BoundaryType::TryFinally => "try_finally".to_string(),
                BoundaryType::ErrorHandler => "error_handler".to_string(),
                BoundaryType::PromiseCatch => "promise_catch".to_string(),
                BoundaryType::AsyncAwait => "async_await".to_string(),
                BoundaryType::ResultMatch => "result_match".to_string(),
                BoundaryType::PanicHandler => "panic_handler".to_string(),
            },
            caught_types: b.caught_types,
            rethrows: b.rethrows,
            logs_error: b.logs_error,
            is_swallowed: b.is_swallowed,
        }).collect(),
        gaps: result.gaps.into_iter().map(|g| JsErrorGap {
            file: g.file,
            line: g.line as i64,
            function: g.function,
            gap_type: match g.gap_type {
                GapType::UnhandledPromise => "unhandled_promise".to_string(),
                GapType::UnhandledAsync => "unhandled_async".to_string(),
                GapType::MissingCatch => "missing_catch".to_string(),
                GapType::SwallowedError => "swallowed_error".to_string(),
                GapType::UnwrapWithoutCheck => "unwrap_without_check".to_string(),
                GapType::UncheckedResult => "unchecked_result".to_string(),
                GapType::MissingErrorBoundary => "missing_error_boundary".to_string(),
            },
            severity: match g.severity {
                GapSeverity::Low => "low".to_string(),
                GapSeverity::Medium => "medium".to_string(),
                GapSeverity::High => "high".to_string(),
                GapSeverity::Critical => "critical".to_string(),
            },
            description: g.description,
        }).collect(),
        error_types: result.error_types.into_iter().map(|e| JsErrorType {
            name: e.name,
            file: e.file,
            line: e.line as i64,
            extends: e.extends,
            is_exported: e.is_exported,
        }).collect(),
        files_analyzed: result.files_analyzed as i64,
        duration_ms: result.duration_ms as i64,
    })
}


// ============================================================================
// Reachability Types
// ============================================================================

/// Code location exposed to JavaScript
#[napi(object)]
pub struct JsCodeLocation {
    pub file: String,
    pub line: i64,
    pub column: Option<i64>,
    pub function_id: Option<String>,
}

/// Call path node exposed to JavaScript
#[napi(object)]
pub struct JsCallPathNode {
    pub function_id: String,
    pub function_name: String,
    pub file: String,
    pub line: i64,
}

/// Reachable data access exposed to JavaScript
#[napi(object)]
pub struct JsReachableDataAccess {
    pub table: String,
    pub operation: String,
    pub fields: Vec<String>,
    pub file: String,
    pub line: i64,
    pub confidence: f64,
    pub framework: Option<String>,
    pub path: Vec<JsCallPathNode>,
    pub depth: i64,
}

/// Sensitive field access exposed to JavaScript
#[napi(object)]
pub struct JsSensitiveFieldAccess {
    pub field: String,
    pub table: Option<String>,
    pub sensitivity_type: String,
    pub file: String,
    pub line: i64,
    pub confidence: f64,
    pub paths: Vec<Vec<JsCallPathNode>>,
    pub access_count: i64,
}

/// Reachability result exposed to JavaScript
#[napi(object)]
pub struct JsReachabilityResult {
    pub origin: JsCodeLocation,
    pub reachable_access: Vec<JsReachableDataAccess>,
    pub tables: Vec<String>,
    pub sensitive_fields: Vec<JsSensitiveFieldAccess>,
    pub max_depth: i64,
    pub functions_traversed: i64,
}

/// Reachability options from JavaScript
#[napi(object)]
pub struct JsReachabilityOptions {
    pub max_depth: Option<i64>,
    pub sensitive_only: Option<bool>,
    pub tables: Option<Vec<String>>,
    pub include_unresolved: Option<bool>,
}

/// Inverse access path exposed to JavaScript
#[napi(object)]
pub struct JsInverseAccessPath {
    pub entry_point: String,
    pub path: Vec<JsCallPathNode>,
    pub access_table: String,
    pub access_operation: String,
    pub access_fields: Vec<String>,
    pub access_file: String,
    pub access_line: i64,
}

/// Inverse reachability result exposed to JavaScript
#[napi(object)]
pub struct JsInverseReachabilityResult {
    pub target_table: String,
    pub target_field: Option<String>,
    pub access_paths: Vec<JsInverseAccessPath>,
    pub entry_points: Vec<String>,
    pub total_accessors: i64,
}

/// Call graph function node from JavaScript
#[napi(object)]
pub struct JsCallGraphFunction {
    pub id: String,
    pub name: String,
    pub qualified_name: String,
    pub file: String,
    pub start_line: i64,
    pub end_line: i64,
    pub calls: Vec<JsCallGraphCallSite>,
    pub data_access: Vec<JsCallGraphDataAccess>,
    pub is_entry_point: bool,
}

/// Call site for call graph from JavaScript
#[napi(object)]
pub struct JsCallGraphCallSite {
    pub callee_name: String,
    pub resolved: bool,
    pub resolved_candidates: Vec<String>,
    pub line: i64,
}

/// Data access for call graph from JavaScript
#[napi(object)]
pub struct JsCallGraphDataAccess {
    pub table: String,
    pub operation: String,
    pub fields: Vec<String>,
    pub file: String,
    pub line: i64,
    pub confidence: f64,
    pub framework: Option<String>,
}

/// Call graph input from JavaScript
#[napi(object)]
pub struct JsCallGraphInput {
    pub functions: Vec<JsCallGraphFunction>,
    pub entry_points: Vec<String>,
    pub data_accessors: Vec<String>,
}

// ============================================================================
// Reachability Functions
// ============================================================================

/// Analyze reachability from a function
#[napi]
pub fn analyze_reachability(
    graph_input: JsCallGraphInput,
    function_id: String,
    options: JsReachabilityOptions,
) -> Result<JsReachabilityResult> {
    // Convert JS call graph to Rust call graph
    let mut graph = ReachCallGraph::default();
    
    for func in graph_input.functions {
        let calls: Vec<ReachCallSite> = func.calls.into_iter().map(|c| ReachCallSite {
            callee_name: c.callee_name,
            resolved: c.resolved,
            resolved_candidates: c.resolved_candidates,
            line: c.line as u32,
        }).collect();
        
        let data_access: Vec<ReachDataAccessPoint> = func.data_access.into_iter().map(|a| {
            ReachDataAccessPoint {
                table: a.table,
                operation: match a.operation.as_str() {
                    "write" => ReachDataOperation::Write,
                    "delete" => ReachDataOperation::Delete,
                    _ => ReachDataOperation::Read,
                },
                fields: a.fields,
                file: a.file,
                line: a.line as u32,
                confidence: a.confidence as f32,
                framework: a.framework,
            }
        }).collect();
        
        graph.functions.insert(func.id.clone(), FunctionNode {
            id: func.id,
            name: func.name,
            qualified_name: func.qualified_name,
            file: func.file,
            start_line: func.start_line as u32,
            end_line: func.end_line as u32,
            calls,
            data_access,
            is_entry_point: func.is_entry_point,
        });
    }
    
    graph.entry_points = graph_input.entry_points;
    graph.data_accessors = graph_input.data_accessors;
    
    // Create engine and run analysis
    let engine = ReachabilityEngine::new(graph);
    let rust_options = ReachabilityOptions {
        max_depth: options.max_depth.map(|d| d as u32),
        sensitive_only: options.sensitive_only.unwrap_or(false),
        tables: options.tables.unwrap_or_default(),
        include_unresolved: options.include_unresolved.unwrap_or(false),
    };
    
    let result = engine.get_reachable_data_from_function(&function_id, &rust_options);
    
    // Convert result to JS types
    Ok(JsReachabilityResult {
        origin: JsCodeLocation {
            file: result.origin.file,
            line: result.origin.line as i64,
            column: result.origin.column.map(|c| c as i64),
            function_id: result.origin.function_id,
        },
        reachable_access: result.reachable_access.into_iter().map(|a| JsReachableDataAccess {
            table: a.access.table,
            operation: match a.access.operation {
                ReachDataOperation::Read => "read".to_string(),
                ReachDataOperation::Write => "write".to_string(),
                ReachDataOperation::Delete => "delete".to_string(),
            },
            fields: a.access.fields,
            file: a.access.file,
            line: a.access.line as i64,
            confidence: a.access.confidence as f64,
            framework: a.access.framework,
            path: a.path.into_iter().map(|p| JsCallPathNode {
                function_id: p.function_id,
                function_name: p.function_name,
                file: p.file,
                line: p.line as i64,
            }).collect(),
            depth: a.depth as i64,
        }).collect(),
        tables: result.tables,
        sensitive_fields: result.sensitive_fields.into_iter().map(|s| JsSensitiveFieldAccess {
            field: s.field.field,
            table: s.field.table,
            sensitivity_type: format!("{:?}", s.field.sensitivity_type).to_lowercase(),
            file: s.field.file,
            line: s.field.line as i64,
            confidence: s.field.confidence as f64,
            paths: s.paths.into_iter().map(|path| {
                path.into_iter().map(|p| JsCallPathNode {
                    function_id: p.function_id,
                    function_name: p.function_name,
                    file: p.file,
                    line: p.line as i64,
                }).collect()
            }).collect(),
            access_count: s.access_count as i64,
        }).collect(),
        max_depth: result.max_depth as i64,
        functions_traversed: result.functions_traversed as i64,
    })
}

/// Analyze inverse reachability - who can access this data?
#[napi]
pub fn analyze_inverse_reachability(
    graph_input: JsCallGraphInput,
    table: String,
    field: Option<String>,
    max_depth: Option<i64>,
) -> Result<JsInverseReachabilityResult> {
    // Convert JS call graph to Rust call graph
    let mut graph = ReachCallGraph::default();
    
    for func in graph_input.functions {
        let calls: Vec<ReachCallSite> = func.calls.into_iter().map(|c| ReachCallSite {
            callee_name: c.callee_name,
            resolved: c.resolved,
            resolved_candidates: c.resolved_candidates,
            line: c.line as u32,
        }).collect();
        
        let data_access: Vec<ReachDataAccessPoint> = func.data_access.into_iter().map(|a| {
            ReachDataAccessPoint {
                table: a.table,
                operation: match a.operation.as_str() {
                    "write" => ReachDataOperation::Write,
                    "delete" => ReachDataOperation::Delete,
                    _ => ReachDataOperation::Read,
                },
                fields: a.fields,
                file: a.file,
                line: a.line as u32,
                confidence: a.confidence as f32,
                framework: a.framework,
            }
        }).collect();
        
        graph.functions.insert(func.id.clone(), FunctionNode {
            id: func.id,
            name: func.name,
            qualified_name: func.qualified_name,
            file: func.file,
            start_line: func.start_line as u32,
            end_line: func.end_line as u32,
            calls,
            data_access,
            is_entry_point: func.is_entry_point,
        });
    }
    
    graph.entry_points = graph_input.entry_points;
    graph.data_accessors = graph_input.data_accessors;
    
    // Create engine and run analysis
    let engine = ReachabilityEngine::new(graph);
    let options = InverseReachabilityOptions {
        table: table.clone(),
        field: field.clone(),
        max_depth: max_depth.map(|d| d as u32),
    };
    
    let result = engine.get_code_paths_to_data(&options);
    
    // Convert result to JS types
    Ok(JsInverseReachabilityResult {
        target_table: result.target.table,
        target_field: result.target.field,
        access_paths: result.access_paths.into_iter().map(|a| JsInverseAccessPath {
            entry_point: a.entry_point,
            path: a.path.into_iter().map(|p| JsCallPathNode {
                function_id: p.function_id,
                function_name: p.function_name,
                file: p.file,
                line: p.line as i64,
            }).collect(),
            access_table: a.access_point.table,
            access_operation: match a.access_point.operation {
                ReachDataOperation::Read => "read".to_string(),
                ReachDataOperation::Write => "write".to_string(),
                ReachDataOperation::Delete => "delete".to_string(),
            },
            access_fields: a.access_point.fields,
            access_file: a.access_point.file,
            access_line: a.access_point.line as i64,
        }).collect(),
        entry_points: result.entry_points,
        total_accessors: result.total_accessors as i64,
    })
}

// ============================================================================
// SQLite-Backed Reachability Functions (Recommended for large codebases)
// ============================================================================

/// Analyze reachability from a function using SQLite storage
/// 
/// This queries the SQLite call graph database directly, avoiding the need
/// to load the entire call graph into memory. Recommended for large codebases.
/// 
/// Requires: Call graph must be built first using build_call_graph()
#[napi]
pub fn analyze_reachability_sqlite(
    root_dir: String,
    function_id: String,
    options: JsReachabilityOptions,
) -> Result<JsReachabilityResult> {
    let root = PathBuf::from(&root_dir);
    
    let engine = SqliteReachabilityEngine::from_project_root(&root)
        .map_err(|e| napi::Error::from_reason(format!("Failed to open call graph database: {}. Run build_call_graph() first.", e)))?;
    
    if !engine.is_available() {
        return Err(napi::Error::from_reason(
            "Call graph database is empty. Run build_call_graph() first."
        ));
    }
    
    let rust_options = ReachabilityOptions {
        max_depth: options.max_depth.map(|d| d as u32),
        sensitive_only: options.sensitive_only.unwrap_or(false),
        tables: options.tables.unwrap_or_default(),
        include_unresolved: options.include_unresolved.unwrap_or(false),
    };
    
    let result = engine.get_reachable_data_from_function(&function_id, &rust_options);
    
    // Convert result to JS types
    Ok(JsReachabilityResult {
        origin: JsCodeLocation {
            file: result.origin.file,
            line: result.origin.line as i64,
            column: result.origin.column.map(|c| c as i64),
            function_id: result.origin.function_id,
        },
        reachable_access: result.reachable_access.into_iter().map(|a| JsReachableDataAccess {
            table: a.access.table,
            operation: match a.access.operation {
                ReachDataOperation::Read => "read".to_string(),
                ReachDataOperation::Write => "write".to_string(),
                ReachDataOperation::Delete => "delete".to_string(),
            },
            fields: a.access.fields,
            file: a.access.file,
            line: a.access.line as i64,
            confidence: a.access.confidence as f64,
            framework: a.access.framework,
            path: a.path.into_iter().map(|p| JsCallPathNode {
                function_id: p.function_id,
                function_name: p.function_name,
                file: p.file,
                line: p.line as i64,
            }).collect(),
            depth: a.depth as i64,
        }).collect(),
        tables: result.tables,
        sensitive_fields: result.sensitive_fields.into_iter().map(|s| JsSensitiveFieldAccess {
            field: s.field.field,
            table: s.field.table,
            sensitivity_type: format!("{:?}", s.field.sensitivity_type).to_lowercase(),
            file: s.field.file,
            line: s.field.line as i64,
            confidence: s.field.confidence as f64,
            paths: s.paths.into_iter().map(|path| {
                path.into_iter().map(|p| JsCallPathNode {
                    function_id: p.function_id,
                    function_name: p.function_name,
                    file: p.file,
                    line: p.line as i64,
                }).collect()
            }).collect(),
            access_count: s.access_count as i64,
        }).collect(),
        max_depth: result.max_depth as i64,
        functions_traversed: result.functions_traversed as i64,
    })
}

/// Analyze inverse reachability using SQLite storage - who can access this data?
/// 
/// This queries the SQLite call graph database directly, avoiding the need
/// to load the entire call graph into memory. Recommended for large codebases.
/// 
/// Requires: Call graph must be built first using build_call_graph()
#[napi]
pub fn analyze_inverse_reachability_sqlite(
    root_dir: String,
    table: String,
    field: Option<String>,
    max_depth: Option<i64>,
) -> Result<JsInverseReachabilityResult> {
    let root = PathBuf::from(&root_dir);
    
    let engine = SqliteReachabilityEngine::from_project_root(&root)
        .map_err(|e| napi::Error::from_reason(format!("Failed to open call graph database: {}. Run build_call_graph() first.", e)))?;
    
    if !engine.is_available() {
        return Err(napi::Error::from_reason(
            "Call graph database is empty. Run build_call_graph() first."
        ));
    }
    
    let options = InverseReachabilityOptions {
        table: table.clone(),
        field: field.clone(),
        max_depth: max_depth.map(|d| d as u32),
    };
    
    let result = engine.get_code_paths_to_data(&options);
    
    // Convert result to JS types
    Ok(JsInverseReachabilityResult {
        target_table: result.target.table,
        target_field: result.target.field,
        access_paths: result.access_paths.into_iter().map(|a| JsInverseAccessPath {
            entry_point: a.entry_point,
            path: a.path.into_iter().map(|p| JsCallPathNode {
                function_id: p.function_id,
                function_name: p.function_name,
                file: p.file,
                line: p.line as i64,
            }).collect(),
            access_table: a.access_point.table,
            access_operation: match a.access_point.operation {
                ReachDataOperation::Read => "read".to_string(),
                ReachDataOperation::Write => "write".to_string(),
                ReachDataOperation::Delete => "delete".to_string(),
            },
            access_fields: a.access_point.fields,
            access_file: a.access_point.file,
            access_line: a.access_point.line as i64,
        }).collect(),
        entry_points: result.entry_points,
        total_accessors: result.total_accessors as i64,
    })
}

/// Check if SQLite call graph database exists and has data
#[napi]
pub fn is_call_graph_available(root_dir: String) -> bool {
    let root = PathBuf::from(&root_dir);
    SqliteReachabilityEngine::from_project_root(&root)
        .map(|e| e.is_available())
        .unwrap_or(false)
}

/// Call graph stats from SQLite database
#[napi(object)]
pub struct JsCallGraphStats {
    pub total_functions: i64,
    pub total_calls: i64,
    pub resolved_calls: i64,
    pub entry_points: i64,
    pub data_accessors: i64,
}

/// Get call graph statistics from SQLite database
#[napi]
pub fn get_call_graph_stats(root_dir: String) -> Result<JsCallGraphStats> {
    use drift_core::call_graph::CallGraphDb;
    
    let root = PathBuf::from(&root_dir);
    let db_path = root
        .join(".drift")
        .join("lake")
        .join("callgraph")
        .join("callgraph.db");
    
    let db = CallGraphDb::open_readonly(&db_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to open call graph database: {}", e)))?;
    
    let stats = db.get_stats()
        .map_err(|e| napi::Error::from_reason(format!("Failed to get stats: {}", e)))?;
    
    Ok(JsCallGraphStats {
        total_functions: stats.total_functions as i64,
        total_calls: stats.total_calls as i64,
        resolved_calls: stats.resolved_calls as i64,
        entry_points: stats.entry_points as i64,
        data_accessors: stats.data_accessors as i64,
    })
}

/// Entry point info from SQLite database
#[napi(object)]
pub struct JsEntryPointInfo {
    pub id: String,
    pub name: String,
    pub file: String,
    pub line: i64,
}

/// Get all entry points from SQLite call graph
#[napi]
pub fn get_call_graph_entry_points(root_dir: String) -> Result<Vec<JsEntryPointInfo>> {
    use drift_core::call_graph::CallGraphDb;
    
    let root = PathBuf::from(&root_dir);
    let db_path = root
        .join(".drift")
        .join("lake")
        .join("callgraph")
        .join("callgraph.db");
    
    let db = CallGraphDb::open_readonly(&db_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to open call graph database: {}", e)))?;
    
    let entry_point_ids = db.get_entry_points()
        .map_err(|e| napi::Error::from_reason(format!("Failed to get entry points: {}", e)))?;
    
    let mut result = Vec::new();
    for id in entry_point_ids {
        if let Ok(Some(func)) = db.get_function(&id) {
            // Extract file from function ID (format: "file:name:line")
            let file = id.rsplit(':').nth(2).unwrap_or(&id).to_string();
            result.push(JsEntryPointInfo {
                id: func.id,
                name: func.name,
                file,
                line: func.start_line as i64,
            });
        }
    }
    
    Ok(result)
}

/// Data accessor info from SQLite database
#[napi(object)]
pub struct JsDataAccessorInfo {
    pub id: String,
    pub name: String,
    pub file: String,
    pub line: i64,
    pub tables: Vec<String>,
}

/// Get all data accessors from SQLite call graph
#[napi]
pub fn get_call_graph_data_accessors(root_dir: String) -> Result<Vec<JsDataAccessorInfo>> {
    use drift_core::call_graph::CallGraphDb;
    
    let root = PathBuf::from(&root_dir);
    let db_path = root
        .join(".drift")
        .join("lake")
        .join("callgraph")
        .join("callgraph.db");
    
    let db = CallGraphDb::open_readonly(&db_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to open call graph database: {}", e)))?;
    
    let accessor_ids = db.get_data_accessors()
        .map_err(|e| napi::Error::from_reason(format!("Failed to get data accessors: {}", e)))?;
    
    let mut result = Vec::new();
    for id in accessor_ids {
        if let Ok(Some(func)) = db.get_function(&id) {
            // Extract file from function ID (format: "file:name:line")
            let file = id.rsplit(':').nth(2).unwrap_or(&id).to_string();
            let tables: Vec<String> = func.data_access.iter()
                .map(|da| da.table.clone())
                .collect::<std::collections::HashSet<_>>()
                .into_iter()
                .collect();
            
            result.push(JsDataAccessorInfo {
                id: func.id,
                name: func.name,
                file,
                line: func.start_line as i64,
                tables,
            });
        }
    }
    
    Ok(result)
}

/// Caller info returned from call graph queries
#[napi(object)]
pub struct JsCallerInfo {
    pub caller_id: String,
    pub caller_name: String,
    pub caller_file: String,
    pub line: i64,
}

/// Get all callers of a function from SQLite call graph
/// 
/// This queries the calls table to find all functions that call the target.
/// The target can be either a function ID (file:name:line) or just a function name.
#[napi]
pub fn get_call_graph_callers(root_dir: String, target: String) -> Result<Vec<JsCallerInfo>> {
    use drift_core::call_graph::CallGraphDb;
    
    let root = PathBuf::from(&root_dir);
    let db_path = root
        .join(".drift")
        .join("lake")
        .join("callgraph")
        .join("callgraph.db");
    
    let db = CallGraphDb::open_readonly(&db_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to open call graph database: {}", e)))?;
    
    // Try to get callers by resolved ID first, then by name
    let caller_ids = if target.contains(':') {
        // Looks like a function ID (file:name:line)
        db.get_callers(&target)
            .map_err(|e| napi::Error::from_reason(format!("Failed to get callers: {}", e)))?
    } else {
        // Just a function name
        db.get_callers_by_name(&target)
            .map_err(|e| napi::Error::from_reason(format!("Failed to get callers by name: {}", e)))?
    };
    
    let mut result = Vec::new();
    for caller_id in caller_ids {
        if let Ok(Some(func)) = db.get_function(&caller_id) {
            // Extract file from function ID (format: "file:name:line")
            let file = caller_id.rsplit(':').nth(2).unwrap_or(&caller_id).to_string();
            
            result.push(JsCallerInfo {
                caller_id: func.id,
                caller_name: func.name,
                caller_file: file,
                line: func.start_line as i64,
            });
        }
    }
    
    Ok(result)
}

/// Get all callers for all functions in a file from SQLite call graph
/// 
/// This is more efficient than calling get_call_graph_callers for each function
/// when analyzing impact of a file change.
#[napi]
pub fn get_call_graph_file_callers(root_dir: String, file_path: String) -> Result<Vec<JsCallerInfo>> {
    use drift_core::call_graph::CallGraphDb;
    
    let root = PathBuf::from(&root_dir);
    let db_path = root
        .join(".drift")
        .join("lake")
        .join("callgraph")
        .join("callgraph.db");
    
    let db = CallGraphDb::open_readonly(&db_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to open call graph database: {}", e)))?;
    
    // Get all function IDs in the file
    let function_ids = db.get_functions_in_file(&file_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to get functions in file: {}", e)))?;
    
    let mut all_callers = std::collections::HashSet::new();
    
    // Get callers for each function
    for func_id in &function_ids {
        if let Ok(callers) = db.get_callers(func_id) {
            for caller_id in callers {
                // Don't include callers from the same file (internal calls)
                if !caller_id.starts_with(&file_path) {
                    all_callers.insert(caller_id);
                }
            }
        }
    }
    
    let mut result = Vec::new();
    for caller_id in all_callers {
        if let Ok(Some(func)) = db.get_function(&caller_id) {
            let file = caller_id.rsplit(':').nth(2).unwrap_or(&caller_id).to_string();
            
            result.push(JsCallerInfo {
                caller_id: func.id,
                caller_name: func.name,
                caller_file: file,
                line: func.start_line as i64,
            });
        }
    }
    
    Ok(result)
}


// ============================================================================
// Unified Analyzer Types
// ============================================================================

/// Detected pattern exposed to JavaScript
#[napi(object)]
pub struct JsDetectedPattern {
    pub category: String,
    pub pattern_type: String,
    pub subcategory: Option<String>,
    pub file: String,
    pub line: i64,
    pub column: i64,
    pub end_line: i64,
    pub end_column: i64,
    pub matched_text: String,
    pub confidence: f64,
    pub detection_method: String,
}

/// File patterns exposed to JavaScript
#[napi(object)]
pub struct JsFilePatterns {
    pub file: String,
    pub language: String,
    pub patterns: Vec<JsDetectedPattern>,
    pub parse_time_us: i64,
    pub detect_time_us: i64,
}

/// Resolution stats exposed to JavaScript
#[napi(object)]
pub struct JsResolutionStats {
    pub total_calls: i64,
    pub resolved_calls: i64,
    pub resolution_rate: f64,
    pub same_file_resolutions: i64,
    pub cross_file_resolutions: i64,
    pub unresolved_calls: i64,
}

/// Call graph summary exposed to JavaScript
#[napi(object)]
pub struct JsCallGraphSummary {
    pub total_functions: i64,
    pub entry_points: i64,
    pub data_accessors: i64,
    pub max_call_depth: i64,
}

/// Analysis metrics exposed to JavaScript
#[napi(object)]
pub struct JsAnalysisMetrics {
    pub files_processed: i64,
    pub total_lines: i64,
    pub parse_time_ms: i64,
    pub detect_time_ms: i64,
    pub resolve_time_ms: i64,
    pub total_time_ms: i64,
}

/// Unified analysis result exposed to JavaScript
#[napi(object)]
pub struct JsUnifiedResult {
    pub file_patterns: Vec<JsFilePatterns>,
    pub resolution: JsResolutionStats,
    pub call_graph: JsCallGraphSummary,
    pub metrics: JsAnalysisMetrics,
    pub total_patterns: i64,
    pub total_violations: i64,
}

/// Unified analysis options from JavaScript
#[napi(object)]
pub struct JsUnifiedOptions {
    pub patterns: Vec<String>,
    pub categories: Option<Vec<String>>,
    pub max_resolution_depth: Option<i64>,
    pub parallel: Option<bool>,
    pub threads: Option<i64>,
}

// ============================================================================
// Unified Analyzer Functions
// ============================================================================

/// Analyze a codebase with unified pattern detection and resolution
/// 
/// This is the main entry point for AST-first pattern detection.
/// Combines pattern detection and call resolution in a single pass.
#[napi]
pub fn analyze_unified(root: String, options: JsUnifiedOptions) -> Result<JsUnifiedResult> {
    use drift_core::unified::{UnifiedAnalyzer, UnifiedOptions, PatternCategory, DetectionMethod};
    
    // Convert categories from strings
    let categories: Vec<PatternCategory> = options.categories
        .unwrap_or_default()
        .into_iter()
        .filter_map(|s| match s.to_lowercase().as_str() {
            "api" => Some(PatternCategory::Api),
            "auth" => Some(PatternCategory::Auth),
            "components" => Some(PatternCategory::Components),
            "config" => Some(PatternCategory::Config),
            "data-access" | "dataaccess" => Some(PatternCategory::DataAccess),
            "documentation" => Some(PatternCategory::Documentation),
            "errors" => Some(PatternCategory::Errors),
            "logging" => Some(PatternCategory::Logging),
            "performance" => Some(PatternCategory::Performance),
            "security" => Some(PatternCategory::Security),
            "structural" => Some(PatternCategory::Structural),
            "styling" => Some(PatternCategory::Styling),
            "testing" => Some(PatternCategory::Testing),
            "types" => Some(PatternCategory::Types),
            "validation" => Some(PatternCategory::Validation),
            _ => None,
        })
        .collect();
    
    let rust_options = UnifiedOptions {
        patterns: options.patterns,
        categories,
        max_resolution_depth: options.max_resolution_depth.unwrap_or(10) as u32,
        parallel: options.parallel.unwrap_or(true),
        threads: options.threads.unwrap_or(0) as usize,
        include_violations: false,
    };
    
    let mut analyzer = UnifiedAnalyzer::new()
        .map_err(|e| napi::Error::from_reason(e))?;
    
    let result = analyzer.analyze(std::path::Path::new(&root), rust_options);
    
    Ok(JsUnifiedResult {
        file_patterns: result.file_patterns.into_iter().map(|fp| JsFilePatterns {
            file: fp.file,
            language: format!("{:?}", fp.language).to_lowercase(),
            patterns: fp.patterns.into_iter().map(|p| JsDetectedPattern {
                category: format!("{:?}", p.category).to_lowercase(),
                pattern_type: p.pattern_type,
                subcategory: p.subcategory,
                file: p.file,
                line: p.line as i64,
                column: p.column as i64,
                end_line: p.end_line as i64,
                end_column: p.end_column as i64,
                matched_text: p.matched_text,
                confidence: p.confidence as f64,
                detection_method: match p.detection_method {
                    DetectionMethod::AstQuery => "ast".to_string(),
                    DetectionMethod::RegexFallback => "regex".to_string(),
                    DetectionMethod::Structural => "structural".to_string(),
                },
            }).collect(),
            parse_time_us: fp.parse_time_us as i64,
            detect_time_us: fp.detect_time_us as i64,
        }).collect(),
        resolution: JsResolutionStats {
            total_calls: result.resolution.total_calls as i64,
            resolved_calls: result.resolution.resolved_calls as i64,
            resolution_rate: result.resolution.resolution_rate as f64,
            same_file_resolutions: result.resolution.same_file_resolutions as i64,
            cross_file_resolutions: result.resolution.cross_file_resolutions as i64,
            unresolved_calls: result.resolution.unresolved_calls as i64,
        },
        call_graph: JsCallGraphSummary {
            total_functions: result.call_graph.total_functions as i64,
            entry_points: result.call_graph.entry_points as i64,
            data_accessors: result.call_graph.data_accessors as i64,
            max_call_depth: result.call_graph.max_call_depth as i64,
        },
        metrics: JsAnalysisMetrics {
            files_processed: result.metrics.files_processed as i64,
            total_lines: result.metrics.total_lines as i64,
            parse_time_ms: result.metrics.parse_time_ms as i64,
            detect_time_ms: result.metrics.detect_time_ms as i64,
            resolve_time_ms: result.metrics.resolve_time_ms as i64,
            total_time_ms: result.metrics.total_time_ms as i64,
        },
        total_patterns: result.total_patterns as i64,
        total_violations: result.total_violations as i64,
    })
}

// ============================================================================
// Constants Analysis Types
// ============================================================================

/// Constant info exposed to JavaScript
#[napi(object)]
pub struct JsConstantInfo {
    pub name: String,
    pub value: String,
    pub value_type: String,
    pub category: String,
    pub file: String,
    pub line: i64,
    pub is_exported: bool,
    pub language: String,
    pub declaration_type: String,
}

/// Secret candidate exposed to JavaScript
#[napi(object)]
pub struct JsSecretCandidate {
    pub name: String,
    pub masked_value: String,
    pub secret_type: String,
    pub severity: String,
    pub file: String,
    pub line: i64,
    pub confidence: f64,
    pub reason: String,
}

/// Magic number exposed to JavaScript
#[napi(object)]
pub struct JsMagicNumber {
    pub value: f64,
    pub file: String,
    pub line: i64,
    pub context: String,
    pub suggested_name: Option<String>,
}

/// Value location exposed to JavaScript
#[napi(object)]
pub struct JsValueLocation {
    pub value: String,
    pub file: String,
    pub line: i64,
}

/// Value inconsistency exposed to JavaScript
#[napi(object)]
pub struct JsValueInconsistency {
    pub name_pattern: String,
    pub values: Vec<JsValueLocation>,
    pub severity: String,
}

/// Constants stats exposed to JavaScript
#[napi(object)]
pub struct JsConstantsStats {
    pub total_constants: i64,
    pub by_category: Vec<JsCategoryCount>,
    pub by_language: Vec<JsLanguageCount>,
    pub exported_count: i64,
    pub secrets_count: i64,
    pub magic_numbers_count: i64,
    pub files_analyzed: i64,
    pub duration_ms: i64,
}

#[napi(object)]
pub struct JsCategoryCount {
    pub category: String,
    pub count: i64,
}

/// Constants analysis result exposed to JavaScript
#[napi(object)]
pub struct JsConstantsResult {
    pub constants: Vec<JsConstantInfo>,
    pub secrets: Vec<JsSecretCandidate>,
    pub magic_numbers: Vec<JsMagicNumber>,
    pub inconsistencies: Vec<JsValueInconsistency>,
    pub stats: JsConstantsStats,
}

// ============================================================================
// Constants Analysis Functions
// ============================================================================

/// Analyze files for constants, secrets, and magic numbers
#[napi]
pub fn analyze_constants(files: Vec<String>) -> Result<JsConstantsResult> {
    use drift_core::constants::{ConstantsAnalyzer, ConstantValue, SecretSeverity};
    
    let analyzer = ConstantsAnalyzer::new();
    let result = analyzer.analyze(&files);
    
    let value_to_string = |v: &ConstantValue| -> String {
        match v {
            ConstantValue::String(s) => s.clone(),
            ConstantValue::Number(n) => n.to_string(),
            ConstantValue::Boolean(b) => b.to_string(),
            ConstantValue::Array(_) => "[array]".to_string(),
            ConstantValue::Object(s) => s.clone(),
            ConstantValue::Unknown => "[unknown]".to_string(),
        }
    };
    
    let value_type = |v: &ConstantValue| -> String {
        match v {
            ConstantValue::String(_) => "string".to_string(),
            ConstantValue::Number(_) => "number".to_string(),
            ConstantValue::Boolean(_) => "boolean".to_string(),
            ConstantValue::Array(_) => "array".to_string(),
            ConstantValue::Object(_) => "object".to_string(),
            ConstantValue::Unknown => "unknown".to_string(),
        }
    };
    
    Ok(JsConstantsResult {
        constants: result.constants.into_iter().map(|c| JsConstantInfo {
            name: c.name,
            value: value_to_string(&c.value),
            value_type: value_type(&c.value),
            category: format!("{:?}", c.category).to_lowercase(),
            file: c.file,
            line: c.line as i64,
            is_exported: c.is_exported,
            language: c.language,
            declaration_type: c.declaration_type,
        }).collect(),
        secrets: result.secrets.into_iter().map(|s| JsSecretCandidate {
            name: s.name,
            masked_value: s.masked_value,
            secret_type: s.secret_type,
            severity: match s.severity {
                SecretSeverity::Critical => "critical".to_string(),
                SecretSeverity::High => "high".to_string(),
                SecretSeverity::Medium => "medium".to_string(),
                SecretSeverity::Low => "low".to_string(),
                SecretSeverity::Info => "info".to_string(),
            },
            file: s.file,
            line: s.line as i64,
            confidence: s.confidence as f64,
            reason: s.reason,
        }).collect(),
        magic_numbers: result.magic_numbers.into_iter().map(|m| JsMagicNumber {
            value: m.value,
            file: m.file,
            line: m.line as i64,
            context: m.context,
            suggested_name: m.suggested_name,
        }).collect(),
        inconsistencies: result.inconsistencies.into_iter().map(|i| JsValueInconsistency {
            name_pattern: i.name_pattern,
            values: i.values.into_iter().map(|v| JsValueLocation {
                value: value_to_string(&v.value),
                file: v.file,
                line: v.line as i64,
            }).collect(),
            severity: match i.severity {
                SecretSeverity::Critical => "critical".to_string(),
                SecretSeverity::High => "high".to_string(),
                SecretSeverity::Medium => "medium".to_string(),
                SecretSeverity::Low => "low".to_string(),
                SecretSeverity::Info => "info".to_string(),
            },
        }).collect(),
        stats: JsConstantsStats {
            total_constants: result.stats.total_constants as i64,
            by_category: result.stats.by_category.into_iter().map(|(k, v)| JsCategoryCount {
                category: k,
                count: v as i64,
            }).collect(),
            by_language: result.stats.by_language.into_iter().map(|(k, v)| JsLanguageCount {
                language: k,
                count: v as i64,
            }).collect(),
            exported_count: result.stats.exported_count as i64,
            secrets_count: result.stats.secrets_count as i64,
            magic_numbers_count: result.stats.magic_numbers_count as i64,
            files_analyzed: result.stats.files_analyzed as i64,
            duration_ms: result.stats.duration_ms as i64,
        },
    })
}

// ============================================================================
// Environment Analysis Types
// ============================================================================

/// Env access exposed to JavaScript
#[napi(object)]
pub struct JsEnvAccess {
    pub name: String,
    pub file: String,
    pub line: i64,
    pub has_default: bool,
    pub default_value: Option<String>,
    pub access_method: String,
    pub language: String,
}

/// Env variable exposed to JavaScript
#[napi(object)]
pub struct JsEnvVariable {
    pub name: String,
    pub sensitivity: String,
    pub accesses: Vec<JsEnvAccessLocation>,
    pub is_required: bool,
    pub default_values: Vec<String>,
    pub access_count: i64,
}

/// Env access location exposed to JavaScript
#[napi(object)]
pub struct JsEnvAccessLocation {
    pub file: String,
    pub line: i64,
    pub has_default: bool,
}

/// Environment stats exposed to JavaScript
#[napi(object)]
pub struct JsEnvironmentStats {
    pub total_accesses: i64,
    pub unique_variables: i64,
    pub required_count: i64,
    pub secrets_count: i64,
    pub credentials_count: i64,
    pub config_count: i64,
    pub by_language: Vec<JsLanguageCount>,
    pub files_analyzed: i64,
    pub duration_ms: i64,
}

#[napi(object)]
pub struct JsLanguageCount {
    pub language: String,
    pub count: i64,
}

/// Environment analysis result exposed to JavaScript
#[napi(object)]
pub struct JsEnvironmentResult {
    pub accesses: Vec<JsEnvAccess>,
    pub variables: Vec<JsEnvVariable>,
    pub required: Vec<JsEnvVariable>,
    pub secrets: Vec<JsEnvVariable>,
    pub stats: JsEnvironmentStats,
}

// ============================================================================
// Environment Analysis Functions
// ============================================================================

/// Analyze files for environment variable usage
#[napi]
pub fn analyze_environment(files: Vec<String>) -> Result<JsEnvironmentResult> {
    use drift_core::environment::{EnvironmentAnalyzer, EnvSensitivity};
    
    let analyzer = EnvironmentAnalyzer::new();
    let result = analyzer.analyze(&files);
    
    let convert_variable = |v: drift_core::environment::EnvVariable| -> JsEnvVariable {
        JsEnvVariable {
            name: v.name,
            sensitivity: match v.sensitivity {
                EnvSensitivity::Secret => "secret".to_string(),
                EnvSensitivity::Credential => "credential".to_string(),
                EnvSensitivity::Config => "config".to_string(),
                EnvSensitivity::Unknown => "unknown".to_string(),
            },
            accesses: v.accesses.into_iter().map(|a| JsEnvAccessLocation {
                file: a.file,
                line: a.line as i64,
                has_default: a.has_default,
            }).collect(),
            is_required: v.is_required,
            default_values: v.default_values,
            access_count: v.access_count as i64,
        }
    };
    
    Ok(JsEnvironmentResult {
        accesses: result.accesses.into_iter().map(|a| JsEnvAccess {
            name: a.name,
            file: a.file,
            line: a.line as i64,
            has_default: a.has_default,
            default_value: a.default_value,
            access_method: a.access_pattern,
            language: a.language,
        }).collect(),
        variables: result.variables.into_iter().map(convert_variable).collect(),
        required: result.required.into_iter().map(convert_variable).collect(),
        secrets: result.secrets.into_iter().map(convert_variable).collect(),
        stats: JsEnvironmentStats {
            total_accesses: result.stats.total_accesses as i64,
            unique_variables: result.stats.unique_variables as i64,
            required_count: result.stats.required_count as i64,
            secrets_count: result.stats.secrets_count as i64,
            credentials_count: result.stats.credentials_count as i64,
            config_count: result.stats.config_count as i64,
            by_language: result.stats.by_language.into_iter().map(|(k, v)| JsLanguageCount {
                language: k,
                count: v as i64,
            }).collect(),
            files_analyzed: result.stats.files_analyzed as i64,
            duration_ms: result.stats.duration_ms as i64,
        },
    })
}

// ============================================================================
// Wrappers Analysis Types
// ============================================================================

/// Wrapper info exposed to JavaScript
#[napi(object)]
pub struct JsWrapperInfo {
    pub name: String,
    pub file: String,
    pub line: i64,
    pub wraps: Vec<String>,
    pub category: String,
    pub is_exported: bool,
    pub usage_count: i64,
    pub confidence: f64,
}

/// Wrapper cluster exposed to JavaScript
#[napi(object)]
pub struct JsWrapperCluster {
    pub id: String,
    pub category: String,
    pub wrapped_primitive: String,
    pub wrappers: Vec<JsWrapperInfo>,
    pub confidence: f64,
    pub total_usage: i64,
}

/// Wrappers stats exposed to JavaScript
#[napi(object)]
pub struct JsWrappersStats {
    pub total_wrappers: i64,
    pub cluster_count: i64,
    pub by_category: Vec<JsCategoryCount>,
    pub top_primitives: Vec<JsPrimitiveCount>,
    pub files_analyzed: i64,
    pub duration_ms: i64,
}

#[napi(object)]
pub struct JsPrimitiveCount {
    pub primitive: String,
    pub count: i64,
}

/// Wrappers analysis result exposed to JavaScript
#[napi(object)]
pub struct JsWrappersResult {
    pub wrappers: Vec<JsWrapperInfo>,
    pub clusters: Vec<JsWrapperCluster>,
    pub stats: JsWrappersStats,
}

// ============================================================================
// Wrappers Analysis Functions
// ============================================================================

/// Analyze files for wrapper patterns
#[napi]
pub fn analyze_wrappers(files: Vec<String>) -> Result<JsWrappersResult> {
    use drift_core::wrappers::WrappersAnalyzer;
    
    let analyzer = WrappersAnalyzer::new();
    let result = analyzer.analyze(&files);
    
    let convert_wrapper = |w: drift_core::wrappers::WrapperInfo| -> JsWrapperInfo {
        JsWrapperInfo {
            name: w.name,
            file: w.file,
            line: w.line as i64,
            wraps: w.wraps,
            category: format!("{:?}", w.category).to_lowercase(),
            is_exported: w.is_exported,
            usage_count: w.usage_count as i64,
            confidence: w.confidence as f64,
        }
    };
    
    Ok(JsWrappersResult {
        wrappers: result.wrappers.iter().cloned().map(convert_wrapper).collect(),
        clusters: result.clusters.into_iter().map(|c| JsWrapperCluster {
            id: c.id,
            category: format!("{:?}", c.category).to_lowercase(),
            wrapped_primitive: c.wrapped_primitive,
            wrappers: c.wrappers.into_iter().map(convert_wrapper).collect(),
            confidence: c.confidence as f64,
            total_usage: c.total_usage as i64,
        }).collect(),
        stats: JsWrappersStats {
            total_wrappers: result.stats.total_wrappers as i64,
            cluster_count: result.stats.cluster_count as i64,
            by_category: result.stats.by_category.into_iter().map(|(k, v)| JsCategoryCount {
                category: k,
                count: v as i64,
            }).collect(),
            top_primitives: result.stats.top_primitives.into_iter().map(|(p, c)| JsPrimitiveCount {
                primitive: p,
                count: c as i64,
            }).collect(),
            files_analyzed: result.stats.files_analyzed as i64,
            duration_ms: result.stats.duration_ms as i64,
        },
    })
}
