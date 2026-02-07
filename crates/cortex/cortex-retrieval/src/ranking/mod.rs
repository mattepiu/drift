//! RankingPipeline: score → rerank → deduplicate.

pub mod deduplication;
pub mod reranker;
pub mod scorer;

use cortex_core::intent::Intent;

use crate::intent::IntentEngine;
use crate::search::rrf_fusion::RrfCandidate;

use scorer::{ScoredCandidate, ScorerWeights};

/// Full ranking pipeline: multi-factor scoring → optional re-ranking → deduplication.
pub struct RankingPipeline {
    weights: ScorerWeights,
    rerank_top_k: usize,
}

impl RankingPipeline {
    pub fn new(rerank_top_k: usize) -> Self {
        Self {
            weights: ScorerWeights::default(),
            rerank_top_k,
        }
    }

    /// Run the full ranking pipeline on RRF candidates.
    pub fn rank(
        &self,
        candidates: &[RrfCandidate],
        intent: Intent,
        active_files: &[String],
        sent_ids: &[String],
        intent_engine: &IntentEngine,
    ) -> Vec<ScoredCandidate> {
        // Stage 1: Multi-factor scoring.
        let scored = scorer::score(candidates, intent, active_files, intent_engine, &self.weights);

        // Stage 2: Optional cross-encoder re-ranking.
        let reranked = reranker::rerank(scored, self.rerank_top_k);

        // Stage 3: Session-aware deduplication.
        deduplication::deduplicate(reranked, sent_ids)
    }
}

impl Default for RankingPipeline {
    fn default() -> Self {
        Self::new(20)
    }
}
