//! Coupling analyzer - Analyzes module dependencies and coupling metrics
//!
//! This module is AST-first: it consumes ParseResult from the parsers module
//! which already has imports/exports extracted via tree-sitter AST parsing.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::Instant;

use super::types::*;
use crate::parsers::{ParserManager, ParseResult};

/// Coupling analyzer - uses AST-parsed data from ParserManager
pub struct CouplingAnalyzer {
    parser: ParserManager,
}

impl CouplingAnalyzer {
    pub fn new() -> Self {
        Self {
            parser: ParserManager::new(),
        }
    }
    
    /// Analyze coupling for a set of files using AST-parsed imports/exports
    pub fn analyze(&mut self, files: &[String]) -> CouplingAnalysisResult {
        let start = Instant::now();
        
        // Parse all files via tree-sitter AST
        let mut file_graphs: HashMap<String, FileGraph> = HashMap::new();
        
        for file in files {
            if let Some(graph) = self.build_file_graph_from_ast(file) {
                file_graphs.insert(file.clone(), graph);
            }
        }
        
        // Build module map (directory -> files)
        let module_map = self.build_module_map(&file_graphs);
        
        // Calculate module metrics from AST data
        let modules = self.calculate_module_metrics(&file_graphs, &module_map);
        
        // Detect cycles
        let cycles = self.detect_cycles(&file_graphs, &module_map);
        
        // Find hotspots
        let hotspots = self.find_hotspots(&modules);
        
        // Find unused exports
        let unused_exports = self.find_unused_exports(&file_graphs);
        
        // Calculate health score
        let health_score = self.calculate_health_score(&modules, &cycles);
        
        CouplingAnalysisResult {
            modules,
            cycles,
            hotspots,
            unused_exports,
            health_score,
            files_analyzed: file_graphs.len(),
            duration_ms: start.elapsed().as_millis() as u64,
        }
    }
    
    /// Build file graph from AST-parsed data (no regex needed - tree-sitter handles it)
    fn build_file_graph_from_ast(&mut self, file: &str) -> Option<FileGraph> {
        let source = std::fs::read_to_string(file).ok()?;
        
        // Use tree-sitter AST parsing - imports/exports already extracted
        let result: ParseResult = self.parser.parse_file(file, &source)?;
        
        let mut graph = FileGraph {
            path: file.to_string(),
            imports: Vec::new(),
            exports: Vec::new(),
        };
        
        // Imports come directly from AST parsing
        for import in result.imports {
            let source_path = self.resolve_import(&import.source, file);
            graph.imports.push(ImportEdge {
                source: source_path,
                symbols: import.named,
                line: import.range.start.line,
            });
        }
        
        // Exports come directly from AST parsing
        for export in result.exports {
            graph.exports.push(ExportNode {
                name: export.name,
                line: export.range.start.line,
                is_default: export.is_default,
            });
        }
        
        // Exported functions/classes from AST
        for func in result.functions {
            if func.is_exported {
                graph.exports.push(ExportNode {
                    name: func.name,
                    line: func.range.start.line,
                    is_default: false,
                });
            }
        }
        
        for class in result.classes {
            if class.is_exported {
                graph.exports.push(ExportNode {
                    name: class.name,
                    line: class.range.start.line,
                    is_default: false,
                });
            }
        }
        
        Some(graph)
    }
    
    fn resolve_import(&self, source: &str, from_file: &str) -> String {
        // Skip external packages
        if !source.starts_with('.') && !source.starts_with('/') {
            return source.to_string();
        }
        
        // Resolve relative path
        let from_dir = Path::new(from_file).parent().unwrap_or(Path::new(""));
        let resolved = from_dir.join(source);
        
        // Normalize path
        resolved.to_string_lossy().to_string()
    }
    
    fn build_module_map(&self, file_graphs: &HashMap<String, FileGraph>) -> HashMap<String, Vec<String>> {
        let mut module_map: HashMap<String, Vec<String>> = HashMap::new();
        
        for file in file_graphs.keys() {
            let module = Path::new(file)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| ".".to_string());
            
            module_map.entry(module).or_default().push(file.clone());
        }
        
        module_map
    }
    
    fn calculate_module_metrics(
        &self,
        file_graphs: &HashMap<String, FileGraph>,
        module_map: &HashMap<String, Vec<String>>,
    ) -> Vec<ModuleMetrics> {
        let mut metrics = Vec::new();
        
        for (module, files) in module_map {
            // Calculate afferent coupling (who depends on this module)
            let mut ca_set: HashSet<String> = HashSet::new();
            // Calculate efferent coupling (what this module depends on)
            let mut ce_set: HashSet<String> = HashSet::new();
            
            for file in files {
                if let Some(graph) = file_graphs.get(file) {
                    // Efferent: imports from this file
                    for import in &graph.imports {
                        let import_module = Path::new(&import.source)
                            .parent()
                            .map(|p| p.to_string_lossy().to_string())
                            .unwrap_or_else(|| ".".to_string());
                        
                        if &import_module != module {
                            ce_set.insert(import_module);
                        }
                    }
                }
            }
            
            // Afferent: other modules importing from this module
            for (other_module, other_files) in module_map {
                if other_module == module {
                    continue;
                }
                
                for other_file in other_files {
                    if let Some(graph) = file_graphs.get(other_file) {
                        for import in &graph.imports {
                            let import_module = Path::new(&import.source)
                                .parent()
                                .map(|p| p.to_string_lossy().to_string())
                                .unwrap_or_else(|| ".".to_string());
                            
                            if &import_module == module {
                                ca_set.insert(other_module.clone());
                            }
                        }
                    }
                }
            }
            
            let ca = ca_set.len();
            let ce = ce_set.len();
            
            // Instability: Ce / (Ca + Ce)
            let instability = if ca + ce > 0 {
                ce as f32 / (ca + ce) as f32
            } else {
                0.0
            };
            
            // Abstractness: simplified - count interfaces/abstract classes
            // For now, use 0.0 as we'd need deeper analysis
            let abstractness = 0.0;
            
            // Distance from main sequence
            let distance = (abstractness + instability - 1.0).abs();
            
            metrics.push(ModuleMetrics {
                path: module.clone(),
                ca,
                ce,
                instability,
                abstractness,
                distance,
                files: files.clone(),
            });
        }
        
        // Sort by total coupling (descending)
        metrics.sort_by(|a, b| (b.ca + b.ce).cmp(&(a.ca + a.ce)));
        
        metrics
    }
    
    fn detect_cycles(
        &self,
        file_graphs: &HashMap<String, FileGraph>,
        module_map: &HashMap<String, Vec<String>>,
    ) -> Vec<DependencyCycle> {
        let mut cycles = Vec::new();
        let mut visited: HashSet<String> = HashSet::new();
        let mut rec_stack: HashSet<String> = HashSet::new();
        
        // Build module dependency graph
        let mut module_deps: HashMap<String, HashSet<String>> = HashMap::new();
        
        for (module, files) in module_map {
            let mut deps: HashSet<String> = HashSet::new();
            
            for file in files {
                if let Some(graph) = file_graphs.get(file) {
                    for import in &graph.imports {
                        let import_module = Path::new(&import.source)
                            .parent()
                            .map(|p| p.to_string_lossy().to_string())
                            .unwrap_or_else(|| ".".to_string());
                        
                        if &import_module != module && module_map.contains_key(&import_module) {
                            deps.insert(import_module);
                        }
                    }
                }
            }
            
            module_deps.insert(module.clone(), deps);
        }
        
        // DFS to find cycles
        for module in module_map.keys() {
            if !visited.contains(module) {
                let mut path = Vec::new();
                self.dfs_cycles(
                    module,
                    &module_deps,
                    &mut visited,
                    &mut rec_stack,
                    &mut path,
                    &mut cycles,
                    module_map,
                );
            }
        }
        
        cycles
    }
    
    fn dfs_cycles(
        &self,
        node: &str,
        deps: &HashMap<String, HashSet<String>>,
        visited: &mut HashSet<String>,
        rec_stack: &mut HashSet<String>,
        path: &mut Vec<String>,
        cycles: &mut Vec<DependencyCycle>,
        module_map: &HashMap<String, Vec<String>>,
    ) {
        visited.insert(node.to_string());
        rec_stack.insert(node.to_string());
        path.push(node.to_string());
        
        if let Some(neighbors) = deps.get(node) {
            for neighbor in neighbors {
                if !visited.contains(neighbor) {
                    self.dfs_cycles(neighbor, deps, visited, rec_stack, path, cycles, module_map);
                } else if rec_stack.contains(neighbor) {
                    // Found a cycle
                    let cycle_start = path.iter().position(|n| n == neighbor).unwrap();
                    let cycle_modules: Vec<String> = path[cycle_start..].to_vec();
                    
                    let files_affected: usize = cycle_modules.iter()
                        .filter_map(|m| module_map.get(m))
                        .map(|files| files.len())
                        .sum();
                    
                    let severity = match cycle_modules.len() {
                        0..=2 => CycleSeverity::Info,
                        3..=4 => CycleSeverity::Warning,
                        _ => CycleSeverity::Critical,
                    };
                    
                    cycles.push(DependencyCycle {
                        modules: cycle_modules,
                        severity,
                        files_affected,
                    });
                }
            }
        }
        
        path.pop();
        rec_stack.remove(node);
    }
    
    fn find_hotspots(&self, modules: &[ModuleMetrics]) -> Vec<CouplingHotspot> {
        modules.iter()
            .filter(|m| m.ca + m.ce >= 3)
            .take(10)
            .map(|m| CouplingHotspot {
                module: m.path.clone(),
                total_coupling: m.ca + m.ce,
                incoming: Vec::new(), // Would need to track these during analysis
                outgoing: Vec::new(),
            })
            .collect()
    }
    
    fn find_unused_exports(&self, file_graphs: &HashMap<String, FileGraph>) -> Vec<UnusedExport> {
        // Build set of all imported symbols
        let mut imported_symbols: HashSet<(String, String)> = HashSet::new();
        
        for graph in file_graphs.values() {
            for import in &graph.imports {
                for symbol in &import.symbols {
                    imported_symbols.insert((import.source.clone(), symbol.clone()));
                }
            }
        }
        
        // Find exports that are never imported
        let mut unused = Vec::new();
        
        for (file, graph) in file_graphs {
            for export in &graph.exports {
                // Check if this export is imported anywhere
                let is_used = imported_symbols.iter()
                    .any(|(source, symbol)| {
                        source.contains(&graph.path) && symbol == &export.name
                    });
                
                if !is_used && !export.is_default {
                    unused.push(UnusedExport {
                        name: export.name.clone(),
                        file: file.clone(),
                        line: export.line,
                        export_type: "unknown".to_string(),
                    });
                }
            }
        }
        
        unused
    }
    
    fn calculate_health_score(&self, modules: &[ModuleMetrics], cycles: &[DependencyCycle]) -> f32 {
        let mut score: f32 = 100.0;
        
        // Penalize for cycles
        for cycle in cycles {
            match cycle.severity {
                CycleSeverity::Critical => score -= 15.0,
                CycleSeverity::Warning => score -= 8.0,
                CycleSeverity::Info => score -= 3.0,
            }
        }
        
        // Penalize for high coupling
        for module in modules {
            if module.ca + module.ce > 10 {
                score -= 2.0;
            }
            if module.distance > 0.7 {
                score -= 1.0;
            }
        }
        
        score.max(0.0).min(100.0)
    }
}

impl Default for CouplingAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_coupling_analyzer_creation() {
        let analyzer = CouplingAnalyzer::new();
        // Just verify it creates without panic
        assert!(true);
    }
}
