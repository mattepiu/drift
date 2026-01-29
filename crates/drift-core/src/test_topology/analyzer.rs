//! Test topology analyzer - Maps tests to source files
//!
//! AST-first approach: Uses tree-sitter parsed data from ParserManager.
//! Regex is only used as fallback for framework-specific patterns that
//! can't be captured via AST (like decorator strings, test names in strings).

use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::Instant;

use super::types::*;
use crate::parsers::{ParserManager, ParseResult, FunctionInfo};

/// Test topology analyzer - AST-first with regex fallbacks
pub struct TestTopologyAnalyzer {
    parser: ParserManager,
    // Test file path patterns (these are path-based, not code-based)
    test_path_patterns: Vec<Regex>,
}

impl TestTopologyAnalyzer {
    pub fn new() -> Self {
        Self {
            parser: ParserManager::new(),
            // Path patterns for identifying test files
            test_path_patterns: vec![
                Regex::new(r"\.(?:test|spec)\.[jt]sx?$").unwrap(),
                Regex::new(r"__tests__/.*\.[jt]sx?$").unwrap(),
                Regex::new(r"test_.*\.py$").unwrap(),
                Regex::new(r".*_test\.py$").unwrap(),
                Regex::new(r".*Test\.java$").unwrap(),
                Regex::new(r".*Tests?\.cs$").unwrap(),
                Regex::new(r".*_test\.go$").unwrap(),
                Regex::new(r".*_test\.rs$").unwrap(),
                Regex::new(r".*Test\.php$").unwrap(),
            ],
        }
    }
    
    /// Analyze test topology using AST-parsed data
    pub fn analyze(&mut self, files: &[String]) -> TestTopologyResult {
        let start = Instant::now();
        
        let mut test_files = Vec::new();
        let mut source_files: HashSet<String> = HashSet::new();
        let mut tested_files: HashSet<String> = HashSet::new();
        
        for file in files {
            if self.is_test_file(file) {
                if let Some(test_file) = self.analyze_test_file_ast(file) {
                    if let Some(ref tested) = test_file.tests_file {
                        tested_files.insert(tested.clone());
                    }
                    test_files.push(test_file);
                }
            } else {
                source_files.insert(file.clone());
            }
        }
        
        // Find uncovered files
        let uncovered_files: Vec<String> = source_files
            .difference(&tested_files)
            .cloned()
            .collect();
        
        // Build coverage mappings
        let mut coverage_map: HashMap<String, Vec<String>> = HashMap::new();
        for test_file in &test_files {
            if let Some(ref source) = test_file.tests_file {
                coverage_map.entry(source.clone())
                    .or_default()
                    .push(test_file.path.clone());
            }
        }
        
        let coverage: Vec<TestCoverage> = coverage_map.into_iter()
            .map(|(source, tests)| TestCoverage {
                source_file: source,
                test_files: tests,
                coverage_percent: None,
                risk_level: RiskLevel::Low,
            })
            .collect();
        
        let total_tests: usize = test_files.iter()
            .map(|f| f.test_cases.len())
            .sum();
        let skipped_tests: usize = test_files.iter()
            .flat_map(|f| &f.test_cases)
            .filter(|t| t.is_skipped)
            .count();
        
        TestTopologyResult {
            test_files,
            coverage,
            uncovered_files,
            total_tests,
            skipped_tests,
            files_analyzed: files.len(),
            duration_ms: start.elapsed().as_millis() as u64,
        }
    }
    
    fn is_test_file(&self, path: &str) -> bool {
        self.test_path_patterns.iter().any(|p| p.is_match(path))
    }
    
    /// Analyze test file using AST-first approach
    fn analyze_test_file_ast(&mut self, path: &str) -> Option<TestFile> {
        let source = std::fs::read_to_string(path).ok()?;
        
        // Parse via tree-sitter AST
        let parse_result = self.parser.parse_file(path, &source)?;
        
        let framework = self.detect_framework_from_ast(&parse_result, path);
        let test_cases = self.extract_test_cases_from_ast(&parse_result, &source, framework);
        let mocks = self.extract_mocks_from_ast(&parse_result, &source, framework);
        let tests_file = self.infer_source_file(path);
        
        Some(TestFile {
            path: path.to_string(),
            tests_file,
            framework,
            test_cases,
            mocks,
        })
    }
    
    /// Detect framework from AST imports (primary) with content fallback
    fn detect_framework_from_ast(&self, result: &ParseResult, path: &str) -> TestFramework {
        // Check imports from AST - this is the primary detection method
        for import in &result.imports {
            let source = import.source.to_lowercase();
            
            // JavaScript/TypeScript frameworks
            if source.contains("vitest") {
                return TestFramework::Vitest;
            }
            if source.contains("jest") || source == "@jest/globals" {
                return TestFramework::Jest;
            }
            if source.contains("mocha") {
                return TestFramework::Mocha;
            }
            
            // Python
            if source.contains("pytest") {
                return TestFramework::Pytest;
            }
            
            // Java
            if source.contains("junit") || source.contains("org.junit") {
                return TestFramework::JUnit;
            }
            
            // C#
            if source.contains("nunit") {
                return TestFramework::NUnit;
            }
            if source.contains("xunit") {
                return TestFramework::XUnit;
            }
            
            // PHP
            if source.contains("phpunit") {
                return TestFramework::PHPUnit;
            }
        }
        
        // Fallback: detect by file extension and decorators from AST
        if path.ends_with("_test.go") {
            return TestFramework::GoTest;
        }
        if path.ends_with("_test.rs") {
            return TestFramework::RustTest;
        }
        
        // Check decorators on functions (from AST)
        for func in &result.functions {
            for decorator in &func.decorators {
                if decorator.contains("Test") || decorator.contains("test") {
                    if path.ends_with(".java") {
                        return TestFramework::JUnit;
                    }
                    if path.ends_with(".cs") {
                        return TestFramework::NUnit;
                    }
                    if path.ends_with(".py") {
                        return TestFramework::Pytest;
                    }
                }
            }
        }
        
        TestFramework::Unknown
    }
    
    /// Extract test cases from AST-parsed functions
    fn extract_test_cases_from_ast(
        &self,
        result: &ParseResult,
        source: &str,
        framework: TestFramework,
    ) -> Vec<TestCase> {
        let mut cases = Vec::new();
        
        // Use AST-parsed functions as primary source
        for func in &result.functions {
            let is_test = self.is_test_function(&func, framework);
            
            if is_test {
                let is_skipped = self.is_skipped_test(&func, source, framework);
                
                cases.push(TestCase {
                    name: func.name.clone(),
                    test_type: self.infer_test_type(&func.name),
                    line: func.range.start.line,
                    is_skipped,
                });
            }
        }
        
        // For JS/TS: Also look for it()/test() calls from AST call sites
        if matches!(framework, TestFramework::Jest | TestFramework::Vitest | TestFramework::Mocha) {
            for call in &result.calls {
                // Handle regular it()/test() calls
                if call.callee == "it" || call.callee == "test" {
                    // Extract test name from source at this line (regex fallback for string extraction)
                    if let Some(name) = self.extract_test_name_at_line(source, call.range.start.line) {
                        // Avoid duplicates
                        if !cases.iter().any(|c| c.line == call.range.start.line) {
                            cases.push(TestCase {
                                name,
                                test_type: TestType::Unit,
                                line: call.range.start.line,
                                is_skipped: false,
                            });
                        }
                    }
                }
                // Handle it.skip()/test.skip() - callee is "skip", receiver is "it" or "test"
                else if call.callee == "skip" {
                    if let Some(ref recv) = call.receiver {
                        if recv == "it" || recv == "test" {
                            // Extract test name from source at this line
                            if let Some(name) = self.extract_skipped_test_name_at_line(source, call.range.start.line) {
                                // Avoid duplicates
                                if !cases.iter().any(|c| c.line == call.range.start.line) {
                                    cases.push(TestCase {
                                        name,
                                        test_type: TestType::Unit,
                                        line: call.range.start.line,
                                        is_skipped: true,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        
        cases
    }
    
    /// Check if function is a test based on AST data
    fn is_test_function(&self, func: &FunctionInfo, framework: TestFramework) -> bool {
        match framework {
            TestFramework::Pytest => func.name.starts_with("test_"),
            TestFramework::GoTest => func.name.starts_with("Test"),
            TestFramework::RustTest => func.decorators.iter().any(|d| d == "test"),
            TestFramework::JUnit => func.decorators.iter().any(|d| d.contains("Test")),
            TestFramework::NUnit | TestFramework::XUnit => {
                func.decorators.iter().any(|d| d == "Test" || d == "Fact" || d == "Theory")
            }
            TestFramework::PHPUnit => {
                func.name.starts_with("test") || 
                func.decorators.iter().any(|d| d.contains("test"))
            }
            _ => false,
        }
    }
    
    /// Check if test is skipped (uses decorators from AST, with source fallback)
    fn is_skipped_test(&self, func: &FunctionInfo, source: &str, framework: TestFramework) -> bool {
        // Check decorators from AST first
        for decorator in &func.decorators {
            let d = decorator.to_lowercase();
            if d.contains("skip") || d.contains("ignore") || d.contains("disabled") {
                return true;
            }
        }
        
        // Fallback: check source line for skip patterns
        // line is 0-indexed from tree-sitter
        let lines: Vec<&str> = source.lines().collect();
        if let Some(line) = lines.get(func.range.start.line as usize) {
            match framework {
                TestFramework::Jest | TestFramework::Vitest => {
                    return line.contains(".skip") || line.contains("xit(") || line.contains("xtest(");
                }
                TestFramework::Pytest => {
                    return line.contains("@pytest.mark.skip");
                }
                _ => {}
            }
        }
        
        false
    }
    
    /// Extract mocks from AST call sites
    fn extract_mocks_from_ast(
        &self,
        result: &ParseResult,
        source: &str,
        framework: TestFramework,
    ) -> Vec<MockUsage> {
        let mut mocks = Vec::new();
        
        // Use AST call sites to find mock calls
        for call in &result.calls {
            let mock_type = match (framework, call.callee.as_str(), call.receiver.as_deref()) {
                // Jest: jest.mock(), jest.spyOn(), jest.fn()
                (TestFramework::Jest, "mock", Some("jest")) => Some(MockType::Module),
                (TestFramework::Jest, "spyOn", Some("jest")) => Some(MockType::Function),
                (TestFramework::Jest, "fn", Some("jest")) => Some(MockType::Function),
                
                // Vitest: vi.mock(), vi.spyOn(), vi.fn()
                (TestFramework::Vitest, "mock", Some("vi")) => Some(MockType::Module),
                (TestFramework::Vitest, "spyOn", Some("vi")) => Some(MockType::Function),
                (TestFramework::Vitest, "fn", Some("vi")) => Some(MockType::Function),
                
                // Python: Mock(), MagicMock(), patch()
                (TestFramework::Pytest, "Mock", _) => Some(MockType::Class),
                (TestFramework::Pytest, "MagicMock", _) => Some(MockType::Class),
                (TestFramework::Pytest, "patch", _) => Some(MockType::Function),
                
                _ => None,
            };
            
            if let Some(mt) = mock_type {
                // Extract target from source (regex fallback for string argument)
                let target = self.extract_mock_target_at_line(source, call.range.start.line)
                    .unwrap_or_else(|| call.callee.clone());
                
                mocks.push(MockUsage {
                    target,
                    mock_type: mt,
                    line: call.range.start.line,
                });
            }
        }
        
        mocks
    }
    
    /// Regex fallback: extract test name from string argument at line
    fn extract_test_name_at_line(&self, source: &str, line: u32) -> Option<String> {
        let lines: Vec<&str> = source.lines().collect();
        // line is 0-indexed from tree-sitter
        let line_content = lines.get(line as usize)?;
        
        // Match: it('name', ...) or test('name', ...)
        let re = Regex::new(r#"(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]"#).ok()?;
        re.captures(line_content)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
    }
    
    /// Regex fallback: extract test name from skipped test (it.skip/test.skip)
    fn extract_skipped_test_name_at_line(&self, source: &str, line: u32) -> Option<String> {
        let lines: Vec<&str> = source.lines().collect();
        // line is 0-indexed from tree-sitter
        let line_content = lines.get(line as usize)?;
        
        // Match: it.skip('name', ...) or test.skip('name', ...)
        let re = Regex::new(r#"(?:it|test)\.skip\s*\(\s*['"`]([^'"`]+)['"`]"#).ok()?;
        re.captures(line_content)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
    }
    
    /// Regex fallback: extract mock target from string argument at line
    fn extract_mock_target_at_line(&self, source: &str, line: u32) -> Option<String> {
        let lines: Vec<&str> = source.lines().collect();
        // line is 0-indexed from tree-sitter
        let line_content = lines.get(line as usize)?;
        
        // Match: mock('target') or spyOn(obj, 'method')
        let re = Regex::new(r#"(?:mock|spyOn|patch)\s*\(\s*['"`]?([^'"`),]+)"#).ok()?;
        re.captures(line_content)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim().to_string())
    }
    
    fn infer_source_file(&self, test_path: &str) -> Option<String> {
        let path = Path::new(test_path);
        let file_name = path.file_name()?.to_str()?;
        
        let source_name = file_name
            .replace(".test.", ".")
            .replace(".spec.", ".")
            .replace("_test.", ".")
            .replace("Test.", ".");
        
        let parent = path.parent()?;
        
        if parent.ends_with("__tests__") {
            let src_dir = parent.parent()?;
            return Some(src_dir.join(&source_name).to_string_lossy().to_string());
        }
        
        Some(parent.join(&source_name).to_string_lossy().to_string())
    }
    
    fn infer_test_type(&self, name: &str) -> TestType {
        let lower = name.to_lowercase();
        if lower.contains("integration") {
            TestType::Integration
        } else if lower.contains("e2e") || lower.contains("end-to-end") || lower.contains("browser") {
            TestType::E2E
        } else {
            TestType::Unit
        }
    }
}

impl Default for TestTopologyAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_is_test_file() {
        let analyzer = TestTopologyAnalyzer::new();
        
        assert!(analyzer.is_test_file("src/utils.test.ts"));
        assert!(analyzer.is_test_file("src/__tests__/utils.ts"));
        assert!(analyzer.is_test_file("test_utils.py"));
        assert!(analyzer.is_test_file("UserServiceTest.java"));
        assert!(analyzer.is_test_file("user_test.go"));
        assert!(analyzer.is_test_file("user_test.rs"));
        
        assert!(!analyzer.is_test_file("src/utils.ts"));
        assert!(!analyzer.is_test_file("main.py"));
    }
}
