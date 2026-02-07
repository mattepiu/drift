//! Generation bindings: buildContext, trackOutcome.

use napi_derive::napi;
use serde_json::json;

use cortex_core::models::RetrievalContext;
use cortex_core::traits::IRetriever;
use cortex_retrieval::RetrievalEngine;

use crate::conversions::{error_types, search_types};
use crate::runtime;

/// Build a generation context with memories organized by budget allocation.
#[napi]
pub fn cortex_generation_build_context(
    focus: String,
    active_files: Option<Vec<String>>,
    budget: Option<i64>,
    sent_ids: Option<Vec<String>>,
) -> napi::Result<serde_json::Value> {
    let rt = runtime::get()?;
    let budget = budget.unwrap_or(4096) as usize;

    let context = RetrievalContext {
        focus,
        intent: None,
        active_files: active_files.unwrap_or_default(),
        budget,
        sent_ids: sent_ids.unwrap_or_default(),
    };

    // Retrieve and compress memories.
    let engine = RetrievalEngine::new(&rt.storage, &rt.compression, rt.config.retrieval.clone());
    let memories = engine
        .retrieve(&context, budget)
        .map_err(error_types::to_napi_error)?;

    let total_tokens: usize = memories.iter().map(|m| m.token_count).sum();
    let memories_json = search_types::compressed_memories_to_json(&memories)?;

    Ok(json!({
        "allocations": [{
            "category": "retrieval",
            "percentage": 1.0,
            "memories": memories_json,
            "tokens_used": total_tokens,
        }],
        "total_tokens": total_tokens,
        "total_budget": budget,
    }))
}

/// Track the outcome of a generation (for learning feedback loop).
#[napi]
pub fn cortex_generation_track_outcome(
    memory_ids: Vec<String>,
    _was_useful: bool,
    session_id: Option<String>,
) -> napi::Result<()> {
    let rt = runtime::get()?;

    // Record in session analytics if session is active.
    if let Some(sid) = &session_id {
        for mid in &memory_ids {
            rt.session.mark_memory_sent(sid, mid, 0);
        }
    }

    // If not useful, this could feed into the learning engine.
    // For now, we just record the signal.
    Ok(())
}
