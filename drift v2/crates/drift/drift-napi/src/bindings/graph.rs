//! NAPI bindings for all 5 graph intelligence systems.
//!
//! Exposes reachability, taint, error handling, impact, and test topology
//! analysis functions to TypeScript/JavaScript.

#[allow(unused_imports)]
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::{Deserialize, Serialize};

use crate::conversions::error_codes;
use crate::runtime;

fn storage_err(e: impl std::fmt::Display) -> napi::Error {
    napi::Error::from_reason(format!("[{}] {e}", error_codes::STORAGE_ERROR))
}

// --- Reachability ---

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsReachabilityResult {
    pub source: String,
    pub reachable_count: u32,
    pub sensitivity: String,
    pub max_depth: u32,
    pub engine: String,
}

#[napi]
pub fn drift_reachability(
    function_key: String,
    direction: String,
) -> napi::Result<JsReachabilityResult> {
    let rt = runtime::get()?;

    let cached = rt.storage.with_reader(|conn| {
        drift_storage::queries::graph::get_reachability(conn, &function_key, &direction)
    }).map_err(storage_err)?;

    if let Some(row) = cached {
        let reachable: Vec<String> = serde_json::from_str(&row.reachable_set).unwrap_or_default();
        Ok(JsReachabilityResult {
            source: function_key,
            reachable_count: reachable.len() as u32,
            sensitivity: row.sensitivity,
            max_depth: 0,
            engine: "petgraph".to_string(),
        })
    } else {
        Ok(JsReachabilityResult {
            source: function_key,
            reachable_count: 0,
            sensitivity: "low".to_string(),
            max_depth: 0,
            engine: "petgraph".to_string(),
        })
    }
}

// --- Taint Analysis ---

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsTaintFlow {
    pub source_file: String,
    pub source_line: u32,
    pub source_type: String,
    pub sink_file: String,
    pub sink_line: u32,
    pub sink_type: String,
    pub cwe_id: Option<u32>,
    pub is_sanitized: bool,
    pub confidence: f64,
    pub path_length: u32,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsTaintResult {
    pub flows: Vec<JsTaintFlow>,
    pub vulnerability_count: u32,
    pub source_count: u32,
    pub sink_count: u32,
}

#[napi]
pub fn drift_taint_analysis(_root: String) -> napi::Result<JsTaintResult> {
    let rt = runtime::get()?;

    // Query all taint flows from the DB (they're stored per-file, so we scan root-relative files)
    // For now, query a broad set — the taint_flows table stores all discovered flows
    let flows = rt.storage.with_reader(|conn| {
        conn.prepare_cached(
            "SELECT id, source_file, source_line, source_type, sink_file, sink_line, sink_type, cwe_id, is_sanitized, path, confidence
             FROM taint_flows ORDER BY confidence DESC LIMIT 1000"
        )
        .map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| {
                Ok(drift_storage::queries::graph::TaintFlowRow {
                    id: row.get(0)?,
                    source_file: row.get(1)?,
                    source_line: row.get::<_, u32>(2)?,
                    source_type: row.get(3)?,
                    sink_file: row.get(4)?,
                    sink_line: row.get::<_, u32>(5)?,
                    sink_type: row.get(6)?,
                    cwe_id: row.get(7)?,
                    is_sanitized: row.get::<_, i32>(8)? != 0,
                    path: row.get(9)?,
                    confidence: row.get(10)?,
                })
            }).map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })?;
            let mut result = Vec::new();
            for row in rows {
                result.push(row.map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })?);
            }
            Ok(result)
        })
    }).map_err(storage_err)?;

    let vulnerability_count = flows.iter().filter(|f| !f.is_sanitized).count() as u32;
    let js_flows: Vec<JsTaintFlow> = flows.iter().map(|f| {
        let path_nodes: Vec<String> = serde_json::from_str(&f.path).unwrap_or_default();
        JsTaintFlow {
            source_file: f.source_file.clone(),
            source_line: f.source_line,
            source_type: f.source_type.clone(),
            sink_file: f.sink_file.clone(),
            sink_line: f.sink_line,
            sink_type: f.sink_type.clone(),
            cwe_id: f.cwe_id,
            is_sanitized: f.is_sanitized,
            confidence: f.confidence,
            path_length: path_nodes.len() as u32,
        }
    }).collect();

    Ok(JsTaintResult {
        flows: js_flows,
        vulnerability_count,
        source_count: 0,
        sink_count: 0,
    })
}

// --- Error Handling ---

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsErrorGap {
    pub file: String,
    pub function_name: String,
    pub line: u32,
    pub gap_type: String,
    pub severity: String,
    pub cwe_id: Option<u32>,
    pub remediation: Option<String>,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsErrorHandlingResult {
    pub gaps: Vec<JsErrorGap>,
    pub handler_count: u32,
    pub unhandled_count: u32,
}

#[napi]
pub fn drift_error_handling(_root: String) -> napi::Result<JsErrorHandlingResult> {
    let rt = runtime::get()?;

    let gaps = rt.storage.with_reader(|conn| {
        conn.prepare_cached(
            "SELECT id, file, function_id, gap_type, error_type, propagation_chain, framework, cwe_id, severity
             FROM error_gaps ORDER BY severity DESC LIMIT 1000"
        )
        .map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| {
                Ok(drift_storage::queries::graph::ErrorGapRow {
                    id: row.get(0)?,
                    file: row.get(1)?,
                    function_id: row.get(2)?,
                    gap_type: row.get(3)?,
                    error_type: row.get(4)?,
                    propagation_chain: row.get(5)?,
                    framework: row.get(6)?,
                    cwe_id: row.get(7)?,
                    severity: row.get(8)?,
                })
            }).map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })?;
            let mut result = Vec::new();
            for row in rows {
                result.push(row.map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })?);
            }
            Ok(result)
        })
    }).map_err(storage_err)?;

    let js_gaps: Vec<JsErrorGap> = gaps.iter().map(|g| JsErrorGap {
        file: g.file.clone(),
        function_name: g.function_id.clone(),
        line: 0,
        gap_type: g.gap_type.clone(),
        severity: g.severity.clone(),
        cwe_id: g.cwe_id,
        remediation: None,
    }).collect();

    let unhandled = js_gaps.len() as u32;

    Ok(JsErrorHandlingResult {
        gaps: js_gaps,
        handler_count: 0,
        unhandled_count: unhandled,
    })
}

// --- Impact Analysis ---

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsBlastRadius {
    pub function_id: String,
    pub caller_count: u32,
    pub risk_score: f64,
    pub max_depth: u32,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsDeadCode {
    pub function_id: String,
    pub reason: String,
    pub exclusion: Option<String>,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsImpactResult {
    pub blast_radii: Vec<JsBlastRadius>,
    pub dead_code: Vec<JsDeadCode>,
}

#[napi]
pub fn drift_impact_analysis(_root: String) -> napi::Result<JsImpactResult> {
    let rt = runtime::get()?;

    let scores = rt.storage.with_reader(|conn| {
        conn.prepare_cached(
            "SELECT function_id, blast_radius, risk_score, is_dead_code, dead_code_reason, exclusion_category
             FROM impact_scores ORDER BY risk_score DESC LIMIT 1000"
        )
        .map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| {
                Ok(drift_storage::queries::graph::ImpactScoreRow {
                    function_id: row.get(0)?,
                    blast_radius: row.get::<_, u32>(1)?,
                    risk_score: row.get(2)?,
                    is_dead_code: row.get::<_, i32>(3)? != 0,
                    dead_code_reason: row.get(4)?,
                    exclusion_category: row.get(5)?,
                })
            }).map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })?;
            let mut result = Vec::new();
            for row in rows {
                result.push(row.map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })?);
            }
            Ok(result)
        })
    }).map_err(storage_err)?;

    let mut blast_radii = Vec::new();
    let mut dead_code = Vec::new();
    for s in &scores {
        if s.is_dead_code {
            dead_code.push(JsDeadCode {
                function_id: s.function_id.clone(),
                reason: s.dead_code_reason.clone().unwrap_or_default(),
                exclusion: s.exclusion_category.clone(),
            });
        }
        blast_radii.push(JsBlastRadius {
            function_id: s.function_id.clone(),
            caller_count: s.blast_radius,
            risk_score: s.risk_score,
            max_depth: 0,
        });
    }

    Ok(JsImpactResult { blast_radii, dead_code })
}

// --- Test Topology ---

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsTestQuality {
    pub coverage_breadth: f64,
    pub coverage_depth: f64,
    pub assertion_density: f64,
    pub mock_ratio: f64,
    pub isolation: f64,
    pub freshness: f64,
    pub stability: f64,
    pub overall: f64,
    pub smell_count: u32,
}

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsTestTopologyResult {
    pub quality: JsTestQuality,
    pub test_count: u32,
    pub source_count: u32,
    pub coverage_percent: f64,
    pub minimum_test_set_size: u32,
}

#[napi]
pub fn drift_test_topology(_root: String) -> napi::Result<JsTestTopologyResult> {
    let rt = runtime::get()?;

    let qualities = rt.storage.with_reader(|conn| {
        conn.prepare_cached(
            "SELECT function_id, coverage_breadth, coverage_depth, assertion_density, mock_ratio, isolation, freshness, stability, overall_score, smells
             FROM test_quality"
        )
        .map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })
        .and_then(|mut stmt| {
            let rows = stmt.query_map([], |row| {
                Ok(drift_storage::queries::graph::TestQualityRow {
                    function_id: row.get(0)?,
                    coverage_breadth: row.get(1)?,
                    coverage_depth: row.get(2)?,
                    assertion_density: row.get(3)?,
                    mock_ratio: row.get(4)?,
                    isolation: row.get(5)?,
                    freshness: row.get(6)?,
                    stability: row.get(7)?,
                    overall_score: row.get(8)?,
                    smells: row.get(9)?,
                })
            }).map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })?;
            let mut result = Vec::new();
            for row in rows {
                result.push(row.map_err(|e| drift_core::errors::StorageError::SqliteError { message: e.to_string() })?);
            }
            Ok(result)
        })
    }).map_err(storage_err)?;

    let test_count = qualities.len() as u32;
    let (avg_quality, _total_smells) = if qualities.is_empty() {
        (JsTestQuality {
            coverage_breadth: 0.0, coverage_depth: 0.0, assertion_density: 0.0,
            mock_ratio: 0.0, isolation: 1.0, freshness: 1.0, stability: 1.0,
            overall: 0.0, smell_count: 0,
        }, 0u32)
    } else {
        let n = qualities.len() as f64;
        let mut smells = 0u32;
        let mut cb = 0.0; let mut cd = 0.0; let mut ad = 0.0;
        let mut mr = 0.0; let mut iso = 0.0; let mut fr = 0.0;
        let mut st = 0.0; let mut ov = 0.0;
        for q in &qualities {
            cb += q.coverage_breadth.unwrap_or(0.0);
            cd += q.coverage_depth.unwrap_or(0.0);
            ad += q.assertion_density.unwrap_or(0.0);
            mr += q.mock_ratio.unwrap_or(0.0);
            iso += q.isolation.unwrap_or(1.0);
            fr += q.freshness.unwrap_or(1.0);
            st += q.stability.unwrap_or(1.0);
            ov += q.overall_score;
            if let Some(ref s) = q.smells {
                let arr: Vec<serde_json::Value> = serde_json::from_str(s).unwrap_or_default();
                smells += arr.len() as u32;
            }
        }
        (JsTestQuality {
            coverage_breadth: cb / n, coverage_depth: cd / n,
            assertion_density: ad / n, mock_ratio: mr / n,
            isolation: iso / n, freshness: fr / n,
            stability: st / n, overall: ov / n, smell_count: smells,
        }, smells)
    };

    let func_count = rt.storage.with_reader(|conn| {
        drift_storage::queries::functions::count_functions(conn)
    }).map_err(storage_err)? as u32;

    let coverage_percent = if func_count > 0 { (test_count as f64 / func_count as f64 * 100.0).min(100.0) } else { 0.0 };

    Ok(JsTestTopologyResult {
        quality: avg_quality,
        test_count,
        source_count: func_count,
        coverage_percent,
        minimum_test_set_size: 0,
    })
}
