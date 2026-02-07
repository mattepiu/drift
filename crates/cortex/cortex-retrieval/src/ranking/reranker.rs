//! Optional cross-encoder re-ranking via ort, falls back to scorer.
//!
//! Since cross-encoder models require ONNX runtime and a specific model,
//! this module provides a no-op passthrough by default. When a cross-encoder
//! model is available, it re-scores the top-K candidates for precision.

use crate::ranking::scorer::ScoredCandidate;

/// Re-rank the top-K scored candidates.
///
/// Currently a passthrough — cross-encoder re-ranking is a future enhancement.
/// The scorer's 8-factor ranking is already high quality for most use cases.
pub fn rerank(candidates: Vec<ScoredCandidate>, _top_k: usize) -> Vec<ScoredCandidate> {
    // Future: load cross-encoder ONNX model, compute pairwise scores,
    // re-sort top_k candidates. For now, the multi-factor scorer is sufficient.
    candidates
}
