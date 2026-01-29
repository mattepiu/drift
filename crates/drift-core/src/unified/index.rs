//! Memory-Mapped Resolution Index
//!
//! High-performance function resolution without intermediate files.
//! Build and resolve in the same pass - no NDJSON I/O overhead.

use std::collections::BTreeMap;
use rustc_hash::FxHashMap;
use smallvec::SmallVec;

use super::interner::{Symbol, PathInterner, FunctionInterner};

/// Unique function identifier
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct FunctionId(u32);

impl FunctionId {
    pub fn new(id: u32) -> Self {
        Self(id)
    }
    
    pub fn index(self) -> u32 {
        self.0
    }
}

/// Resolution result for a function call
#[derive(Debug, Clone)]
pub enum Resolution {
    /// Resolved to a single function
    Resolved(ResolvedFunction),
    /// Multiple candidates found
    Ambiguous(Vec<ResolvedFunction>),
    /// Could not resolve
    Unresolved,
}

/// A resolved function reference
#[derive(Debug, Clone)]
pub struct ResolvedFunction {
    pub id: FunctionId,
    pub name: Symbol,
    pub file: Symbol,
    pub line: u32,
    pub is_exported: bool,
}


/// Function entry in the index
#[derive(Debug, Clone)]
pub struct FunctionEntry {
    pub id: FunctionId,
    pub name: Symbol,
    pub qualified_name: Option<Symbol>,
    pub file: Symbol,
    pub line: u32,
    pub is_exported: bool,
    pub is_async: bool,
}

/// Memory-efficient resolution index
/// 
/// Uses B-tree for ordered name lookups and hash map for ID lookups.
/// SmallVec avoids heap allocation for common case of 1-4 functions per name.
pub struct ResolutionIndex {
    /// Map from function name to function IDs
    /// B-tree provides ordered iteration and efficient prefix search
    name_index: BTreeMap<Symbol, SmallVec<[FunctionId; 4]>>,
    
    /// Map from function ID to entry
    entries: FxHashMap<FunctionId, FunctionEntry>,
    
    /// Map from file to functions defined in it
    file_index: FxHashMap<Symbol, Vec<FunctionId>>,
    
    /// String interners
    path_interner: PathInterner,
    func_interner: FunctionInterner,
    
    /// Next function ID
    next_id: u32,
}

impl ResolutionIndex {
    /// Create a new resolution index
    pub fn new() -> Self {
        Self {
            name_index: BTreeMap::new(),
            entries: FxHashMap::default(),
            file_index: FxHashMap::default(),
            path_interner: PathInterner::new(),
            func_interner: FunctionInterner::new(),
            next_id: 0,
        }
    }
    
    /// Insert a function into the index
    /// 
    /// Called during parsing - no separate build phase needed.
    pub fn insert(
        &mut self,
        name: &str,
        qualified_name: Option<&str>,
        file: &str,
        line: u32,
        is_exported: bool,
        is_async: bool,
    ) -> FunctionId {
        let id = FunctionId::new(self.next_id);
        self.next_id += 1;
        
        let name_sym = self.func_interner.intern(name);
        let qualified_sym = qualified_name.map(|q| self.func_interner.intern(q));
        let file_sym = self.path_interner.intern_path(file);
        
        let entry = FunctionEntry {
            id,
            name: name_sym,
            qualified_name: qualified_sym,
            file: file_sym,
            line,
            is_exported,
            is_async,
        };
        
        // Add to name index
        self.name_index
            .entry(name_sym)
            .or_default()
            .push(id);
        
        // Add qualified name if present
        if let Some(q) = qualified_sym {
            self.name_index
                .entry(q)
                .or_default()
                .push(id);
        }
        
        // Add to file index
        self.file_index
            .entry(file_sym)
            .or_default()
            .push(id);
        
        // Store entry
        self.entries.insert(id, entry);
        
        id
    }

    
    /// Resolve a function call
    /// 
    /// Attempts to find the target function, preferring:
    /// 1. Same-file definitions
    /// 2. Exported functions
    /// 3. Exact name matches
    pub fn resolve(&self, name: &str, caller_file: &str) -> Resolution {
        // Find the name symbol by iterating (read-only)
        let name_sym = match self.get_name_symbol(name) {
            Some(s) => s,
            None => return Resolution::Unresolved,
        };
        
        let candidates = match self.name_index.get(&name_sym) {
            Some(ids) => ids,
            None => return Resolution::Unresolved,
        };
        
        if candidates.is_empty() {
            return Resolution::Unresolved;
        }
        
        // Get caller file symbol
        let caller_file_sym = self.get_path_symbol(caller_file);
        
        // Collect resolved functions
        let mut resolved: Vec<ResolvedFunction> = candidates
            .iter()
            .filter_map(|&id| {
                let entry = self.entries.get(&id)?;
                Some(ResolvedFunction {
                    id,
                    name: entry.name,
                    file: entry.file,
                    line: entry.line,
                    is_exported: entry.is_exported,
                })
            })
            .collect();
        
        if resolved.is_empty() {
            return Resolution::Unresolved;
        }
        
        if resolved.len() == 1 {
            return Resolution::Resolved(resolved.remove(0));
        }
        
        // Prefer same-file resolution
        if let Some(caller_sym) = caller_file_sym {
            if let Some(idx) = resolved.iter().position(|r| r.file == caller_sym) {
                return Resolution::Resolved(resolved.remove(idx));
            }
        }
        
        // Prefer exported functions
        let exported: Vec<_> = resolved.iter()
            .filter(|r| r.is_exported)
            .cloned()
            .collect();
        
        if exported.len() == 1 {
            return Resolution::Resolved(exported.into_iter().next().unwrap());
        }
        
        // Ambiguous - return all candidates
        Resolution::Ambiguous(resolved)
    }
    
    /// Get a function entry by ID
    pub fn get(&self, id: FunctionId) -> Option<&FunctionEntry> {
        self.entries.get(&id)
    }
    
    /// Get all functions in a file
    pub fn get_file_functions(&self, file: &str) -> Vec<&FunctionEntry> {
        let file_sym = match self.get_path_symbol(file) {
            Some(s) => s,
            None => return Vec::new(),
        };
        
        self.file_index
            .get(&file_sym)
            .map(|ids| {
                ids.iter()
                    .filter_map(|id| self.entries.get(id))
                    .collect()
            })
            .unwrap_or_default()
    }
    
    /// Get the number of indexed functions
    pub fn len(&self) -> usize {
        self.entries.len()
    }
    
    /// Check if the index is empty
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
    
    /// Get index statistics
    pub fn stats(&self) -> IndexStats {
        let unique_names = self.name_index.len();
        let total_functions = self.entries.len();
        let files = self.file_index.len();
        let exported = self.entries.values().filter(|e| e.is_exported).count();
        
        IndexStats {
            unique_names,
            total_functions,
            files,
            exported_functions: exported,
        }
    }
    
    // Helper to get name symbol without mutating
    fn get_name_symbol(&self, name: &str) -> Option<Symbol> {
        // This is a workaround - in production we'd use a concurrent interner
        for (sym, _) in &self.name_index {
            if let Some(resolved) = self.func_interner.resolve(*sym) {
                if resolved == name {
                    return Some(*sym);
                }
            }
        }
        None
    }
    
    // Helper to get path symbol without mutating
    fn get_path_symbol(&self, path: &str) -> Option<Symbol> {
        for (sym, _) in &self.file_index {
            if let Some(resolved) = self.path_interner.resolve(*sym) {
                if resolved == path || resolved == path.replace('\\', "/") {
                    return Some(*sym);
                }
            }
        }
        None
    }
}

impl Default for ResolutionIndex {
    fn default() -> Self {
        Self::new()
    }
}

/// Index statistics
#[derive(Debug, Clone)]
pub struct IndexStats {
    pub unique_names: usize,
    pub total_functions: usize,
    pub files: usize,
    pub exported_functions: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_insert_and_resolve() {
        let mut index = ResolutionIndex::new();
        
        let id1 = index.insert("myFunction", None, "src/utils.ts", 10, true, false);
        let id2 = index.insert("myFunction", None, "src/helpers.ts", 20, false, false);
        
        // Should resolve to exported function
        match index.resolve("myFunction", "src/main.ts") {
            Resolution::Resolved(r) => {
                assert_eq!(r.id, id1);
                assert!(r.is_exported);
            }
            _ => panic!("Expected resolved"),
        }
    }
    
    #[test]
    fn test_same_file_preference() {
        let mut index = ResolutionIndex::new();
        
        index.insert("helper", None, "src/utils.ts", 10, true, false);
        let id2 = index.insert("helper", None, "src/main.ts", 20, false, false);
        
        // Should prefer same-file resolution
        match index.resolve("helper", "src/main.ts") {
            Resolution::Resolved(r) => {
                assert_eq!(r.id, id2);
            }
            _ => panic!("Expected resolved"),
        }
    }
    
    #[test]
    fn test_unresolved() {
        let index = ResolutionIndex::new();
        
        match index.resolve("nonexistent", "src/main.ts") {
            Resolution::Unresolved => {}
            _ => panic!("Expected unresolved"),
        }
    }
}
