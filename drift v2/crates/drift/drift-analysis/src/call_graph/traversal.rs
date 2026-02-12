//! Forward/inverse BFS on petgraph, entry point detection.

use std::collections::VecDeque;

use drift_core::types::collections::FxHashSet;
use petgraph::graph::NodeIndex;
use petgraph::Direction;

use crate::parsers::types::ParseResult;

use super::types::{CallGraph, FunctionNode};

/// Forward BFS from a starting node — find all functions reachable from `start`.
pub fn bfs_forward(graph: &CallGraph, start: NodeIndex, max_depth: Option<usize>) -> Vec<NodeIndex> {
    bfs_directed(graph, start, Direction::Outgoing, max_depth)
}

/// Inverse BFS from a starting node — find all callers that can reach `start`.
pub fn bfs_inverse(graph: &CallGraph, start: NodeIndex, max_depth: Option<usize>) -> Vec<NodeIndex> {
    bfs_directed(graph, start, Direction::Incoming, max_depth)
}

/// Generic BFS in a given direction.
fn bfs_directed(
    graph: &CallGraph,
    start: NodeIndex,
    direction: Direction,
    max_depth: Option<usize>,
) -> Vec<NodeIndex> {
    let mut visited = FxHashSet::default();
    let mut queue = VecDeque::new();
    let mut result = Vec::new();

    visited.insert(start);
    queue.push_back((start, 0usize));

    while let Some((node, depth)) = queue.pop_front() {
        if node != start {
            result.push(node);
        }

        if let Some(max) = max_depth {
            if depth >= max {
                continue;
            }
        }

        for neighbor in graph.graph.neighbors_directed(node, direction) {
            if visited.insert(neighbor) {
                queue.push_back((neighbor, depth + 1));
            }
        }
    }

    result
}

/// Detect and mark entry points in the call graph.
///
/// 5 heuristic categories:
/// 1. Exported functions
/// 2. Main/index file functions
/// 3. Route handlers
/// 4. Test functions
/// 5. CLI entry points
pub fn detect_entry_points(graph: &CallGraph) -> Vec<NodeIndex> {
    let mut entry_points = Vec::new();

    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        if is_entry_point(node) {
            entry_points.push(idx);
        }
    }

    entry_points
}

/// Mark entry points directly on the graph (mutable).
pub fn mark_entry_points(graph: &mut CallGraph, parse_results: &[ParseResult]) {
    // Build a set of route handler function names from decorators
    let mut route_handlers: FxHashSet<String> = FxHashSet::default();
    for pr in parse_results {
        // CG-EP-01: Check function-level decorators
        for func in &pr.functions {
            if has_entry_point_decorator(&func.decorators) {
                route_handlers.insert(format!("{}::{}", pr.file, func.name));
            }
        }
        // CG-EP-01: Check class-level decorators (controllers) and their methods
        for class in &pr.classes {
            let is_controller = class.decorators.iter().any(|d| {
                let dl = d.name.to_lowercase();
                dl.contains("controller") || dl.contains("api") || dl.contains("resolver")
            });
            for method in &class.methods {
                if has_entry_point_decorator(&method.decorators) || is_controller {
                    route_handlers.insert(format!("{}::{}", pr.file, method.name));
                }
            }
        }
    }

    let indices: Vec<NodeIndex> = graph.graph.node_indices().collect();
    for idx in indices {
        let node = &graph.graph[idx];
        let key = format!("{}::{}", node.file, node.name);
        let is_entry = is_entry_point(node) || route_handlers.contains(&key);
        if is_entry {
            if let Some(node_mut) = graph.graph.node_weight_mut(idx) {
                node_mut.is_entry_point = true;
            }
        }
    }
}

/// CG-EP-01: Check if decorators indicate an entry point (route handler, API endpoint, etc.).
fn has_entry_point_decorator(decorators: &[crate::parsers::types::DecoratorInfo]) -> bool {
    decorators.iter().any(|d| {
        let dl = d.name.to_lowercase();
        // HTTP route decorators
        dl.contains("route") || dl.contains("get") || dl.contains("post")
            || dl.contains("put") || dl.contains("delete") || dl.contains("patch")
            || dl.contains("head") || dl.contains("options")
            // Spring
            || dl.contains("requestmapping") || dl.contains("getmapping")
            || dl.contains("postmapping") || dl.contains("putmapping")
            || dl.contains("deletemapping") || dl.contains("patchmapping")
            // NestJS / general
            || dl.contains("controller") || dl.contains("api")
            || dl.contains("endpoint")
            // DRF
            || dl.contains("api_view")
            // Scheduled / event
            || dl.contains("scheduled") || dl.contains("eventlistener")
            || dl.contains("subscribe") || dl.contains("cron")
            // GraphQL (CG-EP-04)
            || dl.contains("query") || dl.contains("mutation")
            || dl.contains("subscription") || dl.contains("resolvefield")
            || dl.contains("resolver")
    })
}

/// Check if a function node is an entry point based on heuristics.
fn is_entry_point(node: &FunctionNode) -> bool {
    // 1. Exported functions (CG-EP-02)
    if node.is_exported {
        return true;
    }

    // 2. Main/index file functions (CG-EP-03: expanded patterns)
    let file_lower = node.file.to_lowercase();
    let name_lower = node.name.to_lowercase();
    if (file_lower.contains("main.") || file_lower.contains("index.")
        || file_lower.contains("app.") || file_lower.contains("server.")
        || file_lower.contains("boot.") || file_lower.contains("startup."))
        && matches!(name_lower.as_str(), "main" | "run" | "start" | "init" | "bootstrap"
            | "app" | "createapp" | "createserver" | "application" | "default")
    {
        return true;
    }

    // CG-EP-03: Framework main function patterns (any file)
    if matches!(node.name.as_str(), "main" | "createApp" | "createServer"
        | "Application" | "WebApplication" | "gin.Default") {
        return true;
    }

    // 3. Test functions
    if name_lower.starts_with("test_") || name_lower.starts_with("test")
        || name_lower.starts_with("it_") || name_lower.starts_with("spec_")
    {
        return true;
    }

    // 4. CLI entry points
    if matches!(node.name.as_str(), "cli" | "run_cli" | "parse_args") {
        return true;
    }

    // CG-EP-02: Go uppercase-exported functions
    if node.language == "Go" {
        if let Some(first_char) = node.name.chars().next() {
            if first_char.is_uppercase() {
                return true;
            }
        }
    }

    // CG-EP-02: Rust pub fn (is_exported covers this via visibility)
    // CG-EP-04: GraphQL resolver patterns
    if name_lower.starts_with("query") || name_lower.starts_with("mutation")
        || name_lower.starts_with("subscription") || name_lower.starts_with("resolve")
    {
        if let Some(ref qn) = node.qualified_name {
            let qn_lower = qn.to_lowercase();
            if qn_lower.contains("resolver") || qn_lower.contains("query")
                || qn_lower.contains("mutation") {
                return true;
            }
        }
    }

    false
}
