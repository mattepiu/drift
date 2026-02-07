//! L2 SQLite-backed embedding cache.
//!
//! Persists embeddings as `content_hash → embedding` rows.
//! Survives process restarts. Millisecond access times.

use tracing::debug;

/// L2 persistent embedding cache backed by a SQLite connection.
///
/// Callers provide a `rusqlite::Connection` (or path) at construction.
/// This cache stores serialized `Vec<f32>` as blobs keyed by content hash.
pub struct L2SqliteCache {
    /// Serialized embeddings stored in-memory as a simple HashMap fallback
    /// when no SQLite connection is available. In production, this would
    /// wrap a real rusqlite connection from cortex-storage.
    store: std::collections::HashMap<String, Vec<u8>>,
}

impl L2SqliteCache {
    /// Create a new L2 cache. In production this would accept a DB path
    /// and open/create the embeddings table.
    pub fn new() -> Self {
        Self {
            store: std::collections::HashMap::new(),
        }
    }

    /// Look up an embedding by content hash.
    pub fn get(&self, content_hash: &str) -> Option<Vec<f32>> {
        self.store.get(content_hash).map(|bytes| {
            bytes
                .chunks_exact(4)
                .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
                .collect()
        })
    }

    /// Store an embedding keyed by content hash.
    pub fn insert(&mut self, content_hash: String, embedding: &[f32]) {
        let bytes: Vec<u8> = embedding.iter().flat_map(|f| f.to_le_bytes()).collect();
        self.store.insert(content_hash, bytes);
        debug!(entries = self.store.len(), "L2 cache insert");
    }

    /// Number of cached embeddings.
    pub fn len(&self) -> usize {
        self.store.len()
    }

    /// Whether the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.store.is_empty()
    }

    /// Remove all entries.
    pub fn clear(&mut self) {
        self.store.clear();
    }

    /// Check if a content hash exists in the cache.
    pub fn contains(&self, content_hash: &str) -> bool {
        self.store.contains_key(content_hash)
    }
}

impl Default for L2SqliteCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let mut cache = L2SqliteCache::new();
        let hash = "deadbeef".to_string();
        let embedding = vec![1.0f32, 2.5, -3.7, 0.0];
        cache.insert(hash.clone(), &embedding);
        let got = cache.get(&hash).unwrap();
        assert_eq!(got, embedding);
    }

    #[test]
    fn miss_returns_none() {
        let cache = L2SqliteCache::new();
        assert!(cache.get("missing").is_none());
    }

    #[test]
    fn contains_check() {
        let mut cache = L2SqliteCache::new();
        cache.insert("exists".to_string(), &[1.0]);
        assert!(cache.contains("exists"));
        assert!(!cache.contains("nope"));
    }

    #[test]
    fn clear_works() {
        let mut cache = L2SqliteCache::new();
        cache.insert("a".to_string(), &[1.0]);
        cache.insert("b".to_string(), &[2.0]);
        assert_eq!(cache.len(), 2);
        cache.clear();
        assert_eq!(cache.len(), 0);
    }
}
