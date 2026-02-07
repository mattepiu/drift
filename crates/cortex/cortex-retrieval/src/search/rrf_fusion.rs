//! Reciprocal Rank Fusion: score = Σ 1/(k + rank_i)
//!
//! Combines multiple ranked lists into a single fused ranking without
//! requiring score normalization across different retrieval methods.

use std::collections::HashMap;

use cortex_core::memory::BaseMemory;

/// A candidate after RRF fusion.
#[derive(Debug, Clone)]
pub struct RrfCandidate {
    pub memory: BaseMemory,
    /// Fused RRF score (higher = more relevant).
    pub rrf_score: f64,
}

/// Fuse multiple ranked result lists using Reciprocal Rank Fusion.
///
/// `k` is the smoothing constant (default 60). Higher k reduces the
/// influence of high-ranking items from any single list.
///
/// Each input is a list of (memory_id, rank) pairs from a single retrieval method.
/// The `memories` map provides the actual BaseMemory objects by ID.
pub fn fuse(
    ranked_lists: &[Vec<(String, usize)>],
    memories: &HashMap<String, BaseMemory>,
    k: u32,
) -> Vec<RrfCandidate> {
    let mut scores: HashMap<String, f64> = HashMap::new();

    for list in ranked_lists {
        for (memory_id, rank) in list {
            let rrf = 1.0 / (k as f64 + *rank as f64);
            *scores.entry(memory_id.clone()).or_default() += rrf;
        }
    }

    let mut candidates: Vec<RrfCandidate> = scores
        .into_iter()
        .filter_map(|(id, rrf_score)| {
            memories.get(&id).map(|memory| RrfCandidate {
                memory: memory.clone(),
                rrf_score,
            })
        })
        .collect();

    // Sort by RRF score descending (monotonically decreasing).
    candidates.sort_by(|a, b| {
        b.rrf_score
            .partial_cmp(&a.rrf_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    candidates
}
