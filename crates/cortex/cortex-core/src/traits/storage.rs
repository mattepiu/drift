use crate::errors::CortexResult;
use crate::memory::{
    BaseMemory, ConstraintLink, FileLink, FunctionLink, Importance, MemoryType, PatternLink,
    RelationshipEdge, RelationshipType,
};
use chrono::{DateTime, Utc};

/// Full CRUD + bulk + query + vector + bitemporal + relationships + links + aggregation + maintenance.
pub trait IMemoryStorage: Send + Sync {
    // --- CRUD ---
    fn create(&self, memory: &BaseMemory) -> CortexResult<()>;
    fn get(&self, id: &str) -> CortexResult<Option<BaseMemory>>;
    fn update(&self, memory: &BaseMemory) -> CortexResult<()>;
    fn delete(&self, id: &str) -> CortexResult<()>;

    // --- Bulk ---
    fn create_bulk(&self, memories: &[BaseMemory]) -> CortexResult<usize>;
    fn get_bulk(&self, ids: &[String]) -> CortexResult<Vec<BaseMemory>>;

    // --- Query ---
    fn query_by_type(&self, memory_type: MemoryType) -> CortexResult<Vec<BaseMemory>>;
    fn query_by_importance(&self, min: Importance) -> CortexResult<Vec<BaseMemory>>;
    fn query_by_confidence_range(&self, min: f64, max: f64) -> CortexResult<Vec<BaseMemory>>;
    fn query_by_date_range(
        &self,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> CortexResult<Vec<BaseMemory>>;
    fn query_by_tags(&self, tags: &[String]) -> CortexResult<Vec<BaseMemory>>;

    // --- Search ---
    fn search_fts5(&self, query: &str, limit: usize) -> CortexResult<Vec<BaseMemory>>;
    fn search_vector(
        &self,
        embedding: &[f32],
        limit: usize,
    ) -> CortexResult<Vec<(BaseMemory, f64)>>;

    // --- Relationships ---
    fn get_relationships(
        &self,
        memory_id: &str,
        rel_type: Option<RelationshipType>,
    ) -> CortexResult<Vec<RelationshipEdge>>;
    fn add_relationship(&self, edge: &RelationshipEdge) -> CortexResult<()>;
    fn remove_relationship(&self, source_id: &str, target_id: &str) -> CortexResult<()>;

    // --- Links ---
    fn add_pattern_link(&self, memory_id: &str, link: &PatternLink) -> CortexResult<()>;
    fn add_constraint_link(&self, memory_id: &str, link: &ConstraintLink) -> CortexResult<()>;
    fn add_file_link(&self, memory_id: &str, link: &FileLink) -> CortexResult<()>;
    fn add_function_link(&self, memory_id: &str, link: &FunctionLink) -> CortexResult<()>;

    // --- Aggregation ---
    fn count_by_type(&self) -> CortexResult<Vec<(MemoryType, usize)>>;
    fn average_confidence(&self) -> CortexResult<f64>;
    fn stale_count(&self, threshold_days: u64) -> CortexResult<usize>;

    // --- Maintenance ---
    fn vacuum(&self) -> CortexResult<()>;
}
