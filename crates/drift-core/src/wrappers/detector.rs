//! Wrapper detection using call graph analysis
//!
//! Identifies functions that wrap framework primitives by analyzing
//! the call graph and function bodies.

use std::collections::{HashMap, HashSet};
use crate::parsers::{ParseResult, Language};
use super::types::*;

/// Detects wrapper patterns in code
pub struct WrapperDetector {
    /// Known primitives by category
    primitives: HashMap<WrapperCategory, HashSet<String>>,
}

impl WrapperDetector {
    pub fn new() -> Self {
        let mut primitives: HashMap<WrapperCategory, HashSet<String>> = HashMap::new();
        
        // React state management
        primitives.insert(
            WrapperCategory::StateManagement,
            REACT_PRIMITIVES.iter()
                .filter(|p| p.starts_with("useState") || p.starts_with("useReducer"))
                .map(|s| s.to_string())
                .collect(),
        );
        
        // React side effects
        primitives.insert(
            WrapperCategory::SideEffects,
            REACT_PRIMITIVES.iter()
                .filter(|p| p.contains("Effect"))
                .map(|s| s.to_string())
                .collect(),
        );
        
        // Data fetching
        primitives.insert(
            WrapperCategory::DataFetching,
            FETCH_PRIMITIVES.iter().map(|s| s.to_string()).collect(),
        );
        
        // Validation
        primitives.insert(
            WrapperCategory::Validation,
            VALIDATION_PRIMITIVES.iter().map(|s| s.to_string()).collect(),
        );
        
        // Logging
        primitives.insert(
            WrapperCategory::Logging,
            LOGGING_PRIMITIVES.iter().map(|s| s.to_string()).collect(),
        );
        
        // Auth
        primitives.insert(
            WrapperCategory::Authentication,
            AUTH_PRIMITIVES.iter().map(|s| s.to_string()).collect(),
        );
        
        Self { primitives }
    }

    /// Detect wrappers in a parsed file
    pub fn detect(&self, result: &ParseResult, file_path: &str, source: &str) -> Vec<WrapperInfo> {
        let mut wrappers = Vec::new();
        let empty_vec: Vec<String> = Vec::new();
        
        // Build a map of function calls within each function
        let function_calls = self.extract_function_calls(result, source);
        
        for func in &result.functions {
            let calls = function_calls.get(&func.name).unwrap_or(&empty_vec);
            
            // Check if this function wraps any known primitives
            for call in calls {
                if let Some((category, primitive)) = self.find_wrapped_primitive(call) {
                    // Calculate confidence based on various factors
                    let confidence = self.calculate_confidence(&func.name, call, calls.len());
                    
                    if confidence > 0.5 {
                        wrappers.push(WrapperInfo {
                            name: func.name.clone(),
                            file: file_path.to_string(),
                            line: func.range.start.line,
                            wraps: vec![primitive],
                            category,
                            is_exported: func.is_exported,
                            usage_count: 0, // Will be filled in by analyzer
                            confidence,
                        });
                        break; // One wrapper per function
                    }
                }
            }
        }
        
        wrappers
    }

    fn extract_function_calls(&self, result: &ParseResult, _source: &str) -> HashMap<String, Vec<String>> {
        let mut calls_by_function: HashMap<String, Vec<String>> = HashMap::new();
        
        // Use the calls from parse result
        // Note: This is simplified - ideally we'd track which function each call is in
        for func in &result.functions {
            let func_calls: Vec<String> = result.calls.iter()
                .filter(|c| c.range.start.line >= func.range.start.line && 
                           c.range.start.line <= func.range.end.line)
                .map(|c| {
                    if let Some(ref receiver) = c.receiver {
                        format!("{}.{}", receiver, c.callee)
                    } else {
                        c.callee.clone()
                    }
                })
                .collect();
            
            calls_by_function.insert(func.name.clone(), func_calls);
        }
        
        calls_by_function
    }

    fn find_wrapped_primitive(&self, call: &str) -> Option<(WrapperCategory, String)> {
        for (category, primitives) in &self.primitives {
            for primitive in primitives {
                if call == primitive || call.ends_with(primitive) || call.contains(primitive) {
                    return Some((*category, primitive.clone()));
                }
            }
        }
        None
    }

    fn calculate_confidence(&self, func_name: &str, wrapped_call: &str, total_calls: usize) -> f32 {
        let mut confidence = 0.6f32; // Base confidence
        
        // Higher confidence if function name suggests wrapper
        let name_lower = func_name.to_lowercase();
        if name_lower.starts_with("use") || 
           name_lower.starts_with("with") ||
           name_lower.starts_with("create") ||
           name_lower.starts_with("make") ||
           name_lower.contains("wrapper") ||
           name_lower.contains("hook") ||
           name_lower.contains("helper") {
            confidence += 0.15;
        }
        
        // Higher confidence if it's a custom hook (useXxx pattern)
        if func_name.starts_with("use") && func_name.len() > 3 {
            let after_use = &func_name[3..];
            if after_use.chars().next().map(|c| c.is_uppercase()).unwrap_or(false) {
                confidence += 0.1;
            }
        }
        
        // Lower confidence if too many calls (might be complex function, not wrapper)
        if total_calls > 10 {
            confidence -= 0.1;
        }
        
        // Higher confidence if few calls (focused wrapper)
        if total_calls <= 3 {
            confidence += 0.1;
        }
        
        confidence.clamp(0.0, 1.0)
    }

    /// Categorize a wrapper based on what it wraps and its name
    pub fn categorize(&self, func_name: &str, wraps: &[String]) -> WrapperCategory {
        let name_lower = func_name.to_lowercase();
        
        // Check wrapped primitives first
        for wrapped in wraps {
            for (category, primitives) in &self.primitives {
                if primitives.contains(wrapped) {
                    return *category;
                }
            }
        }
        
        // Fall back to name-based categorization
        if name_lower.contains("auth") || name_lower.contains("login") || name_lower.contains("session") {
            return WrapperCategory::Authentication;
        }
        if name_lower.contains("fetch") || name_lower.contains("api") || name_lower.contains("request") {
            return WrapperCategory::DataFetching;
        }
        if name_lower.contains("valid") || name_lower.contains("schema") {
            return WrapperCategory::Validation;
        }
        if name_lower.contains("log") || name_lower.contains("trace") || name_lower.contains("debug") {
            return WrapperCategory::Logging;
        }
        if name_lower.contains("cache") || name_lower.contains("memo") {
            return WrapperCategory::Caching;
        }
        if name_lower.contains("error") || name_lower.contains("catch") || name_lower.contains("handle") {
            return WrapperCategory::ErrorHandling;
        }
        if name_lower.contains("form") || name_lower.contains("input") || name_lower.contains("field") {
            return WrapperCategory::FormHandling;
        }
        if name_lower.contains("route") || name_lower.contains("navigate") || name_lower.contains("link") {
            return WrapperCategory::Routing;
        }
        if name_lower.contains("create") || name_lower.contains("factory") || name_lower.contains("build") {
            return WrapperCategory::Factory;
        }
        
        WrapperCategory::Other
    }
}

impl Default for WrapperDetector {
    fn default() -> Self {
        Self::new()
    }
}
