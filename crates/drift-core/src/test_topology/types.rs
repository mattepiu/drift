//! Test topology types

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Test file information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestFile {
    /// Test file path
    pub path: String,
    /// Source file being tested
    pub tests_file: Option<String>,
    /// Test framework detected
    pub framework: TestFramework,
    /// Test cases in this file
    pub test_cases: Vec<TestCase>,
    /// Mocks used in this file
    pub mocks: Vec<MockUsage>,
}

/// Test framework
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TestFramework {
    Jest,
    Vitest,
    Mocha,
    Pytest,
    JUnit,
    NUnit,
    XUnit,
    PHPUnit,
    GoTest,
    RustTest,
    Catch2,
    GoogleTest,
    Unknown,
}

/// A test case
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestCase {
    /// Test name
    pub name: String,
    /// Test type
    pub test_type: TestType,
    /// Line number
    pub line: u32,
    /// Is skipped
    pub is_skipped: bool,
}

/// Test type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TestType {
    Unit,
    Integration,
    E2E,
    Unknown,
}

/// Mock usage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockUsage {
    /// What is being mocked
    pub target: String,
    /// Mock type
    pub mock_type: MockType,
    /// Line number
    pub line: u32,
}

/// Mock type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MockType {
    Function,
    Module,
    Class,
    Http,
    Database,
    Unknown,
}

/// Test coverage mapping
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestCoverage {
    /// Source file
    pub source_file: String,
    /// Test files that cover this source
    pub test_files: Vec<String>,
    /// Coverage percentage (if known)
    pub coverage_percent: Option<f32>,
    /// Risk level for uncovered code
    pub risk_level: RiskLevel,
}

/// Risk level for uncovered code
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

/// Test topology analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestTopologyResult {
    /// Test files found
    pub test_files: Vec<TestFile>,
    /// Coverage mappings
    pub coverage: Vec<TestCoverage>,
    /// Uncovered source files
    pub uncovered_files: Vec<String>,
    /// Total test count
    pub total_tests: usize,
    /// Skipped test count
    pub skipped_tests: usize,
    /// Files analyzed
    pub files_analyzed: usize,
    /// Duration in milliseconds
    pub duration_ms: u64,
}

/// Test quality metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestQualityMetrics {
    /// Test to code ratio
    pub test_ratio: f32,
    /// Mock density (mocks per test)
    pub mock_density: f32,
    /// Average test size (lines)
    pub avg_test_size: f32,
    /// Assertion density
    pub assertion_density: f32,
}
