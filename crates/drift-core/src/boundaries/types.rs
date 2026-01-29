//! Boundary types - Data access detection types

use serde::{Deserialize, Serialize};

/// A data access point detected in source code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataAccessPoint {
    /// Table/collection being accessed
    pub table: String,
    /// Operation type
    pub operation: DataOperation,
    /// Fields being accessed
    pub fields: Vec<String>,
    /// Source file
    pub file: String,
    /// Line number
    pub line: u32,
    /// Detection confidence (0.0-1.0)
    pub confidence: f32,
    /// Framework that was detected
    pub framework: Option<String>,
}

/// Data operation type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DataOperation {
    Read,
    Write,
    Delete,
}

/// A sensitive field detected in source code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensitiveField {
    /// Field name
    pub field: String,
    /// Table it belongs to (if known)
    pub table: Option<String>,
    /// Type of sensitivity
    pub sensitivity_type: SensitivityType,
    /// Source file
    pub file: String,
    /// Line number
    pub line: u32,
    /// Detection confidence (0.0-1.0)
    pub confidence: f32,
}

/// Type of sensitive data
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SensitivityType {
    Pii,
    Credentials,
    Financial,
    Health,
}

/// An ORM model detected in source code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ORMModel {
    /// Model/entity name
    pub name: String,
    /// Table name (may differ from model name)
    pub table_name: String,
    /// Fields in the model
    pub fields: Vec<String>,
    /// Source file
    pub file: String,
    /// Line number
    pub line: u32,
    /// ORM framework
    pub framework: String,
    /// Detection confidence
    pub confidence: f32,
}

/// Result of boundary scanning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundaryScanResult {
    /// Data access points found
    pub access_points: Vec<DataAccessPoint>,
    /// Sensitive fields found
    pub sensitive_fields: Vec<SensitiveField>,
    /// ORM models found
    pub models: Vec<ORMModel>,
    /// Files scanned
    pub files_scanned: usize,
    /// Duration in milliseconds
    pub duration_ms: u64,
}
