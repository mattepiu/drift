//! MultiAgentEngine — implements `IMultiAgentEngine`, orchestrates all submodules.

use std::sync::Arc;

use cortex_core::config::MultiAgentConfig;
use cortex_core::errors::CortexResult;
use cortex_core::models::agent::{AgentId, AgentRegistration, AgentStatus};
use cortex_core::models::cross_agent::AgentTrust;
use cortex_core::models::namespace::{MemoryProjection, NamespaceId, NamespacePermission};
use cortex_core::models::provenance::ProvenanceRecord;
use cortex_core::traits::IMultiAgentEngine;

use cortex_storage::pool::{ReadPool, WriteConnection};

use crate::namespace::NamespaceManager;
use crate::namespace::permissions::NamespacePermissionManager;
use crate::projection::ProjectionEngine;
use crate::registry::AgentRegistry;
use crate::share;

/// The main multi-agent engine. Orchestrates registry, namespace, projection,
/// and share operations. Holds references to the storage layer.
pub struct MultiAgentEngine {
    writer: Arc<WriteConnection>,
    #[allow(dead_code)]
    readers: Arc<ReadPool>,
    #[allow(dead_code)]
    config: MultiAgentConfig,
}

impl MultiAgentEngine {
    /// Create a new MultiAgentEngine with the given storage connections and config.
    pub fn new(
        writer: Arc<WriteConnection>,
        readers: Arc<ReadPool>,
        config: MultiAgentConfig,
    ) -> Self {
        Self {
            writer,
            readers,
            config,
        }
    }
}

impl IMultiAgentEngine for MultiAgentEngine {
    async fn register_agent(
        &self,
        name: &str,
        capabilities: Vec<String>,
    ) -> CortexResult<AgentRegistration> {
        self.writer
            .with_conn(|conn| AgentRegistry::register(conn, name, capabilities.clone()))
            .await
    }

    async fn deregister_agent(&self, agent_id: &AgentId) -> CortexResult<()> {
        let id = agent_id.clone();
        self.writer
            .with_conn(move |conn| AgentRegistry::deregister(conn, &id))
            .await
    }

    async fn get_agent(
        &self,
        agent_id: &AgentId,
    ) -> CortexResult<Option<AgentRegistration>> {
        let id = agent_id.clone();
        self.writer
            .with_conn(move |conn| AgentRegistry::get_agent(conn, &id))
            .await
    }

    async fn list_agents(
        &self,
        filter: Option<AgentStatus>,
    ) -> CortexResult<Vec<AgentRegistration>> {
        self.writer
            .with_conn(move |conn| AgentRegistry::list_agents(conn, filter.as_ref()))
            .await
    }

    async fn create_namespace(
        &self,
        namespace: NamespaceId,
        owner: &AgentId,
    ) -> CortexResult<NamespaceId> {
        let ns = namespace.clone();
        let own = owner.clone();
        self.writer
            .with_conn(move |conn| NamespaceManager::create_namespace(conn, &ns, &own))
            .await
    }

    async fn check_permission(
        &self,
        namespace: &NamespaceId,
        agent_id: &AgentId,
        permission: NamespacePermission,
    ) -> CortexResult<bool> {
        let ns = namespace.clone();
        let aid = agent_id.clone();
        self.writer
            .with_conn(move |conn| NamespacePermissionManager::check(conn, &ns, &aid, permission))
            .await
    }

    async fn share_memory(
        &self,
        memory_id: &str,
        target_namespace: &NamespaceId,
        agent_id: &AgentId,
    ) -> CortexResult<()> {
        let mid = memory_id.to_string();
        let ns = target_namespace.clone();
        let aid = agent_id.clone();
        self.writer
            .with_conn(move |conn| share::actions::share(conn, &mid, &ns, &aid))
            .await
    }

    async fn create_projection(
        &self,
        projection: MemoryProjection,
    ) -> CortexResult<String> {
        let proj = projection.clone();
        self.writer
            .with_conn(move |conn| ProjectionEngine::create_projection(conn, &proj))
            .await
    }

    // ── Phase C: Provenance, Trust, Sync ───────────────────────────────

    async fn sync_with(
        &self,
        source_agent: &AgentId,
        target_agent: &AgentId,
    ) -> CortexResult<()> {
        let src = source_agent.clone();
        let tgt = target_agent.clone();
        self.writer
            .with_conn(move |conn| {
                let mut clock = cortex_crdt::VectorClock::new();
                let result = crate::sync::DeltaSyncEngine::initiate_sync(
                    conn, &src, &tgt, &mut clock,
                )?;
                tracing::info!(
                    deltas_applied = result.deltas_applied,
                    deltas_buffered = result.deltas_buffered,
                    "sync complete"
                );
                Ok(())
            })
            .await
    }

    async fn get_provenance(
        &self,
        memory_id: &str,
    ) -> CortexResult<Option<ProvenanceRecord>> {
        let mid = memory_id.to_string();
        self.writer
            .with_conn(move |conn| crate::provenance::ProvenanceTracker::get_provenance(conn, &mid))
            .await
    }

    async fn get_trust(
        &self,
        agent_id: &AgentId,
        target_agent: &AgentId,
    ) -> CortexResult<AgentTrust> {
        let aid = agent_id.clone();
        let tgt = target_agent.clone();
        self.writer
            .with_conn(move |conn| crate::trust::TrustScorer::get_trust(conn, &aid, &tgt))
            .await
    }

    // ── Phase D stub ────────────────────────────────────────────────────

    async fn detect_consensus(
        &self,
        _namespace: &NamespaceId,
    ) -> CortexResult<Vec<(Vec<String>, f64)>> {
        if !self.config.enabled {
            return Ok(Vec::new());
        }

        // Phase D1: Consensus detection is now available via
        // cortex_multiagent::consolidation::ConsensusDetector.
        // The engine delegates to the detector with the appropriate
        // memories and similarity function.
        // For now, return empty — the full pipeline requires an embedding
        // engine which is injected at a higher level.
        Ok(Vec::new())
    }
}
