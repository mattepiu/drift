//! Multi-agent NAPI bindings: 12 functions exposing the full multi-agent API.
//!
//! Each function validates inputs, delegates to the `MultiAgentEngine`, and
//! converts results to JSON for TypeScript consumption.

use napi_derive::napi;
use tracing::debug;

use cortex_core::models::agent::{AgentId, AgentStatus};
use cortex_core::models::namespace::NamespaceId;
use cortex_core::traits::IMultiAgentEngine;

use crate::conversions::{error_types, multiagent_types};
use crate::runtime;

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Get the multi-agent engine from the runtime, constructing it on the fly.
fn get_engine() -> napi::Result<cortex_multiagent::MultiAgentEngine> {
    let rt = runtime::get()?;
    let config = rt.config.multiagent.clone();
    let (writer, readers) = open_multiagent_connections(&rt)?;
    Ok(cortex_multiagent::MultiAgentEngine::new(
        std::sync::Arc::new(writer),
        std::sync::Arc::new(readers),
        config,
    ))
}

/// Open write + read connections for multi-agent operations.
fn open_multiagent_connections(
    rt: &std::sync::Arc<runtime::CortexRuntime>,
) -> napi::Result<(
    cortex_storage::pool::WriteConnection,
    cortex_storage::pool::ReadPool,
)> {
    let db_path = rt.storage.pool().db_path.as_deref();
    match db_path {
        Some(path) => {
            let w = cortex_storage::pool::WriteConnection::open(path)
                .map_err(error_types::to_napi_error)?;
            let r = cortex_storage::pool::ReadPool::open(path, 2)
                .map_err(error_types::to_napi_error)?;
            Ok((w, r))
        }
        None => {
            let w = cortex_storage::pool::WriteConnection::open_in_memory()
                .map_err(error_types::to_napi_error)?;
            let r = cortex_storage::pool::ReadPool::open_in_memory(2)
                .map_err(error_types::to_napi_error)?;
            Ok((w, r))
        }
    }
}

/// Run an async closure on the tokio runtime, flattening CortexResult into napi::Result.
fn block_on<F, T>(future: F) -> napi::Result<T>
where
    F: std::future::Future<Output = cortex_core::errors::CortexResult<T>>,
{
    let handle = tokio::runtime::Handle::try_current().map_err(|_| {
        napi::Error::from_reason("No tokio runtime available for multi-agent operations")
    })?;
    handle.block_on(future).map_err(error_types::to_napi_error)
}

// ── 1. register_agent ────────────────────────────────────────────────────────

/// Register a new agent with the given name and capabilities.
#[napi]
pub fn cortex_multiagent_register_agent(
    name: String,
    capabilities: Vec<String>,
) -> napi::Result<serde_json::Value> {
    debug!(name = %name, capabilities = ?capabilities, "NAPI: register_agent");

    if name.trim().is_empty() {
        return Err(napi::Error::from_reason("Agent name must be non-empty"));
    }
    for cap in &capabilities {
        if cap.trim().is_empty() {
            return Err(napi::Error::from_reason(
                "Agent capabilities must be non-empty strings",
            ));
        }
    }

    let engine = get_engine()?;
    let registration = block_on(engine.register_agent(&name, capabilities))?;
    multiagent_types::agent_registration_to_json(&registration)
}

// ── 2. deregister_agent ──────────────────────────────────────────────────────

/// Deregister an agent by ID.
#[napi]
pub fn cortex_multiagent_deregister_agent(agent_id: String) -> napi::Result<()> {
    debug!(agent_id = %agent_id, "NAPI: deregister_agent");

    if agent_id.trim().is_empty() {
        return Err(napi::Error::from_reason("Agent ID must be non-empty"));
    }

    let engine = get_engine()?;
    let aid = AgentId::from(agent_id.as_str());
    block_on(engine.deregister_agent(&aid))
}

// ── 3. get_agent ─────────────────────────────────────────────────────────────

/// Get an agent by ID. Returns null if not found.
#[napi]
pub fn cortex_multiagent_get_agent(agent_id: String) -> napi::Result<serde_json::Value> {
    debug!(agent_id = %agent_id, "NAPI: get_agent");

    if agent_id.trim().is_empty() {
        return Err(napi::Error::from_reason("Agent ID must be non-empty"));
    }

    let engine = get_engine()?;
    let aid = AgentId::from(agent_id.as_str());
    let result = block_on(engine.get_agent(&aid))?;

    match result {
        Some(reg) => multiagent_types::agent_registration_to_json(&reg),
        None => Ok(serde_json::Value::Null),
    }
}

// ── 4. list_agents ───────────────────────────────────────────────────────────

/// List agents, optionally filtered by status.
#[napi]
pub fn cortex_multiagent_list_agents(
    status_filter: Option<String>,
) -> napi::Result<serde_json::Value> {
    debug!(status_filter = ?status_filter, "NAPI: list_agents");

    let filter: Option<AgentStatus> = match status_filter.as_deref() {
        Some("active") => Some(AgentStatus::Active),
        Some("idle") => Some(AgentStatus::Idle { since: chrono::Utc::now() }),
        Some("deregistered") => Some(AgentStatus::Deregistered { at: chrono::Utc::now() }),
        Some(other) => {
            return Err(napi::Error::from_reason(format!(
                "Invalid status filter '{other}'. Expected: active, idle, deregistered"
            )));
        }
        None => None,
    };

    let engine = get_engine()?;
    let agents = block_on(engine.list_agents(filter))?;
    multiagent_types::agent_registrations_to_json(&agents)
}

// ── 5. create_namespace ──────────────────────────────────────────────────────

/// Create a new namespace.
#[napi]
pub fn cortex_multiagent_create_namespace(
    scope: String,
    name: String,
    owner: String,
) -> napi::Result<String> {
    debug!(scope = %scope, name = %name, owner = %owner, "NAPI: create_namespace");

    if name.trim().is_empty() {
        return Err(napi::Error::from_reason("Namespace name must be non-empty"));
    }
    if owner.trim().is_empty() {
        return Err(napi::Error::from_reason("Namespace owner must be non-empty"));
    }

    let uri = format!("{scope}://{name}/");
    let namespace = NamespaceId::parse(&uri)
        .map_err(|e| napi::Error::from_reason(format!("Invalid namespace: {e}")))?;

    let owner_id = AgentId::from(owner.as_str());
    let engine = get_engine()?;
    let ns = block_on(engine.create_namespace(namespace, &owner_id))?;
    Ok(ns.to_uri())
}

// ── 6. share_memory ──────────────────────────────────────────────────────────

/// Share a memory to a target namespace.
#[napi]
pub fn cortex_multiagent_share_memory(
    memory_id: String,
    target_namespace: String,
    agent_id: String,
) -> napi::Result<serde_json::Value> {
    debug!(memory_id = %memory_id, target_namespace = %target_namespace, agent_id = %agent_id, "NAPI: share_memory");

    if memory_id.trim().is_empty() {
        return Err(napi::Error::from_reason("Memory ID must be non-empty"));
    }
    if agent_id.trim().is_empty() {
        return Err(napi::Error::from_reason("Agent ID must be non-empty"));
    }

    let ns = NamespaceId::parse(&target_namespace)
        .map_err(|e| napi::Error::from_reason(format!("Invalid target namespace: {e}")))?;
    let aid = AgentId::from(agent_id.as_str());

    let engine = get_engine()?;
    block_on(engine.share_memory(&memory_id, &ns, &aid))?;

    // Return a provenance hop representing the share action.
    let hop = cortex_core::models::provenance::ProvenanceHop {
        agent_id: aid,
        action: cortex_core::models::provenance::ProvenanceAction::SharedTo,
        timestamp: chrono::Utc::now(),
        confidence_delta: 0.0,
    };
    multiagent_types::provenance_hop_to_json(&hop)
}

// ── 7. create_projection ─────────────────────────────────────────────────────

/// Create a memory projection between namespaces.
#[napi]
pub fn cortex_multiagent_create_projection(
    config_json: serde_json::Value,
) -> napi::Result<String> {
    debug!("NAPI: create_projection");

    let projection: cortex_core::models::namespace::MemoryProjection =
        serde_json::from_value(config_json)
            .map_err(|e| napi::Error::from_reason(format!("Invalid projection config: {e}")))?;

    let engine = get_engine()?;
    let projection_id = block_on(engine.create_projection(projection))?;
    Ok(projection_id)
}

// ── 8. retract_memory ────────────────────────────────────────────────────────

/// Retract (tombstone) a memory in a namespace.
#[napi]
pub fn cortex_multiagent_retract_memory(
    memory_id: String,
    namespace: String,
    agent_id: String,
) -> napi::Result<()> {
    debug!(memory_id = %memory_id, namespace = %namespace, agent_id = %agent_id, "NAPI: retract_memory");

    if memory_id.trim().is_empty() {
        return Err(napi::Error::from_reason("Memory ID must be non-empty"));
    }
    if agent_id.trim().is_empty() {
        return Err(napi::Error::from_reason("Agent ID must be non-empty"));
    }

    let ns = NamespaceId::parse(&namespace)
        .map_err(|e| napi::Error::from_reason(format!("Invalid namespace: {e}")))?;
    let aid = AgentId::from(agent_id.as_str());

    // Open a direct connection for the retract operation.
    let rt = runtime::get()?;
    let db_path = rt.storage.pool().db_path.as_deref();
    let conn = match db_path {
        Some(path) => rusqlite::Connection::open(path)
            .map_err(|e| napi::Error::from_reason(format!("Failed to open DB for retract: {e}")))?,
        None => rusqlite::Connection::open_in_memory()
            .map_err(|e| napi::Error::from_reason(format!("Failed to open in-memory DB: {e}")))?,
    };

    cortex_multiagent::share::actions::retract(&conn, &memory_id, &ns, &aid)
        .map_err(error_types::to_napi_error)
}

// ── 9. get_provenance ────────────────────────────────────────────────────────

/// Get the full provenance record for a memory.
#[napi]
pub fn cortex_multiagent_get_provenance(memory_id: String) -> napi::Result<serde_json::Value> {
    debug!(memory_id = %memory_id, "NAPI: get_provenance");

    if memory_id.trim().is_empty() {
        return Err(napi::Error::from_reason("Memory ID must be non-empty"));
    }

    let engine = get_engine()?;
    let result = block_on(engine.get_provenance(&memory_id))?;

    match result {
        Some(record) => multiagent_types::provenance_record_to_json(&record),
        None => Ok(serde_json::Value::Null),
    }
}

// ── 10. trace_cross_agent ────────────────────────────────────────────────────

/// Trace causal relationships across agent boundaries.
#[napi]
pub fn cortex_multiagent_trace_cross_agent(
    memory_id: String,
    max_depth: i64,
) -> napi::Result<serde_json::Value> {
    debug!(memory_id = %memory_id, max_depth, "NAPI: trace_cross_agent");

    if memory_id.trim().is_empty() {
        return Err(napi::Error::from_reason("Memory ID must be non-empty"));
    }
    if max_depth < 1 {
        return Err(napi::Error::from_reason("max_depth must be at least 1"));
    }

    let rt = runtime::get()?;
    let graph_arc = rt.causal.graph().shared();
    let graph_guard = graph_arc.read().map_err(|e| {
        napi::Error::from_reason(format!("Failed to acquire causal graph lock: {e}"))
    })?;
    let trace = cortex_causal::graph::cross_agent::trace_cross_agent(
        &graph_guard,
        &memory_id,
        max_depth as usize,
    )
    .map_err(error_types::to_napi_error)?;

    let napi_trace = multiagent_types::NapiCrossAgentTrace {
        path: trace
            .hops
            .iter()
            .map(|hop| multiagent_types::NapiCrossAgentHop {
                agent_id: hop
                    .source_agent
                    .as_ref()
                    .map(|a| a.0.clone())
                    .unwrap_or_default(),
                memory_id: hop.memory_id.clone(),
                confidence: hop.strength,
            })
            .collect(),
    };
    multiagent_types::cross_agent_trace_to_json(&napi_trace)
}

// ── 11. get_trust ────────────────────────────────────────────────────────────

/// Get trust scores for an agent, optionally toward a specific target.
#[napi]
pub fn cortex_multiagent_get_trust(
    agent_id: String,
    target_agent: Option<String>,
) -> napi::Result<serde_json::Value> {
    debug!(agent_id = %agent_id, target_agent = ?target_agent, "NAPI: get_trust");

    if agent_id.trim().is_empty() {
        return Err(napi::Error::from_reason("Agent ID must be non-empty"));
    }

    let aid = AgentId::from(agent_id.as_str());
    let target = target_agent.as_deref().unwrap_or("default");

    if target.trim().is_empty() {
        return Err(napi::Error::from_reason(
            "Target agent must be non-empty when provided",
        ));
    }

    let target_id = AgentId::from(target);
    let engine = get_engine()?;
    let trust = block_on(engine.get_trust(&aid, &target_id))?;
    multiagent_types::agent_trust_to_json(&trust)
}

// ── 12. sync_agents ──────────────────────────────────────────────────────────

/// Synchronize memory state between two agents via delta sync.
#[napi]
pub fn cortex_multiagent_sync_agents(
    source_agent: String,
    target_agent: String,
) -> napi::Result<serde_json::Value> {
    debug!(source_agent = %source_agent, target_agent = %target_agent, "NAPI: sync_agents");

    if source_agent.trim().is_empty() {
        return Err(napi::Error::from_reason("Source agent ID must be non-empty"));
    }
    if target_agent.trim().is_empty() {
        return Err(napi::Error::from_reason("Target agent ID must be non-empty"));
    }

    let src = AgentId::from(source_agent.as_str());
    let tgt = AgentId::from(target_agent.as_str());

    let engine = get_engine()?;
    block_on(engine.sync_with(&src, &tgt))?;

    let result = multiagent_types::NapiSyncResult {
        applied_count: 0,
        buffered_count: 0,
        errors: vec![],
    };
    multiagent_types::sync_result_to_json(&result)
}
